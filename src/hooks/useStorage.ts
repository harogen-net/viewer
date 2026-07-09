import { useSensitivePassword } from "@/hooks/useSensitivePassword";
import { useImageLibraryStore } from "@/state/imageLibraryStore";
import type { ViewerDocument } from "@/types/ViewerDocument";
import { DateUtil } from "@/utils/DateUtil";
import {
	type EncryptedImageData,
	decryptImageData,
	encryptImageData,
} from "@/utils/sensitiveCrypto";
import { collectReferencedImages, parseHvd, serializeHvd } from "@/utils/storageCodec";
import { useCallback } from "react";

// HVD IDB アクセス + codec を統合した React 向けストレージ API hook
// (v3 Group B build 3、§0-10 新側内製)。
// レガシー src/utils/SlideStorage.ts (EventDispatcher class シングルトン) を
// 1 ファイル / 1 hook で完全代替。
//
// IDB スキーマ:
//   DB:    "viewer" (version 2)
//   store: "slideTitles"     {id, title, update} (id autoIncrement) … レガシー互換、一覧用
//   store: "slideData"       {title, data: HVD JSON string}          … レガシー互換、本体
//   store: "slideThumbnails" {title, thumb: dataURL}  (v2 で追加)     … ビジュアルピッカー用
//
// slideThumbnails は「見た目で保存ドキュメントを選ぶ」ギャラリー用。slideTitles を軽量に
// 保ち、サムネはギャラリー表示時にまとめ読み (loadThumbnails)。IDB に JOIN は無いので
// title をキーに JS 側でマージする。サムネ未生成の doc は単に欠落 (UI 側で n/a 表示)。
//
// 副作用: load 系は imageLibraryStore に画像 dataURL を投入する。
// viewerDocumentStore / slideStore の更新は caller (AppShell 等) の責務。

const DB_NAME = "viewer";
const DB_VERSION = 2;
const TITLES_STORE = "slideTitles";
const DATA_STORE = "slideData";
const THUMBS_STORE = "slideThumbnails";

export interface StoredSlideTitle {
	id: number;
	title: string;
	update: number;
	/** センシティブ文書か (ピッカーの 🔒 標示用)。旧レコードは undefined=非センシティブ扱い。 */
	isSensitive?: boolean;
}

interface StoredSlideData {
	title: string;
	data: string;
}

/** 連結サムネ (フィルムストリップ) + コマ数。表示側が 1 コマ幅算出/切替に使う。 */
export interface StoredDocThumbnail {
	thumb: string;
	frames: number;
}

// IDB 上の slideThumbnails レコード。frames は v2 初期の単一サムネ {title, thumb} には
// 無いため optional とし、読み出し時に frames=1 とみなす (後方互換)。
interface StoredThumbnail {
	title: string;
	thumb: string;
	frames?: number;
}

function openDb(): Promise<IDBDatabase> {
	return new Promise((resolve, reject) => {
		const req = indexedDB.open(DB_NAME, DB_VERSION);
		// v1→v2: slideThumbnails store を追加。各 createObjectStore は contains ガードで冪等
		// (新規作成・既存 DB のアップグレード両方で過不足なく揃う)。
		req.onupgradeneeded = () => {
			const db = req.result;
			if (!db.objectStoreNames.contains(TITLES_STORE)) {
				db.createObjectStore(TITLES_STORE, { keyPath: "id", autoIncrement: true });
			}
			if (!db.objectStoreNames.contains(DATA_STORE)) {
				db.createObjectStore(DATA_STORE, { keyPath: "title" });
			}
			if (!db.objectStoreNames.contains(THUMBS_STORE)) {
				db.createObjectStore(THUMBS_STORE, { keyPath: "title" });
			}
		};
		req.onsuccess = () => resolve(req.result);
		req.onerror = () => reject(req.error);
	});
}

function reqToPromise<T>(req: IDBRequest<T>): Promise<T> {
	return new Promise((resolve, reject) => {
		req.onsuccess = () => resolve(req.result);
		req.onerror = () => reject(req.error);
	});
}

function txComplete(tx: IDBTransaction): Promise<void> {
	return new Promise((resolve, reject) => {
		tx.oncomplete = () => resolve();
		tx.onerror = () => reject(tx.error);
		tx.onabort = () => reject(tx.error ?? new Error("transaction aborted"));
	});
}

