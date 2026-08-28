import { useSensitivePassword } from "@/hooks/useSensitivePassword";
import { useImageLibraryStore } from "@/state/imageLibraryStore";
import { canWriteNow } from "@/state/launchModeStore";
import { MigrationStatus, isStorageReady, useMigrationStore } from "@/state/migrationStore";
import type { DocId } from "@/types/DocId";
import type { ViewerDocument } from "@/types/ViewerDocument";
import { DateUtil } from "@/utils/DateUtil";
import { newUuid } from "@/utils/uuid";
import {
    type EncryptedImageData,
    decryptImageData,
    encryptImageData,
} from "@/utils/sensitiveCrypto";
import {
    buildImageEntries,
    collectReferencedImages,
    parseHvd,
    serializeHvd,
} from "@/utils/storageCodec";
import { useCallback } from "react";

// HVD IDB アクセス + codec を統合した React 向けストレージ API hook
// (v3 Group B build 3、§0-10 新側内製)。
// レガシー src/utils/SlideStorage.ts (EventDispatcher class シングルトン) を
// 1 ファイル / 1 hook で完全代替。
//
// IDB スキーマ (docs/document-id-plan.md):
//   DB:    "viewer" (version 3)
//   store: "docs"      {id, title, update, isSensitive}  keyPath "id"    … 一覧用。id は DocId (uuid)
//   store: "docData"   {docId, data: HVD JSON string}    keyPath "docId" … 本体
//   store: "docThumbs" {docId, thumb, frames}            keyPath "docId" … ビジュアルピッカー用
//   index: docs.title (非ユニーク) … 名前引き / 重複検出用
//
// **title は主キーではない。** 自由入力の表示名であり重複してよい。同一性は docId だけが担う
// (title をキーにしていた頃はリネームが「削除 + 新規」になり、旧レコードが残っていた)。
//
// docThumbs は「見た目で保存ドキュメントを選ぶ」ギャラリー用。docs を軽量に保ち、サムネは
// 表示時に個別遅延ロードする。IDB に JOIN は無いので docId をキーに JS 側でマージする。
// サムネ未生成の doc は単に欠落 (UI 側で n/a 表示)。
//
// 旧スキーマ (v2 以前):
//   "slideTitles" {id: number(autoIncrement), title, update} / "slideData" {title, data}
//   / "slideThumbnails" {title, thumb, frames}
// v3 では **旧ストアを残したまま**新ストアを作り、1 文書 1 トランザクションで移す
// (migrateV2Stores)。アップグレード内で数 MB のレコードを書き換えるとその間タブが固まり、
// 失敗すればロールバックして毎回最初からやり直しになるため。中断しても未移行分が旧ストアに
// 残るだけなので次回起動から再開できる。旧ストアの削除は後続バージョン (v4) で行う
// (移行に不具合があった場合の復旧余地を残す)。
//
// **移行は自動で走らせない。** 起動時は probeLegacyDocs で「調べるだけ」(スキーマ不変)、
// 実行は二段階の確認を経た runLegacyMigration のみ。承認前はストレージ API 自体を
// 不活性にする (openDbReady が null を返す) — 保存やロードの副作用で version を上げてしまうと、
// 「旧版に戻ってバックアップを取る」退路を塞ぐため。状態は state/migrationStore.ts。
//
// 副作用: load 系は imageLibraryStore に画像 dataURL を投入する。
// viewerDocumentStore / slideStore の更新は caller (AppShell 等) の責務。

const DB_NAME = "viewer";
const DB_VERSION = 3;
const DOCS_STORE = "docs";
const DOC_DATA_STORE = "docData";
const DOC_THUMBS_STORE = "docThumbs";
const TITLE_INDEX = "title";
// 旧ストア (v2 以前)。移行元としてのみ参照する。
const LEGACY_TITLES_STORE = "slideTitles";
const LEGACY_DATA_STORE = "slideData";
const LEGACY_THUMBS_STORE = "slideThumbnails";

