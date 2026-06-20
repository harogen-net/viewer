import type { ImageLayer, Layer, TextLayer } from "../types/Layer";
import { LayerType } from "../types/Layer";
import type { Slide } from "../types/Slide";
import type { ViewerDocument } from "../types/ViewerDocument";

// HVD (Histelle Viewer Data) JSON 形式 ↔ ViewerDocument 純関数 codec
// (v3 Group B build 1、§0-10 新側内製)。
//
// レガシー src/utils/SlideStorage.ts (EventDispatcher class シングルトン) の
// stringifyData / parseData ロジックを純関数として書き直したもの。
// crypto / location / IndexedDB / fetch 等の副作用 API は使わず、純粋に
// (string ↔ object) 変換のみを担う。React / Zustand とも独立。
//
// 副作用 (image library への登録、URL 解決、IDB アクセス) は caller (Group B
// では hooks/useStorage.ts、Group A では devFixtureLoader.ts) が担う。

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
	layers: RawHvdLayer[];
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

// uuid 生成は crypto.randomUUID() があればそれを、無ければ雑な乱数ベースで。
// 純関数性を厳密に追わない (uuid は HVD 非保存 = 副作用としても無害)。
function newUuid(): string {
	const c = (typeof crypto !== "undefined" ? crypto : null) as Crypto | null;
	if (c && typeof c.randomUUID === "function") return c.randomUUID();
	return `r-${Math.random().toString(36).slice(2)}-${Date.now().toString(36)}`;
}

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
	return {
		id: raw.id,
		uuid: newUuid(),
		width,
		height,
		durationRatio: raw.durationRatio ?? 1,
		joining: raw.joining ?? true,
		disabled: raw.disabled ?? false,
		layers: raw.layers.map((l, idx) => rawToLayer(l, idx)).filter((l): l is Layer => l != null),
	};
}

/**
 * HVD JSON 文字列を ViewerDocument + image dataURL map に変換する純関数。
 * fallbackTitle は HVD に title フィールドが無い場合のドキュメント名。
 */
export function parseHvd(jsonText: string, fallbackTitle: string): ParsedHvd {
	const raw = JSON.parse(jsonText) as RawHvd;
	const doc: ViewerDocument = {
		title: fallbackTitle,
		width: raw.screen.width,
		height: raw.screen.height,
		createTime: raw.createTime ?? Date.now(),
		editTime: raw.editTime ?? Date.now(),
		bgColor: raw.bgColor,
		slides: raw.slideData.map((s) => rawToSlide(s, raw.screen.width, raw.screen.height)),
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