/**
 * loadByTitle の結果。
 * - ok:       復号成功 (imageLibrary 投入済み)。doc を document store へ反映してよい。
 * - notfound: 該当データなし。
 * - locked:   センシティブ文書で PW 未入力/誤り。**ロードは中止**され store は未変更
 *             (画像なし文書を出さない)。警告モーダルは loadByTitle 内で表示済み。
 */
export type LoadResult =
	| { status: "ok"; doc: ViewerDocument }
	| { status: "notfound" }
	| { status: "locked" };

export interface StorageApi {
	/** タイトル一覧を取得 (未ソート)。 */
	listTitles: () => Promise<StoredSlideTitle[]>;
	/** タイトル指定でロード。ok 時のみ imageLibraryStore に画像が投入される。 */
	loadByTitle: (title: string) => Promise<LoadResult>;
	/**
	 * ViewerDocument を保存。override=false (default) なら日付ベースの新タイトル、
	 * override=true なら doc.title をそのまま使う (= 上書き保存)。
	 * editTime は呼び出し時刻で上書き (レガシー SlideStorage.save 互換挙動)。
	 * 戻り値の title は実際に保存された title (新規時は生成されたもの)。
	 */
	save: (
		doc: ViewerDocument,
		options?: { override?: boolean; thumbnail?: StoredDocThumbnail | null }
	) => Promise<{ title: string } | null>;
	/** タイトル指定で削除。該当なしも success 扱い。 */
	deleteByTitle: (title: string) => Promise<void>;
	/** 全サムネイルを {title: {thumb, frames}} で取得 (ビジュアルピッカー用)。未生成 title は欠落。 */
	loadThumbnails: () => Promise<Record<string, StoredDocThumbnail>>;
}