/** 一覧レコード。id が主キー (DocId)。 */
export interface StoredDoc {
	id: DocId;
	title: string;
	update: number;
	/** センシティブ文書か (ピッカーの 🔒 標示用)。旧レコードは undefined=非センシティブ扱い。 */
	isSensitive?: boolean;
}

interface StoredDocData {
	docId: DocId;
	data: string;
}

/** 旧 v2 の一覧レコード。`id` が **number** (autoIncrement) である点が StoredDoc と異なる。 */
interface LegacySlideTitle {
	id: number;
	title: string;
	update: number;
	isSensitive?: boolean;
}

interface LegacySlideData {
	title: string;
	data: string;
}

interface LegacyThumbnail {
	title: string;
	thumb: string;
	frames?: number;
}

/** 連結サムネ (フィルムストリップ) + コマ数。表示側が 1 コマ幅算出/切替に使う。 */
export interface StoredDocThumbnail {
	thumb: string;
	frames: number;
}

// IDB 上のサムネレコード。frames は v2 初期の単一サムネ {title, thumb} には
// 無いため optional とし、読み出し時に frames=1 とみなす (後方互換)。
interface StoredThumbnail {
	docId: DocId;
	thumb: string;
	frames?: number;
}

/**
 * DB を version 3 で開く。**呼んだ時点でスキーマ変更 (= 不可逆) が起きうる。**
 * 通常の API からは直接呼ばず、承認状態を見る openDbReady を通すこと。
 */
function openDb(): Promise<IDBDatabase> {
	return new Promise((resolve, reject) => {
		const req = indexedDB.open(DB_NAME, DB_VERSION);
		// createObjectStore は contains ガードで冪等 (新規作成・既存 DB のアップグレード両方で
		// 過不足なく揃う)。**旧ストアは消さない** — 移行元として v3 の間は残す。
		req.onupgradeneeded = () => {
			const db = req.result;
			if (!db.objectStoreNames.contains(DOCS_STORE)) {
				const docs = db.createObjectStore(DOCS_STORE, { keyPath: "id" });
				// title は重複しうるので非ユニーク。名前引きと重複検出に使う。
				docs.createIndex(TITLE_INDEX, "title", { unique: false });
			}
			if (!db.objectStoreNames.contains(DOC_DATA_STORE)) {
				db.createObjectStore(DOC_DATA_STORE, { keyPath: "docId" });
			}
			if (!db.objectStoreNames.contains(DOC_THUMBS_STORE)) {
				db.createObjectStore(DOC_THUMBS_STORE, { keyPath: "docId" });
			}
		};
		req.onsuccess = () => resolve(req.result);
		req.onerror = () => reject(req.error);
	});
}

/**
 * v2 以前のレコードを新ストアへ移す。**1 文書 1 トランザクション**で進め、中断しても
 * 未移行分が旧ストアに残るだけにする (次回起動から再開できる)。
 *
 * docId は「本体 HVD が既に持っていればそれを採用、無ければ採番」。前者は、同期経由や
 * 手動インポートで docId 付き HVD が既に入っている場合に ID を作り直さないため。
 * 判定は full parse せず substring + 部分抽出で行う (数 MB の JSON を全件 parse しない)。
 *
 * 戻り値は移行した件数 (0 = 移行不要)。
 */
