import { useCallback } from "react";
import { useImageLibraryStore } from "../state/imageLibraryStore";
import type { ViewerDocument } from "../types/ViewerDocument";
import { DateUtil } from "../utils/DateUtil";
import { parseHvd, serializeHvd } from "../utils/storageCodec";

// HVD IDB アクセス + codec を統合した React 向けストレージ API hook
// (v3 Group B build 3、§0-10 新側内製)。
// レガシー src/utils/SlideStorage.ts (EventDispatcher class シングルトン) を
// 1 ファイル / 1 hook で完全代替。
//
// IDB スキーマはレガシー互換:
//   DB:    "viewer"
//   store: "slideTitles" {id, title, update} (id autoIncrement)
//   store: "slideData"   {title, data: HVD JSON string}
//
// 副作用: load 系は imageLibraryStore に画像 dataURL を投入する。
// viewerDocumentStore / slideStore の更新は caller (AppShell 等) の責務。

const DB_NAME = "viewer";
const TITLES_STORE = "slideTitles";
const DATA_STORE = "slideData";

export interface StoredSlideTitle {
	id: number;
	title: string;
	update: number;
}

interface StoredSlideData {
	title: string;
	data: string;
}

function openDb(): Promise<IDBDatabase> {
	return new Promise((resolve, reject) => {
		const req = indexedDB.open(DB_NAME);
		req.onupgradeneeded = () => {
			const db = req.result;
			if (!db.objectStoreNames.contains(TITLES_STORE)) {
				db.createObjectStore(TITLES_STORE, { keyPath: "id", autoIncrement: true });
			}
			if (!db.objectStoreNames.contains(DATA_STORE)) {
				db.createObjectStore(DATA_STORE, { keyPath: "title" });
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

export interface StorageApi {
	/** タイトル一覧を取得 (未ソート)。 */
	listTitles: () => Promise<StoredSlideTitle[]>;
	/** タイトル指定でロード。imageLibraryStore に画像が投入される。 */
	loadByTitle: (title: string) => Promise<ViewerDocument | null>;
	/**
	 * ViewerDocument を保存。override=false (default) なら日付ベースの新タイトル、
	 * override=true なら doc.title をそのまま使う (= 上書き保存)。
	 * editTime は呼び出し時刻で上書き (レガシー SlideStorage.save 互換挙動)。
	 * 戻り値の title は実際に保存された title (新規時は生成されたもの)。
	 */
	save: (doc: ViewerDocument, options?: { override?: boolean }) => Promise<{ title: string }>;
	/** タイトル指定で削除。該当なしも success 扱い。 */
	deleteByTitle: (title: string) => Promise<void>;
}

export function useStorage(): StorageApi {
	const listTitles = useCallback(async (): Promise<StoredSlideTitle[]> => {
		const db = await openDb();
		try {
			const tx = db.transaction(TITLES_STORE, "readonly");
			return (await reqToPromise(tx.objectStore(TITLES_STORE).getAll())) as StoredSlideTitle[];
		} finally {
			db.close();
		}
	}, []);

	const loadByTitle = useCallback(async (title: string): Promise<ViewerDocument | null> => {
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
		if (jsonStr == null) return null;
		const { doc, imageData } = parseHvd(jsonStr, title);
		useImageLibraryStore.getState().setImageLibrary(imageData);
		return doc;
	}, []);

	const save = useCallback(
		async (doc: ViewerDocument, options?: { override?: boolean }): Promise<{ title: string }> => {
			const title = options?.override ? doc.title : DateUtil.getDateString();
			const now = Date.now();
			// imageLibraryStore から imageId→dataURL 抽出 (Record<string, ImageEntry> → Record<string, string>)
			const imageMap: Record<string, string> = {};
			const library = useImageLibraryStore.getState().imageById;
			for (const [id, entry] of Object.entries(library)) {
				imageMap[id] = entry.dataURL;
			}
			const json = serializeHvd({ ...doc, title, editTime: now }, imageMap);

			const db = await openDb();
			try {
				const tx = db.transaction([TITLES_STORE, DATA_STORE], "readwrite");
				const titlesStore = tx.objectStore(TITLES_STORE);
				const dataStore = tx.objectStore(DATA_STORE);
				const existing = (await reqToPromise(titlesStore.getAll())) as StoredSlideTitle[];
				const found = existing.find((t) => t.title === title);
				if (found) {
					await reqToPromise(titlesStore.put({ id: found.id, title, update: now }));
				} else {
					await reqToPromise(titlesStore.add({ title, update: now }));
				}
				await reqToPromise(dataStore.put({ title, data: json }));
				await txComplete(tx);
			} finally {
				db.close();
			}
			return { title };
		},
		[],
	);

	const deleteByTitle = useCallback(async (title: string): Promise<void> => {
		const db = await openDb();
		try {
			const tx = db.transaction([TITLES_STORE, DATA_STORE], "readwrite");
			const titlesStore = tx.objectStore(TITLES_STORE);
			const dataStore = tx.objectStore(DATA_STORE);
			const titles = (await reqToPromise(titlesStore.getAll())) as StoredSlideTitle[];
			const found = titles.find((t) => t.title === title);
			if (found) await reqToPromise(titlesStore.delete(found.id));
			await reqToPromise(dataStore.delete(title));
			await txComplete(tx);
		} finally {
			db.close();
		}
	}, []);

	return { listTitles, loadByTitle, save, deleteByTitle };
}
