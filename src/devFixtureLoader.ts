import { useImageLibraryStore } from "./state/imageLibraryStore";
import type { ImageLayer, Layer, TextLayer } from "./types/Layer";
import type { Slide } from "./types/Slide";
import type { ViewerDocument } from "./types/ViewerDocument";

// dev-only fixture loader (v3 Group A build 7、Group B 完成時に削除予定)。
//
// `?new=1&fixture=<filename>` クエリで tests/fixtures/<filename> を fetch し、
// 最小マッパーで純粋型 ViewerDocument に変換し caller に返す。
// 本ファイルはレガシー SlideStorage class を import せず (§0-10) 動作確認用の
// 暫定実装に留める。HVZ (.hvz zip) や PNG (.png embed) は未対応で .hvd JSON のみ。
//
// 本ファイルおよび `loadFixtureFromQuery` 関数は Group B で
// `hooks/useStorage.ts` + 純関数 codec が完成したら全削除する。

interface RawHvdLayer {
	transX: number;
	transY: number;
	scaleX: number;
	scaleY: number;
	rotation: number;
	mirrorH: boolean;
	mirrorV: boolean;
	type?: string;
	name?: string;
	imageId?: string;
	clipRect?: [number, number, number, number];
	text?: string;
	opacity?: number;
	locked?: boolean;
	visible?: boolean;
	shared?: boolean;
	id?: number;
	isText?: boolean;
}

interface RawHvdSlide {
	id: number;
	durationRatio?: number;
	joining?: boolean;
	disabled?: boolean;
	layers: RawHvdLayer[];
}

interface RawHvd {
	version: number;
	screen: { width: number; height: number };
	bgColor?: string;
	createTime?: number;
	editTime?: number;
	duration?: number;
	interval?: number;
	isSensitive?: boolean;
	title?: string;
	slideData: RawHvdSlide[];
	/** imageId → dataURL の埋め込み画像辞書 (HVD/HVZ 形式の標準フィールド)。 */
	imageData?: Record<string, string>;
}

function newUuid(): string {
	// crypto.randomUUID は modern browser で利用可。fallback は雑な乱数。
	const c = (typeof crypto !== "undefined" ? crypto : null) as Crypto | null;
	if (c && typeof c.randomUUID === "function") return c.randomUUID();
	return `dev-${Math.random().toString(36).slice(2)}-${Date.now().toString(36)}`;
}

function mapLayer(raw: RawHvdLayer, fallbackId: number): Layer | null {
	const base = {
		id: raw.id ?? fallbackId,
		uuid: newUuid(),
		name: raw.name ?? "",
		opacity: raw.opacity ?? 1,
		locked: raw.locked ?? false,
		visible: raw.visible ?? true,
		shared: raw.shared ?? false,
		transX: raw.transX,
		transY: raw.transY,
		scaleX: raw.scaleX,
		scaleY: raw.scaleY,
		rotation: raw.rotation,
		mirrorH: raw.mirrorH,
		mirrorV: raw.mirrorV,
	};
	if (raw.type === "image" || raw.imageId != null) {
		const il: ImageLayer = {
			...base,
			type: "image",
			imageId: raw.imageId ?? "",
			clipRect: raw.clipRect ?? [0, 0, 0, 0],
			isText: raw.isText ?? false,
		};
		return il;
	}
	if (raw.type === "text" || raw.text != null) {
		const tl: TextLayer = {
			...base,
			type: "text",
			text: raw.text ?? "",
		};
		return tl;
	}
	return null;
}

function mapSlide(raw: RawHvdSlide, width: number, height: number): Slide {
	const layers = raw.layers
		.map((l, idx) => mapLayer(l, idx))
		.filter((l): l is Layer => l != null);
	return {
		id: raw.id,
		uuid: newUuid(),
		width,
		height,
		durationRatio: raw.durationRatio ?? 1,
		joining: raw.joining ?? true,
		disabled: raw.disabled ?? false,
		layers,
	};
}

function mapHvd(raw: RawHvd, fallbackTitle: string): ViewerDocument {
	return {
		title: raw.title ?? fallbackTitle,
		width: raw.screen.width,
		height: raw.screen.height,
		createTime: raw.createTime ?? Date.now(),
		editTime: raw.editTime ?? Date.now(),
		bgColor: raw.bgColor,
		duration: raw.duration,
		interval: raw.interval,
		isSensitive: raw.isSensitive,
		slides: raw.slideData.map((s) => mapSlide(s, raw.screen.width, raw.screen.height)),
	};
}

/**
 * HVD 内の `imageData` (imageId → dataURL) を imageLibraryStore に投入する。
 * 画像不在 (imageData キーなし) の HVD は上書き予防のためスキップし、空 map も折り込む。
 */
function ingestImageData(raw: RawHvd): void {
	const entries = raw.imageData ?? {};
	useImageLibraryStore.getState().setImageLibrary(entries);
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
	const raw = JSON.parse(text) as RawHvd;
	ingestImageData(raw);
	const doc = mapHvd(raw, name);
	console.log("[devFixtureLoader] loaded", { title: doc.title, slides: doc.slides.length, images: Object.keys(raw.imageData ?? {}).length });
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
	const raw = JSON.parse(entry.data) as RawHvd;
	ingestImageData(raw);
	const doc = mapHvd(raw, latest.title);
	console.log("[devFixtureLoader] loaded latest from IDB", {
		title: doc.title,
		slides: doc.slides.length,
		images: Object.keys(raw.imageData ?? {}).length,
		update: new Date(latest.update).toISOString(),
	});
	return doc;
}