async function migrateV2Stores(db: IDBDatabase, onProgress?: (fraction: number) => void): Promise<number> {
	if (!db.objectStoreNames.contains(LEGACY_TITLES_STORE)) return 0;
	const legacy = (await reqToPromise(
		db.transaction(LEGACY_TITLES_STORE, "readonly").objectStore(LEGACY_TITLES_STORE).getAll()
	)) as LegacySlideTitle[];
	if (legacy.length === 0) return 0;

	let done = 0;
	// 同名レコードが複数あった場合 (旧 slideTitles は title 一意でない) の重複排除。
	// 本体/サムネは title キーで 1 件しか無く、1 件目の移行で消えるため、2 件目をそのまま
	// 移すと「本体の無い空のドキュメント」ができてしまう。一覧の重複行は捨てる。
	const seenTitles = new Set<string>();
	for (const rec of legacy) {
		const tx = db.transaction(
			[
				LEGACY_TITLES_STORE,
				LEGACY_DATA_STORE,
				LEGACY_THUMBS_STORE,
				DOCS_STORE,
				DOC_DATA_STORE,
				DOC_THUMBS_STORE,
			],
			"readwrite"
		);
		const data = (await reqToPromise(tx.objectStore(LEGACY_DATA_STORE).get(rec.title))) as
			| LegacySlideData
			| undefined;
		const thumb = (await reqToPromise(tx.objectStore(LEGACY_THUMBS_STORE).get(rec.title))) as
			| LegacyThumbnail
			| undefined;
		const json = data?.data ?? null;
		if (seenTitles.has(rec.title)) {
			// 2 件目以降の同名行: 本体は 1 件目が引き取っているので、この行だけ捨てる。
			await reqToPromise(tx.objectStore(LEGACY_TITLES_STORE).delete(rec.id));
			await txComplete(tx);
			done++;
			onProgress?.(done / legacy.length);
			continue;
		}
		seenTitles.add(rec.title);
		const docId = readDocIdFromJson(json) ?? newUuid();
		await reqToPromise(
			tx.objectStore(DOCS_STORE).put({
				id: docId,
				title: rec.title,
				update: rec.update,
				// v2 の backfill 済みレコードは値を持つ。未 backfill (undefined) は本体から判定する。
				isSensitive: rec.isSensitive ?? !!json?.includes('"isSensitive":true'),
			} satisfies StoredDoc)
		);
		// 本体が欠けている壊れたレコードでも一覧だけは移す (ロード時に notfound になるだけ)。
		// ここで捨てると、ユーザーからは「移行で文書が消えた」に見える。
		if (json != null) {
			await reqToPromise(tx.objectStore(DOC_DATA_STORE).put({ docId, data: json }));
		}
		if (thumb) {
			await reqToPromise(
				tx.objectStore(DOC_THUMBS_STORE).put({ docId, thumb: thumb.thumb, frames: thumb.frames })
			);
		}
		// 旧レコードは移し終えてから消す (同一トランザクションなので原子的)。
		await reqToPromise(tx.objectStore(LEGACY_TITLES_STORE).delete(rec.id));
		await reqToPromise(tx.objectStore(LEGACY_DATA_STORE).delete(rec.title));
		await reqToPromise(tx.objectStore(LEGACY_THUMBS_STORE).delete(rec.title));
		await txComplete(tx);
		done++;
		onProgress?.(done / legacy.length);
	}
	return done;
}

/**
 * HVD JSON 文字列から docId だけを取り出す (full parse を避けるための部分抽出)。
 * serializeHvd は docId を version 直後に書くため先頭付近に現れるが、位置には依存しない。
 */
function readDocIdFromJson(json: string | null): DocId | null {
	if (!json) return null;
	const m = /"docId"\s*:\s*"([^"]+)"/.exec(json);
	return m ? m[1] : null;
}

/**
 * 旧形式ドキュメントが残っているかを**調べるだけ**。スキーマには一切触れない。
 *
 * `indexedDB.open` を **version 指定なし**で呼ぶのがこの関数の肝で、こうすると現行 version の
 * まま開ける (version を上げると `onupgradeneeded` が走ってしまい、元に戻せなくなる)。
 * 調査の時点では何も変更しないので、ユーザーは旧版のアプリへ戻ってバックアップを取れる。
 *
 * DB が存在しない場合、version 指定なしの open は空の DB を version 1 で作る。実害は無い
 * (次に openDb が 3 へ上げる) ため、存在チェックのために特別扱いはしない。
 */
function openDbCurrentVersion(): Promise<IDBDatabase> {
	return new Promise((resolve, reject) => {
		const req = indexedDB.open(DB_NAME); // ← version を渡さない = スキーマ不変
		req.onsuccess = () => resolve(req.result);
		req.onerror = () => reject(req.error);
	});
}

