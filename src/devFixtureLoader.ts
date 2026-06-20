import { useImageLibraryStore } from "./state/imageLibraryStore";
import type { ViewerDocument } from "./types/ViewerDocument";
import { parseHvd } from "./utils/storageCodec";

// dev-only fixture loader (v3 Group A build 7、Group B 完成時に削除予定)。
//
// `?new=1&fixture=<filename>` クエリで tests/fixtures/<filename> を fetch、または
// レガシーの IndexedDB から最新ドキュメントを取得し、ViewerDocument に変換する。
//
// HVD parse / serialize ロジックは Group B build 1 で抽出した
// src/utils/storageCodec.ts (純関数) に委譲。本ファイルは browser-specific な
// I/O 層 (fetch + IndexedDB アクセス) + imageLibraryStore への副作用書き込み
// だけを担当する。
//
// 本ファイルは Group B で hooks/useStorage.ts が完成したら全削除する。

/** HVD JSON 文字列をパースし、imageLibraryStore に画像を投入したうえで doc を返す。 */
export function parseHvdJson(text: string, fallbackTitle: string): ViewerDocument {
	const { doc, imageData } = parseHvd(text, fallbackTitle);
	useImageLibraryStore.getState().setImageLibrary(imageData);
	return doc;
}

/**
 * クエリ `?fixture=<filename>` から tests/fixtures/<filename> を読み込み
 * ViewerDocument に変換する。fixture 未指定なら null を返す。
 */
export async function loadFixtureFromQuery(): Promise<ViewerDocument | null> {
	const name = new URLSearchParams(location.search).get("fixture");
	if (!name) return null;
	if (!name.endsWith(".hvd")) {
		console.error("[devFixtureLoader] Group A は .hvd のみ対応。got:", name);
		return null;
	}
	const url = `/tests/fixtures/${name}`;
	console.log("[devFixtureLoader] loading", url);
	const res = await fetch(url);
	if (!res.ok) {
		console.error("[devFixtureLoader] fetch failed:", res.status, res.statusText, url);
		return null;
	}
	const text = await res.text();
	const doc = parseHvdJson(text, name);
	console.log("[devFixtureLoader] loaded", { title: doc.title, slides: doc.slides.length });
	return doc;
}

// ---- IndexedDB から最新ドキュメントをロード (Group A dev UI 用、Group B で削除) ----
//
// レガシー `src/utils/SlideStorage.ts` (EventDispatcher class シングルトン) は
// §0-10 により import 禁止。が、IndexedDB アクセス自体はクラス依存ではない
// ため、同じ DB 名 / オブジェクトストア構造を直接読む。
// DB 名/store 構造はレガシー SlideStorage が確立したもの:
//   - DB:    "viewer"
//   - store: "slideTitles" {id, title, update} (autoIncrement)
//   - store: "slideData"   {title, data: jsonStr (HVD JSON 文字列)}

const IDB_DB_NAME = "viewer";
const IDB_TITLES_STORE = "slideTitles";
const IDB_DATA_STORE = "slideData";

interface SlideTitleEntry {
	id: number;
	title: string;
	update: number;
}

interface SlideDataEntry {
	title: string;
	data: string;
}

function openIdb(): Promise<IDBDatabase> {
	return new Promise((resolve, reject) => {
		const req = indexedDB.open(IDB_DB_NAME);
		req.onsuccess = () => resolve(req.result);
		req.onerror = () => reject(req.error);
	});
}

function getAll<T>(store: IDBObjectStore): Promise<T[]> {
	return new Promise((resolve, reject) => {
		const req = store.getAll();
		req.onsuccess = () => resolve(req.result as T[]);
		req.onerror = () => reject(req.error);
	});
}

function get<T>(store: IDBObjectStore, key: IDBValidKey): Promise<T | undefined> {
	return new Promise((resolve, reject) => {
		const req = store.get(key);
		req.onsuccess = () => resolve(req.result as T | undefined);
		req.onerror = () => reject(req.error);
	});
}

/**
 * IndexedDB の "viewer" データベースから update 降順で最新の 1 件を読み込む。
 * 該当データなし / DB 未作成なら null を返す。
 */
export async function loadLatestFromIndexedDB(): Promise<ViewerDocument | null> {
	let db: IDBDatabase;
	try {
		db = await openIdb();
	} catch (e) {
		console.error("[devFixtureLoader] IDB open failed:", e);
		return null;
	}
	if (!db.objectStoreNames.contains(IDB_TITLES_STORE) || !db.objectStoreNames.contains(IDB_DATA_STORE)) {
		console.warn("[devFixtureLoader] IDB has no slideTitles/slideData store (レガシーでまだ何も保存していない可能性)");
		db.close();
		return null;
	}
	const tx = db.transaction([IDB_TITLES_STORE, IDB_DATA_STORE], "readonly");
	const titles = await getAll<SlideTitleEntry>(tx.objectStore(IDB_TITLES_STORE));
	if (titles.length === 0) {
		console.warn("[devFixtureLoader] IDB slideTitles is empty");
		db.close();
		return null;
	}
	titles.sort((a, b) => b.update - a.update);
	const latest = titles[0];
	const entry = await get<SlideDataEntry>(tx.objectStore(IDB_DATA_STORE), latest.title);
	db.close();
	if (!entry) {
		console.warn("[devFixtureLoader] IDB slideData missing for title:", latest.title);
		return null;
	}
	const doc = parseHvdJson(entry.data, latest.title);
	console.log("[devFixtureLoader] loaded latest from IDB", {
		title: doc.title,
		slides: doc.slides.length,
		update: new Date(latest.update).toISOString(),
	});
	return doc;
}