export function useStorage(): StorageApi {
	const { requirePassword, unlock } = useSensitivePassword();

	const listTitles = useCallback(async (): Promise<StoredSlideTitle[]> => {
		const db = await openDb();
		try {
			const records = (await reqToPromise(
				db.transaction(TITLES_STORE, "readonly").objectStore(TITLES_STORE).getAll()
			)) as StoredSlideTitle[];
			// 旧レコード (isSensitive 未記録) の backfill: 本体 slideData から一度だけ導出して一覧へ書く。
			// これで「今回の変更前に保存したセンシティブ文書」も再保存なしで 🔒 標示される。
			// full parse せず substring 判定 (serializeHvd は sensitive 時 `"isSensitive":true` を書く)。
			const unmigrated = records.filter((r) => r.isSensitive === undefined);
			if (unmigrated.length > 0) {
				const tx = db.transaction([TITLES_STORE, DATA_STORE], "readwrite");
				const titlesStore = tx.objectStore(TITLES_STORE);
				const dataStore = tx.objectStore(DATA_STORE);
				for (const r of unmigrated) {
					const entry = (await reqToPromise(dataStore.get(r.title))) as StoredSlideData | undefined;
					r.isSensitive = !!entry?.data?.includes('"isSensitive":true');
					await reqToPromise(titlesStore.put(r));
				}
				await txComplete(tx);
			}
			return records;
		} finally {
			db.close();
		}
	}, []);

	const loadByTitle = useCallback(
		async (title: string): Promise<LoadResult> => {
			const db = await openDb();
			let jsonStr: string | null = null;
			try {
				const tx = db.transaction(DATA_STORE, "readonly");
				const entry = (await reqToPromise(tx.objectStore(DATA_STORE).get(title))) as
					| StoredSlideData
					| undefined;
				jsonStr = entry?.data ?? null;
			} finally {
				db.close();
			}
			if (jsonStr == null) return { status: "notfound" };
			const parsed = parseHvd(jsonStr, title);
			if (parsed.encrypted) {
				// センシティブ: box の PW で復号を試す (= ロード前の軽い判定)。
				// 失敗/未入力は unlock が警告モーダルを出す。ここで locked を返し、
				// **画像なし文書を読み込まずに中止**する (store は一切触らない = 現文書維持)。
				const enc = parsed.encrypted;
				const imageData = await unlock((pw) => decryptImageData(enc, pw));
				if (imageData === null) return { status: "locked" };
				useImageLibraryStore.getState().setImageLibrary(imageData);
				return { status: "ok", doc: parsed.doc };
			}
			useImageLibraryStore.getState().setImageLibrary(parsed.imageData);
			return { status: "ok", doc: parsed.doc };
		},
		[unlock]
	);

	const save = useCallback(
		async (
			doc: ViewerDocument,
			options?: { override?: boolean; thumbnail?: StoredDocThumbnail | null }
		): Promise<{ title: string } | null> => {
			const title = options?.override ? doc.title : DateUtil.getDateString();
			const now = Date.now();
			// imageLibraryStore から imageId→dataURL 抽出 (Record<string, ImageEntry> → Record<string, string>)
			const imageMap: Record<string, string> = {};
			const library = useImageLibraryStore.getState().imageById;
			for (const [id, entry] of Object.entries(library)) {
				imageMap[id] = entry.dataURL;
			}
			// センシティブ: 参照中画像をパスワードで暗号化して格納。パスワード未入力(キャンセル)は
			// 保存中止 (null を返す = 呼び出し側で無音スキップ)。
			let encrypted: EncryptedImageData | undefined;
			if (doc.isSensitive) {
				const pw = requirePassword(); // box 値。未入力なら警告して中止。
				if (pw === null) return null;
				encrypted = await encryptImageData(collectReferencedImages(doc, imageMap), pw);
			}
			const json = serializeHvd({ ...doc, title, editTime: now }, imageMap, { encrypted });

			const db = await openDb();
			try {
				const tx = db.transaction([TITLES_STORE, DATA_STORE, THUMBS_STORE], "readwrite");
				const titlesStore = tx.objectStore(TITLES_STORE);
				const dataStore = tx.objectStore(DATA_STORE);
				const existing = (await reqToPromise(titlesStore.getAll())) as StoredSlideTitle[];
				const found = existing.find((t) => t.title === title);
				// isSensitive を一覧レコードへ保存 (ピッカーの 🔒 標示用。復号不要な非暗号メタ)。
				const isSensitive = !!doc.isSensitive;
				if (found) {
					await reqToPromise(titlesStore.put({ id: found.id, title, update: now, isSensitive }));
				} else {
					await reqToPromise(titlesStore.add({ title, update: now, isSensitive }));
				}
				await reqToPromise(dataStore.put({ title, data: json }));
				// サムネイルは渡された時のみ更新 (未指定なら既存を温存)。連結1枚 + コマ数を保存。
				if (options?.thumbnail) {
					await reqToPromise(
						tx.objectStore(THUMBS_STORE).put({
							title,
							thumb: options.thumbnail.thumb,
							frames: options.thumbnail.frames,
						})
					);
				}
				await txComplete(tx);
			} finally {
				db.close();
			}
			return { title };
		},
		[requirePassword]
	);

	const deleteByTitle = useCallback(async (title: string): Promise<void> => {
		const db = await openDb();
		try {
			const tx = db.transaction([TITLES_STORE, DATA_STORE, THUMBS_STORE], "readwrite");
			const titlesStore = tx.objectStore(TITLES_STORE);
			const dataStore = tx.objectStore(DATA_STORE);
			const titles = (await reqToPromise(titlesStore.getAll())) as StoredSlideTitle[];
			const found = titles.find((t) => t.title === title);
			if (found) await reqToPromise(titlesStore.delete(found.id));
			await reqToPromise(dataStore.delete(title));
			await reqToPromise(tx.objectStore(THUMBS_STORE).delete(title));
			await txComplete(tx);
		} finally {
			db.close();
		}
	}, []);

	const loadThumbnails = useCallback(async (): Promise<Record<string, StoredDocThumbnail>> => {
		const db = await openDb();
		try {
			const tx = db.transaction(THUMBS_STORE, "readonly");
			const all = (await reqToPromise(tx.objectStore(THUMBS_STORE).getAll())) as StoredThumbnail[];
			const map: Record<string, StoredDocThumbnail> = {};
			// frames 欠落 (v2 初期の単一サムネ) は 1 コマとみなす (後方互換)。
			for (const t of all) map[t.title] = { thumb: t.thumb, frames: t.frames ?? 1 };
			return map;
		} finally {
			db.close();
		}
	}, []);

	return { listTitles, loadByTitle, save, deleteByTitle, loadThumbnails };
}