export async function probeLegacyDocs(): Promise<{ count: number; titles: string[] }> {
	const records = await readLegacyTitles();
	return { count: records.length, titles: records.map((r) => r.title) };
}

/** 旧一覧レコードを読む (スキーマ不変)。旧ストアが無ければ空。 */
async function readLegacyTitles(): Promise<LegacySlideTitle[]> {
	const db = await openDbCurrentVersion();
	try {
		if (!db.objectStoreNames.contains(LEGACY_TITLES_STORE)) return [];
		return (await reqToPromise(
			db.transaction(LEGACY_TITLES_STORE, "readonly").objectStore(LEGACY_TITLES_STORE).getAll()
		)) as LegacySlideTitle[];
	} finally {
		db.close();
	}
}

// ---- 承認前の読み取り専用パス (docs/document-id-plan.md「設計変更」) ----
//
// 移行を承認するまで、旧ストアから **読むだけ** は許す (バックアップを取れるようにするため)。
// この間は docId が存在しないので、**title を暫定の id として扱う**。
// 承認後は通常パスに切り替わり、id は本物の DocId になる。
// 「title を id として使う」のはこのモードの中だけの約束で、外へ持ち出さないこと。

/**
 * 暫定 id。**title は使えない。**
 * 旧 slideTitles は autoIncrement の id が主キーなので、**同名レコードを複数持てる**
 * (title を id に使うと衝突し、Select が "Duplicate options" で落ちる)。
 * 旧レコードの数値 id で一意にする。
 */
const legacyDocId = (numericId: number): DocId => `${LEGACY_ID_PREFIX}${numericId}`;
const LEGACY_ID_PREFIX = "legacy:";

async function legacyListDocs(): Promise<StoredDoc[]> {
	const records = await readLegacyTitles();
	return records.map((r) => ({
		id: legacyDocId(r.id),
		title: r.title,
		update: r.update,
		isSensitive: r.isSensitive,
	}));
}

/** 暫定 id から旧レコードの title を引く (本体/サムネは title キーのため)。 */
async function legacyTitleForId(id: DocId): Promise<string | null> {
	if (!id.startsWith(LEGACY_ID_PREFIX)) return null;
	const numericId = Number(id.slice(LEGACY_ID_PREFIX.length));
	const records = await readLegacyTitles();
	return records.find((r) => r.id === numericId)?.title ?? null;
}

async function legacyLoadJson(title: string): Promise<string | null> {
	const db = await openDbCurrentVersion();
	try {
		if (!db.objectStoreNames.contains(LEGACY_DATA_STORE)) return null;
		const entry = (await reqToPromise(
			db.transaction(LEGACY_DATA_STORE, "readonly").objectStore(LEGACY_DATA_STORE).get(title)
		)) as LegacySlideData | undefined;
		return entry?.data ?? null;
	} finally {
		db.close();
	}
}

async function legacyGetThumbnail(title: string): Promise<StoredDocThumbnail | null> {
	const db = await openDbCurrentVersion();
	try {
		if (!db.objectStoreNames.contains(LEGACY_THUMBS_STORE)) return null;
		const t = (await reqToPromise(
			db.transaction(LEGACY_THUMBS_STORE, "readonly").objectStore(LEGACY_THUMBS_STORE).get(title)
		)) as LegacyThumbnail | undefined;
		return t ? { thumb: t.thumb, frames: t.frames ?? 1 } : null;
	} finally {
		db.close();
	}
}

/** 承認前 (= 旧ストアを読むモード) か。 */
const inLegacyReadMode = (): boolean =>
	useMigrationStore.getState().status === MigrationStatus.PENDING;

/**
 * 旧形式ドキュメントを移行する。**ユーザーが承認したときだけ呼ぶこと** (自動では走らせない)。
 * ここで初めて `openDb` (version 3) を呼ぶ = スキーマ変更が起きる。
 */
