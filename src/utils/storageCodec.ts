import type { ImageLayer, Layer, TextLayer } from "@/types/Layer";
import { LayerType } from "@/types/Layer";
import type { Slide } from "@/types/Slide";
import type { ViewerDocument } from "@/types/ViewerDocument";
import JSZip from "jszip";
import { PNGEmbedder } from "./PNGEmbedder";
import { newUuid } from "./uuid";

// HVD (Histelle Viewer Data) JSON 形式 ↔ ViewerDocument 純関数 codec
// (v3 Group B build 1、§0-10 新側内製)。
//
// レガシー src/utils/SlideStorage.ts (EventDispatcher class シングルトン) の
// stringifyData / parseData ロジックを純関数として書き直したもの。
// crypto / location / IndexedDB / fetch 等の副作用 API は使わず、純粋に
// (string ↔ object) 変換のみを担う。React / Zustand とも独立。
//
// 副作用 (image library への登録、URL 解決、IDB アクセス) は caller
// (Group B 以降では hooks/useStorage.ts) が担う。

const HVD_VERSION = 3;

// ---- Raw HVD JSON 型定義 (legacy SlideStorage の JSON 構造に対応) ----

export interface RawHvdLayer {
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

export interface RawHvdSlide {
	id: number;
	durationRatio?: number;
	joining?: boolean;
	disabled?: boolean;
	// version >= 2.1 は layers、それ以前 (legacy) は images にレイヤ配列が入る。
	layers?: RawHvdLayer[];
	images?: RawHvdLayer[];
}

export interface RawHvd {
	version: number;
	screen: { width: number; height: number };
	bgColor?: string;
	createTime?: number;
	editTime?: number;
	slideData: RawHvdSlide[];
	imageData?: Record<string, string>;
}

/** parseHvd の戻り値: ViewerDocument 本体 + 切り出した image dataURL 辞書。 */
export interface ParsedHvd {
	doc: ViewerDocument;
	imageData: Record<string, string>;
}

// ---- 補助 ----

// ---- parse ----

function rawToLayer(raw: RawHvdLayer, fallbackId: number): Layer | null {
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
	if (raw.type === LayerType.IMAGE || raw.imageId != null) {
		const il: ImageLayer = {
			...base,
			type: LayerType.IMAGE,
			imageId: raw.imageId ?? "",
			clipRect: raw.clipRect ?? [0, 0, 0, 0],
			isText: raw.isText ?? false,
		};
		return il;
	}
	if (raw.type === LayerType.TEXT || raw.text != null) {
		const tl: TextLayer = {
			...base,
			type: LayerType.TEXT,
			text: raw.text ?? "",
		};
		return tl;
	}
	return null;
}

function rawToSlide(raw: RawHvdSlide, width: number, height: number): Slide {
	// legacy 互換: version >= 2.1 は layers、それ以前は images。どちらも無ければ空配列。
	const rawLayers = raw.layers ?? raw.images ?? [];
	return {
		id: raw.id,
		uuid: newUuid(),
		width,
		height,
		durationRatio: raw.durationRatio ?? 1,
		joining: raw.joining ?? true,
		disabled: raw.disabled ?? false,
		layers: rawLayers.map((l, idx) => rawToLayer(l, idx)).filter((l): l is Layer => l != null),
	};
}

/**
 * HVD JSON 文字列を ViewerDocument + image dataURL map に変換する純関数。
 * fallbackTitle は HVD に title フィールドが無い場合のドキュメント名。
 */
export function parseHvd(jsonText: string, fallbackTitle: string): ParsedHvd {
	const raw = JSON.parse(jsonText) as RawHvd;
	// legacy 互換: 旧形式は screen.width/height が文字列のことがある (legacy は parseInt)。
	const width = Number(raw.screen?.width) || 0;
	const height = Number(raw.screen?.height) || 0;
	const doc: ViewerDocument = {
		title: fallbackTitle,
		width,
		height,
		createTime: raw.createTime ?? Date.now(),
		editTime: raw.editTime ?? Date.now(),
		bgColor: raw.bgColor,
		slides: (raw.slideData ?? []).map((s) => rawToSlide(s, width, height)),
	};
	return { doc, imageData: raw.imageData ?? {} };
}

// ---- serialize ----

/**
 * Layer を HVD レイヤー JSON に変換 (legacy Layer.getData() 互換)。
 * default 値と等しい場合は省略 (visible=true / locked=false / opacity=1 / shared=false / name="")。
 */
function layerToRaw(layer: Layer): RawHvdLayer {
	const out: RawHvdLayer = {
		transX: layer.transX,
		transY: layer.transY,
		scaleX: layer.scaleX,
		scaleY: layer.scaleY,
		rotation: layer.rotation,
		mirrorH: layer.mirrorH,
		mirrorV: layer.mirrorV,
		type: layer.type,
	};
	if (layer.visible !== true) out.visible = layer.visible;
	if (layer.locked !== false) out.locked = layer.locked;
	if (layer.opacity !== 1) out.opacity = layer.opacity;
	if (layer.shared !== false) out.shared = layer.shared;
	if (layer.name !== "") out.name = layer.name;
	if (layer.type === LayerType.IMAGE) {
		const img = layer as ImageLayer;
		out.imageId = img.imageId;
		out.clipRect = [...img.clipRect];
		out.isText = img.isText;
	} else if (layer.type === LayerType.TEXT) {
		out.text = (layer as TextLayer).text;
	}
	return out;
}

function slideToRaw(slide: Slide): RawHvdSlide {
	return {
		id: slide.id,
		durationRatio: slide.durationRatio,
		joining: slide.joining,
		disabled: slide.disabled,
		layers: slide.layers.map(layerToRaw),
	};
}

/**
 * ViewerDocument を HVD JSON 文字列に変換する純関数。
 * imageDataMap は imageId → dataURL の辞書 (空でも可、関連 image layer のみ含めて出力)。
 * legacy SlideStorage.stringifyData と同等のフィールド順序 + 同等の省略ルール。
 * editTime は引数 doc.editTime をそのまま使う (legacy のような自動上書きはしない)。
 */
export function serializeHvd(doc: ViewerDocument, imageDataMap: Record<string, string>): string {
	// フィールド挿入順をレガシー stringifyData (SlideStorage.ts) に合わせて
	// byte-equal 互換を狙う: version → screen → bgColor? → createTime? → editTime?
	// → slideData → imageData。
	const out: Record<string, unknown> = {};
	out.version = HVD_VERSION;
	out.screen = { width: doc.width, height: doc.height };
	if (doc.bgColor) out.bgColor = doc.bgColor;
	if (doc.createTime) out.createTime = doc.createTime;
	if (doc.editTime) out.editTime = doc.editTime;
	out.slideData = doc.slides.map(slideToRaw);

	// imageData は実際に参照されている imageId 分だけ含める (孤児を除外)。
	const usedImageIds = new Set<string>();
	for (const slide of doc.slides) {
		for (const layer of slide.layers) {
			if (layer.type === LayerType.IMAGE) usedImageIds.add((layer as ImageLayer).imageId);
		}
	}
	const imageData: Record<string, string> = {};
	Array.from(usedImageIds).forEach((id) => {
		const dataURL = imageDataMap[id];
		if (dataURL != null) imageData[id] = dataURL;
	});
	out.imageData = imageData;

	return JSON.stringify(out);
}

// ---- HVZ (HVD JSON を ZIP 包装) ----
//
// レガシー src/utils/SlideStorage.ts の HVZ 形式に互換:
//   - ZIP (DEFLATE 圧縮) 内に 1 エントリ `${doc.title}.hvd` (HVD JSON 文字列)
//   - 読み出し時は zip 内の任意の .hvd エントリ (なければ先頭) を解釈
// JSZip は pure utility のため §0-10 で import 可。

/**
 * ViewerDocument を HVZ (HVD JSON を含む zip) として生成。
 * 戻り値は Uint8Array (browser では new Blob([u8a]) でラップ、Node/test では
 * そのまま JSZip.loadAsync に渡せる universal な形)。
 */
export async function serializeHvz(
	doc: ViewerDocument,
	imageDataMap: Record<string, string>
): Promise<Uint8Array> {
	const json = serializeHvd(doc, imageDataMap);
	const zip = new JSZip();
	zip.file(`${doc.title || "document"}.hvd`, json);
	return zip.generateAsync({ type: "uint8array", compression: "DEFLATE" });
}

/**
 * HVZ (zip) を parse。zip 内の .hvd エントリ (なければ先頭) を読み parseHvd へ。
 * input は Blob / ArrayBuffer / Uint8Array 等 JSZip がそのまま受ける形式。
 * fallbackTitle は HVD 内 title 不在時の最終 fallback。
 */
export async function parseHvz(
	buffer: Blob | ArrayBuffer | Uint8Array,
	fallbackTitle: string
): Promise<ParsedHvd> {
	const zip = await JSZip.loadAsync(buffer);
	const entries = Object.values(zip.files).filter((f) => !f.dir);
	if (entries.length === 0) throw new Error("HVZ: zip に有効なエントリがありません");
	const target = entries.find((f) => /\.hvd$/i.test(f.name)) ?? entries[0];
	const text = await target.async("string");
	return parseHvd(text, fallbackTitle);
}

// ---- PNG embedded (HVD JSON を ZIP 化して PNG に埋め込み) ----
//
// レガシー src/utils/SlideStorage.ts の HVDataType.PNG 形式に互換:
//   - 1 つの PNG ファイルに hvDc チャンクとして zip (DEFLATE) を埋め込む
//   - 内部 zip は 1 エントリ "data.hvd" (HVD JSON 文字列、固定名)
//   - ファイル名規約: `[hv]{title}.png` (新側でも caller が prefix を扱う)
// PNGEmbedder は pure util 扱い (§0-10 import 可リスト) で class インスタンスを
// 1 関数内で生成して使い捨てる。
//
// 注: serializePng の thumbnail は実 slide 描画でないと意味がないが、
// Group B 時点では新側 rendering chain (Group A) で SlideView が canvas 出力を
// 直接持っていない。本 build では暫定で 1x1 透明 PNG を base に embed する
// (PNG ファイルとして valid、データ往復は機能)。実 slide thumbnail 生成は
// Group D の AppShell で SlideView canvas 出力経路を整えた後に thumbnail 引数で
// 渡してもらう設計。

// 1x1 transparent PNG (PNGEmbedder.embed の入力ベース用)
const TRANSPARENT_PNG_DATA_URL =
	"data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkAAIAAAoAAv/lxKUAAAAASUVORK5CYII=";

/** base64 → Uint8Array。 */
function base64ToBytes(base64: string): Uint8Array {
	const binary = atob(base64);
	const out = new Uint8Array(binary.length);
	for (let i = 0; i < binary.length; i++) out[i] = binary.charCodeAt(i);
	return out;
}

/** PNGEmbedder.embed (callback-style) を Promise でラップ。 */
function pngEmbedAsync(
	embedder: PNGEmbedder,
	pngDataURL: string,
	bytes: Uint8Array
): Promise<string> {
	return new Promise((resolve) => {
		embedder.embed(pngDataURL, bytes, resolve);
	});
}

/**
 * ViewerDocument を PNG 埋め込み形式 (hvDc チャンクに HVD-zip を含む PNG) として
 * Uint8Array で生成。thumbnailPngDataURL を渡せばその PNG にデータを埋め込む。
 * 省略時は 1x1 透明 PNG を base にする (data 往復のみ、表示用 thumbnail は持たない)。
 */
export async function serializePng(
	doc: ViewerDocument,
	imageDataMap: Record<string, string>,
	options?: { thumbnailPngDataURL?: string }
): Promise<Uint8Array> {
	const json = serializeHvd(doc, imageDataMap);
	const zip = new JSZip();
	zip.file("data.hvd", json);
	const zipU8a = await zip.generateAsync({ type: "uint8array", compression: "DEFLATE" });

	const inputPngDataURL = options?.thumbnailPngDataURL ?? TRANSPARENT_PNG_DATA_URL;
	const embedder = new PNGEmbedder();
	const embeddedDataURL = await pngEmbedAsync(embedder, inputPngDataURL, zipU8a);

	const base64 = embeddedDataURL.split(",", 2)[1] ?? "";
	return base64ToBytes(base64);
}

// PNG 補助チャンク "hvDc" (PNGEmbedder が書き込むデータチャンク) のタイプバイト列。
const PNG_HVDC_CHUNK_TYPE = [0x68, 0x76, 0x44, 0x63]; // "hvDc"

/**
 * PNG バイト列を走査し、指定タイプの補助チャンクの data 部 (view) を返す。無ければ null。
 * PNGEmbedder.process の純バイト版 (dataURL/atob/String.fromCharCode を経由しない):
 * iOS Safari で Blob.arrayBuffer / 手製 base64 往復が不安定なため、バイトを直接読む。
 */
function extractPngChunk(png: Uint8Array, type: number[] = PNG_HVDC_CHUNK_TYPE): Uint8Array | null {
	// 先頭 8 byte は PNG シグネチャ。以降 [length(4)][type(4)][data][crc(4)] の連なり。
	let rpos = 8;
	while (rpos + 8 <= png.length) {
		const dataLength =
			((png[rpos] << 24) | (png[rpos + 1] << 16) | (png[rpos + 2] << 8) | png[rpos + 3]) >>> 0;
		rpos += 4;
		const matched =
			png[rpos] === type[0] &&
			png[rpos + 1] === type[1] &&
			png[rpos + 2] === type[2] &&
			png[rpos + 3] === type[3];
		rpos += 4;
		if (matched) return png.subarray(rpos, rpos + dataLength);
		rpos += dataLength + 4; // data + crc を読み飛ばす
	}
	return null;
}

/**
 * PNG ファイル (hvDc チャンクに HVD-zip を埋め込んだもの) を parse。
 * legacy SlideStorage の PNG 出力 (`[hv]{title}.png`) と互換。
 * バイトから直接チャンクを取り出す (base64 往復をしない = iOS Safari でも安定)。
 */
export async function parsePng(buffer: Uint8Array, fallbackTitle: string): Promise<ParsedHvd> {
	const zipBytes = extractPngChunk(buffer);
	if (!zipBytes) throw new Error("PNG: 埋め込み hvDc チャンクが見つかりません");
	const zip = await JSZip.loadAsync(zipBytes);
	const entry = zip.file("data.hvd");
	if (!entry) throw new Error("PNG: 埋め込み data.hvd エントリなし");
	const text = await entry.async("string");
	return parseHvd(text, fallbackTitle);
}