export async function runLegacyMigration(onProgress?: (fraction: number) => void): Promise<number> {
	const db = await openDb();
	try {
		return await migrateV2Stores(db, onProgress);
	} finally {
		db.close();
	}
}

/**
 * ストレージ API 用の open。**移行の承認が済むまで開かない** (スキーマ変更を起こさないため)。
 *
 * 未承認の間に開いてしまうと、ユーザーが「まだ何も変わっていないから旧版に戻って
 * バックアップを取る」という退路を、保存やロードの副作用で塞いでしまう。
 * 呼び出し側は null を「まだ操作できない」として扱う (エラーではない)。
 */
async function openDbReady(): Promise<IDBDatabase | null> {
	if (!isStorageReady(useMigrationStore.getState().status)) return null;
	return openDb();
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
 * loadById の結果。
 * - ok:       復号成功 (imageLibrary 投入済み)。doc を document store へ反映してよい。
 * - notfound: 該当データなし。
 * - locked:   センシティブ文書で PW 未入力/誤り。**ロードは中止**され store は未変更
 *             (画像なし文書を出さない)。警告モーダルは loadById 内で表示済み。
 */
export type LoadResult =
	| { status: "ok"; doc: ViewerDocument }
	| { status: "notfound" }
	| { status: "locked" };

export interface StorageApi {
	/** ドキュメント一覧を取得 (未ソート)。 */
	listDocs: () => Promise<StoredDoc[]>;
	/** docId 指定でロード。ok 時のみ imageLibraryStore に画像が投入される。onProgress で 0..1 を報告。 */
	loadById: (id: DocId, onProgress?: (fraction: number) => void) => Promise<LoadResult>;
	/**
	 * ViewerDocument を保存。
	 *   - override=true  … doc.docId と doc.title をそのまま使う (= 上書き / リネーム保存)。
	 *                      doc.docId が無ければ採番する (未保存文書の初回保存)。
	 *   - override=false … 別名で保存。**docId を新規採番**し、日付ベースの新タイトルを付ける。
	 * editTime は呼び出し時刻で上書き (レガシー SlideStorage.save 互換挙動)。
	 * 戻り値は実際に保存された docId と title。
	 */
	save: (
		doc: ViewerDocument,
		options?: {
			override?: boolean;
			thumbnail?: StoredDocThumbnail | null;
			onProgress?: (fraction: number) => void;
			/**
			 * スマホモードでの canWriteNow gate をバイパス。スマホ PWA (自動 VIEW) 限定の
			 * インポート同時保存で使用。UI 側でスマホ限定であることを保証すること。
			 */
			allowInViewMode?: boolean;
		}
	) => Promise<{ docId: DocId; title: string } | null>;
	/**
	 * docId 指定で削除。該当なしも success 扱い。
	 * allowInViewMode: スマホモードでの canWriteNow gate をバイパス (スマホ限定の削除導線用)。
	 */
	deleteById: (id: DocId, options?: { allowInViewMode?: boolean }) => Promise<void>;
	/** 全サムネイルを {docId: {thumb, frames}} で取得 (未生成は欠落)。※ピッカーは遅延ロードを使う。 */
	loadThumbnails: () => Promise<Record<DocId, StoredDocThumbnail>>;
	/** 単一ドキュメントのサムネを取得 (ピッカーの遅延ロード用、単発 get)。未生成は null。 */
	getThumbnail: (id: DocId) => Promise<StoredDocThumbnail | null>;
	/**
	 * 保存済みドキュメントを全消去 (DB ごと削除)。アプリロックのパスコードを忘れた場合の
	 * 唯一の回復手段 (docs/app-lock-spec.md)。取り消し不可。
	 *
	 * canWriteNow gate は掛けない: スマホは常に スマホモードになる (launchModeStore) ため、
	 * gate を掛けるとロックアウトされた端末からリセットできなくなる。呼出側 (ロック画面) が
	 * 二段階確認を担保すること。
	 */
	eraseAllDocuments: () => Promise<void>;
}

export function useStorage(): StorageApi {
	const { requirePassword, unlock } = useSensitivePassword();

	const listDocs = useCallback(async (): Promise<StoredDoc[]> => {
		// 承認前は旧ストアを読み取り専用で見せる (バックアップを取れるようにするため)。
		if (inLegacyReadMode()) return legacyListDocs();
		const db = await openDbReady();
		if (!db) return [];
		try {
			const records = (await reqToPromise(
				db.transaction(DOCS_STORE, "readonly").objectStore(DOCS_STORE).getAll()
			)) as StoredDoc[];
			// 旧レコード (isSensitive 未記録) の backfill: 本体から一度だけ導出して一覧へ書く。
			// これで「isSensitive 記録前に保存した文書」も再保存なしで 🔒 標示される。
			// full parse せず substring 判定 (serializeHvd は sensitive 時 `"isSensitive":true` を書く)。
			const unmigrated = records.filter((r) => r.isSensitive === undefined);
			if (unmigrated.length > 0) {
				const tx = db.transaction([DOCS_STORE, DOC_DATA_STORE], "readwrite");
				const docsStore = tx.objectStore(DOCS_STORE);
				const dataStore = tx.objectStore(DOC_DATA_STORE);
				for (const r of unmigrated) {
					const entry = (await reqToPromise(dataStore.get(r.id))) as StoredDocData | undefined;
					r.isSensitive = !!entry?.data?.includes('"isSensitive":true');
					await reqToPromise(docsStore.put(r));
				}
				await txComplete(tx);
			}
			return records;
		} finally {
			db.close();
		}
	}, []);

	const loadById = useCallback(
		async (id: DocId, onProgress?: (fraction: number) => void): Promise<LoadResult> => {
			const report = onProgress ?? (() => {});
			report(0.05);
			let jsonStr: string | null = null;
			let title = "";
			if (inLegacyReadMode()) {
				// 承認前は旧ストアから読む。id は暫定 id (legacyDocId) なので title へ引き直す。
				const legacyTitle = await legacyTitleForId(id);
				if (legacyTitle == null) return { status: "notfound" };
				jsonStr = await legacyLoadJson(legacyTitle);
				title = legacyTitle;
			} else {
				const db = await openDbReady();
				if (!db) return { status: "notfound" }; // 移行の承認待ち
				try {
					const tx = db.transaction([DOCS_STORE, DOC_DATA_STORE], "readonly");
					const meta = (await reqToPromise(tx.objectStore(DOCS_STORE).get(id))) as
						| StoredDoc
						| undefined;
					const entry = (await reqToPromise(tx.objectStore(DOC_DATA_STORE).get(id))) as
						| StoredDocData
						| undefined;
					jsonStr = entry?.data ?? null;
					title = meta?.title ?? "";
				} finally {
					db.close();
				}
			}
			if (jsonStr == null) return { status: "notfound" };
			report(0.2);
			// parseHvd (JSON.parse) は同期でメインスレッドを止めるので、直前で 1 度 yield して
			// バーに「解析中」を描画させる (なるべく固まって見えないように)。
			await new Promise<void>((r) => setTimeout(r));
			// title は一覧レコード側が正 (HVD 本体は title を持たない)。docId は本体に書かれて
			// いなければ引数の id で補う。ただし**承認前は id が title の代用**なので補わない
			// (title を docId として持ち出すと、移行後に別 ID とぶつかる)。
			const parsed = parseHvd(jsonStr, title);
			if (!parsed.doc.docId && !inLegacyReadMode()) parsed.doc.docId = id;
			report(0.55);
			if (parsed.encrypted) {
				// センシティブ: box の PW で復号を試す (= ロード前の軽い判定)。
				// 失敗/未入力は unlock が警告モーダルを出す。ここで locked を返し、
				// **画像なし文書を読み込まずに中止**する (store は一切触らない = 現文書維持)。
				const enc = parsed.encrypted;
				report(0.6);
				const imageData = await unlock((pw) => decryptImageData(enc, pw));
				if (imageData === null) return { status: "locked" };
				report(0.9);
				useImageLibraryStore.getState().setImageLibrary(imageData);
				report(0.98);
				return { status: "ok", doc: parsed.doc };
			}
			useImageLibraryStore
				.getState()
				.setImageLibrary(buildImageEntries(parsed.imageData, parsed.imageNames));
			report(0.95);
			return { status: "ok", doc: parsed.doc };
		},
		[unlock]
	);

	const save = useCallback(
		async (
			doc: ViewerDocument,
			options?: {
				override?: boolean;
				thumbnail?: StoredDocThumbnail | null;
				/** 保存進捗 (0..1)。暗号化/直列化/書込のフェーズ粗粒度 (JSON.stringify は同期のため滑らかには動かない)。 */
				onProgress?: (fraction: number) => void;
				/** スマホモードでの gate をバイパス (スマホのインポート同時保存で使用)。 */
				allowInViewMode?: boolean;
			}
		): Promise<{ docId: DocId; title: string } | null> => {
			if (!options?.allowInViewMode && !canWriteNow("storage.save")) return null;
			const report = options?.onProgress;
			const override = !!options?.override;
			const title = override ? doc.title : DateUtil.getDateString();
			// 別名で保存は新しい文書 = 新しい docId。上書きは維持 (未保存文書は初回に採番)。
			const docId = (override ? doc.docId : undefined) ?? newUuid();
			const now = Date.now();
			// imageLibraryStore から imageId→dataURL / imageId→name を抽出。
			const imageMap: Record<string, string> = {};
			const imageNames: Record<string, string> = {};
			const library = useImageLibraryStore.getState().imageById;
			for (const [id, entry] of Object.entries(library)) {
				imageMap[id] = entry.dataURL;
				if (entry.name != null && entry.name !== "") imageNames[id] = entry.name;
			}
			// センシティブ: 参照中画像をパスワードで暗号化して格納。パスワード未入力(キャンセル)は
			// 保存中止 (null を返す = 呼び出し側で無音スキップ)。
			report?.(0.1);
			let encrypted: EncryptedImageData | undefined;
			if (doc.isSensitive) {
				const pw = requirePassword(); // box 値。未入力なら警告して中止。
				if (pw === null) return null;
				report?.(0.2);
				encrypted = await encryptImageData(collectReferencedImages(doc, imageMap), pw);
			}
			report?.(0.5); // 直列化 (JSON.stringify) は同期でメインスレッドを止めるため前で報告。
			const json = serializeHvd({ ...doc, docId, title, editTime: now }, imageMap, {
				encrypted,
				imageNames,
			});
			report?.(0.7);

			const db = await openDbReady();
			// 移行の承認待ちは保存させない (承認前にスキーマを変えないため)。
			// null は「パスワード入力キャンセル」と同じ無音中止として扱われる。
			if (!db) return null;
			try {
				const tx = db.transaction([DOCS_STORE, DOC_DATA_STORE, DOC_THUMBS_STORE], "readwrite");
				// docId が主キーなので put 一発で新規/更新の両方になる (title で引き当てる必要が無い。
				// title は重複してよく、リネームしても同じレコードが更新される)。
				await reqToPromise(
					tx.objectStore(DOCS_STORE).put({
						id: docId,
						title,
						update: now,
						// isSensitive を一覧レコードへ保存 (ピッカーの 🔒 標示用。復号不要な非暗号メタ)。
						isSensitive: !!doc.isSensitive,
					} satisfies StoredDoc)
				);
				await reqToPromise(tx.objectStore(DOC_DATA_STORE).put({ docId, data: json }));
				// サムネイルは渡された時のみ更新 (未指定なら既存を温存)。連結1枚 + コマ数を保存。
				if (options?.thumbnail) {
					await reqToPromise(
						tx.objectStore(DOC_THUMBS_STORE).put({
							docId,
							thumb: options.thumbnail.thumb,
							frames: options.thumbnail.frames,
						})
					);
				}
				await txComplete(tx);
				report?.(0.95);
			} finally {
				db.close();
			}
			return { docId, title };
		},
		[requirePassword]
	);

	const deleteById = useCallback(
		async (id: DocId, options?: { allowInViewMode?: boolean }): Promise<void> => {
			if (!options?.allowInViewMode && !canWriteNow("storage.deleteById")) return;
			const db = await openDbReady();
			if (!db) return; // 移行の承認待ち
			try {
				const tx = db.transaction([DOCS_STORE, DOC_DATA_STORE, DOC_THUMBS_STORE], "readwrite");
				// 3 ストアとも docId が主キーなので、引き当て無しで直接消せる。
				await reqToPromise(tx.objectStore(DOCS_STORE).delete(id));
				await reqToPromise(tx.objectStore(DOC_DATA_STORE).delete(id));
				await reqToPromise(tx.objectStore(DOC_THUMBS_STORE).delete(id));
				await txComplete(tx);
			} finally {
				db.close();
			}
		},
		[]
	);

	const loadThumbnails = useCallback(async (): Promise<Record<DocId, StoredDocThumbnail>> => {
		// 承認前は一覧を旧ストアから作っているので、サムネも旧ストアから引く (キーは title)。
		if (inLegacyReadMode()) {
			const docs = await legacyListDocs();
			const map: Record<DocId, StoredDocThumbnail> = {};
			for (const d of docs) {
				const t = await legacyGetThumbnail(d.title); // 旧サムネのキーは title
				if (t) map[d.id] = t;
			}
			return map;
		}
		const db = await openDbReady();
		if (!db) return {};
		try {
			const tx = db.transaction(DOC_THUMBS_STORE, "readonly");
			const all = (await reqToPromise(
				tx.objectStore(DOC_THUMBS_STORE).getAll()
			)) as StoredThumbnail[];
			const map: Record<DocId, StoredDocThumbnail> = {};
			// frames 欠落 (v2 初期の単一サムネ) は 1 コマとみなす (後方互換)。
			for (const t of all) map[t.docId] = { thumb: t.thumb, frames: t.frames ?? 1 };
			return map;
		} finally {
			db.close();
		}
	}, []);

	// 単一ドキュメントのサムネを取得 (ピッカーの遅延ロード用、docId キーの単発 get = 軽量)。
	// 未生成は null。全件一括 (loadThumbnails) の代わりに可視カードぶんだけ呼ぶことでメモリを抑える。
	const getThumbnail = useCallback(async (id: DocId): Promise<StoredDocThumbnail | null> => {
		if (inLegacyReadMode()) {
			const legacyTitle = await legacyTitleForId(id);
			return legacyTitle == null ? null : legacyGetThumbnail(legacyTitle);
		}
		const db = await openDbReady();
		if (!db) return null;
		try {
			const tx = db.transaction(DOC_THUMBS_STORE, "readonly");
			const t = (await reqToPromise(tx.objectStore(DOC_THUMBS_STORE).get(id))) as
				| StoredThumbnail
				| undefined;
			return t ? { thumb: t.thumb, frames: t.frames ?? 1 } : null;
		} finally {
			db.close();
		}
	}, []);

	// DB ごと削除する。個別 delete を回すより確実で、object store 構成の変更にも追従する。
	const eraseAllDocuments = useCallback(async (): Promise<void> => {
		await new Promise<void>((resolve) => {
			const req = indexedDB.deleteDatabase(DB_NAME);
			// blocked (他タブが DB を開いている) でも解決させる。削除は次回クローズ時に完了し、
			// ここで待ち続けるとリセットが固まって回復手段として機能しなくなる。
			req.onsuccess = () => resolve();
			req.onerror = () => resolve();
			req.onblocked = () => resolve();
		});
	}, []);

	return {
		listDocs,
		loadById,
		save,
		deleteById,
		loadThumbnails,
		getThumbnail,
		eraseAllDocuments,
	};
}
