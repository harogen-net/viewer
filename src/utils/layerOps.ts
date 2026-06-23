import type { ImageLayer, Layer, LayerBase, TextLayer } from "../types/Layer";
import { LayerType } from "../types/Layer";
import type { SlideState } from "../types/SlideState";

// distributive Omit: union 型に対し各 member ごとに Omit を適用
// (TS の Omit はそのままだと union を 1 つの型として扱い、type 識別子を失う)
type DistributiveOmit<T, K extends keyof T> = T extends unknown ? Omit<T, K> : never;

/** addLayer の引数 layer 型 (id/uuid 自動採番なので除外、type 識別子は保持)。 */
export type NewLayer = DistributiveOmit<Layer, "id" | "uuid">;

// Layer 階層 mutation の純関数群 (v4 Group D D-2)。
// SlideState (selected slide の layers を持つ) を入力に取り、変更後の SlideState を返す。
// すべて (state, args) => state | null の形 (slideOps と同パターン):
//   - 戻り値 null = no-op (selectedIndex 未選択 / 範囲外 / 値変化なし)
//   - 戻り値 SlideState = 変化後 state
//
// 純関数 (副作用なし、入力 state を mutate しない)。
// 主に「selected slide の layers」を操作する。例外:
//   - updateSharedLayer は全 slide を走査して shared layer に patch を当てる (兄弟更新)
//
// 注: shared layer の判定キーは現状 layer.uuid (HVD 非保存の React 識別子) + shared=true。
// 実際の legacy 仕様は image 同一性 / id 等別キーの可能性あり、別タスクで再調査予定。

// --- 内部 helpers ---

/** uuid 生成 (storageCodec / slideFactory と同じパターン)。 */
const newUuid = (): string => {
	const c = (typeof crypto !== "undefined" ? crypto : null) as Crypto | null;
	if (c && typeof c.randomUUID === "function") return c.randomUUID();
	return `r-${Math.random().toString(36).slice(2)}-${Date.now().toString(36)}`;
};

/** layers 配列内の最大 id + 1 (slide 内 unique 担保)。 */
const nextLayerId = (layers: Layer[]): number => {
	let max = 0;
	for (const l of layers) {
		if (l.id > max) max = l.id;
	}
	return max + 1;
};

/**
 * selected slide の layers を updater で変換し新 SlideState を返す。
 * updater が null を返した場合は no-op (state 全体も null)。
 */
const transformSelectedSlideLayers = (
	state: SlideState,
	updater: (layers: Layer[]) => Layer[] | null,
): SlideState | null => {
	const { slides, selectedIndex } = state;
	if (selectedIndex < 0 || selectedIndex >= slides.length) return null;
	const slide = slides[selectedIndex];
	const nextLayers = updater(slide.layers);
	if (!nextLayers) return null;
	const nextSlide = { ...slide, layers: nextLayers };
	const nextSlides = slides.map((s, i) => (i === selectedIndex ? nextSlide : s));
	return { slides: nextSlides, selectedIndex };
};

// --- ops (export) ---

/**
 * 単 layer の共通 (LayerBase) プロパティを更新。
 * type に固有なフィールド (imageId / text 等) は更新できない (専用 op を使う)。
 * 値変化なし / 範囲外は null。
 */
export const updateLayer = (
	state: SlideState,
	layerIndex: number,
	patch: Partial<LayerBase>,
): SlideState | null =>
	transformSelectedSlideLayers(state, (layers) => {
		if (layerIndex < 0 || layerIndex >= layers.length) return null;
		const cur = layers[layerIndex] as unknown as Record<string, unknown>;
		// 値変化を簡易検出 (shallow compare)
		let changed = false;
		for (const key of Object.keys(patch)) {
			if (cur[key] !== (patch as Record<string, unknown>)[key]) {
				changed = true;
				break;
			}
		}
		if (!changed) return null;
		return layers.map((l, i) => (i === layerIndex ? ({ ...l, ...patch } as Layer) : l));
	});

/** image 専用 layer 更新 (clipRect 等含む)。type が image でなければ null。 */
export const updateImageLayer = (
	state: SlideState,
	layerIndex: number,
	patch: Partial<Omit<ImageLayer, "type" | "id" | "uuid">>,
): SlideState | null =>
	transformSelectedSlideLayers(state, (layers) => {
		if (layerIndex < 0 || layerIndex >= layers.length) return null;
		const cur = layers[layerIndex];
		if (cur.type !== LayerType.IMAGE) return null;
		return layers.map((l, i) => (i === layerIndex ? ({ ...l, ...patch } as Layer) : l));
	});

/** text 専用 layer 更新。type が text でなければ null。 */
export const updateTextLayer = (
	state: SlideState,
	layerIndex: number,
	patch: Partial<Omit<TextLayer, "type" | "id" | "uuid">>,
): SlideState | null =>
	transformSelectedSlideLayers(state, (layers) => {
		if (layerIndex < 0 || layerIndex >= layers.length) return null;
		const cur = layers[layerIndex];
		if (cur.type !== LayerType.TEXT) return null;
		return layers.map((l, i) => (i === layerIndex ? ({ ...l, ...patch } as Layer) : l));
	});

/**
 * 末尾 (前面) に layer 追加。id / uuid は自動採番。
 * 引数 layer は id / uuid 以外の完全な layer データ (type 識別子で discriminated)。
 */
export const addLayer = (
	state: SlideState,
	layer: NewLayer,
): SlideState | null =>
	transformSelectedSlideLayers(state, (layers) => {
		const newLayer = {
			...layer,
			id: nextLayerId(layers),
			uuid: newUuid(),
		} as Layer;
		return [...layers, newLayer];
	});

/**
 * テキストレイヤーを新規追加 (末尾 = 前面)。id / uuid は自動採番。
 * legacy EditViewController `.text` (new TextLayer + moveTo(center)) 相当。
 * 配置: transform-origin 50% 50% のため top-left を slide 中央に置く
 * (描画後の実寸が不明なため moveTo の originWidth/Height 補正は省略、初期位置は中央付近)。
 */
export const addTextLayer = (
	state: SlideState,
	text: string,
	slideW: number,
	slideH: number,
): SlideState | null =>
	transformSelectedSlideLayers(state, (layers) => {
		const newLayer: TextLayer = {
			id: nextLayerId(layers),
			uuid: newUuid(),
			name: "",
			opacity: 1,
			locked: false,
			visible: true,
			shared: false,
			transX: slideW / 2,
			transY: slideH / 2,
			scaleX: 1,
			scaleY: 1,
			rotation: 0,
			mirrorH: false,
			mirrorV: false,
			type: LayerType.TEXT,
			text,
		};
		return [...layers, newLayer];
	});

/** layer 削除。範囲外は null。 */
export const removeLayer = (state: SlideState, layerIndex: number): SlideState | null =>
	transformSelectedSlideLayers(state, (layers) => {
		if (layerIndex < 0 || layerIndex >= layers.length) return null;
		return layers.filter((_, i) => i !== layerIndex);
	});

/** layer 複製。新規 id + uuid、直後 (index+1) に挿入。範囲外は null。 */
export const duplicateLayer = (state: SlideState, layerIndex: number): SlideState | null =>
	transformSelectedSlideLayers(state, (layers) => {
		if (layerIndex < 0 || layerIndex >= layers.length) return null;
		const source = layers[layerIndex];
		const duped: Layer = {
			...source,
			id: nextLayerId(layers),
			uuid: newUuid(),
		};
		const next = [...layers];
		next.splice(layerIndex + 1, 0, duped);
		return next;
	});

/** from を to 位置に移動。範囲外 / 同 index は null。 */
export const reorderLayer = (
	state: SlideState,
	fromIndex: number,
	toIndex: number,
): SlideState | null =>
	transformSelectedSlideLayers(state, (layers) => {
		if (
			fromIndex === toIndex ||
			fromIndex < 0 ||
			fromIndex >= layers.length ||
			toIndex < 0 ||
			toIndex >= layers.length
		) {
			return null;
		}
		const next = [...layers];
		const [moved] = next.splice(fromIndex, 1);
		next.splice(toIndex, 0, moved);
		return next;
	});

/** 最前面 (末尾) へ移動。すでに末尾なら null。 */
export const bringToFront = (state: SlideState, layerIndex: number): SlideState | null =>
	transformSelectedSlideLayers(state, (layers) => {
		if (layerIndex < 0 || layerIndex >= layers.length - 1) return null;
		const next = [...layers];
		const [moved] = next.splice(layerIndex, 1);
		next.push(moved);
		return next;
	});

/** 最背面 (先頭) へ移動。すでに先頭なら null。 */
export const sendToBack = (state: SlideState, layerIndex: number): SlideState | null =>
	transformSelectedSlideLayers(state, (layers) => {
		if (layerIndex <= 0 || layerIndex >= layers.length) return null;
		const next = [...layers];
		const [moved] = next.splice(layerIndex, 1);
		next.unshift(moved);
		return next;
	});

/** 1 段前 (index + 1) へ移動。最前面なら null。 */
export const bringForward = (state: SlideState, layerIndex: number): SlideState | null =>
	reorderLayer(state, layerIndex, layerIndex + 1);

/** 1 段後 (index - 1) へ移動。最背面なら null。 */
export const sendBackward = (state: SlideState, layerIndex: number): SlideState | null =>
	reorderLayer(state, layerIndex, layerIndex - 1);

/**
 * shared layer の兄弟更新 (全 slide 走査)。
 * 同 uuid + shared=true な layer すべてに patch を当てる。
 * 該当 1 件もなければ null (no-op)。
 *
 * 注: 現状の判定キーは uuid + shared=true (最小実装)。
 * legacy 仕様の shared semantics は別タスクで再調査予定。
 */
export const updateSharedLayer = (
	state: SlideState,
	sharedUuid: string,
	patch: Partial<LayerBase>,
): SlideState | null => {
	let anyChanged = false;
	const nextSlides = state.slides.map((slide) => {
		let slideChanged = false;
		const nextLayers = slide.layers.map((l) => {
			if (l.uuid === sharedUuid && l.shared) {
				slideChanged = true;
				return { ...l, ...patch } as Layer;
			}
			return l;
		});
		if (slideChanged) {
			anyChanged = true;
			return { ...slide, layers: nextLayers };
		}
		return slide;
	});
	if (!anyChanged) return null;
	return { slides: nextSlides, selectedIndex: state.selectedIndex };
};

/**
 * 指定 imageId を参照する ImageLayer を全 slide から削除 (v4 Group D D-6a)。
 * legacy ImageManager.deleteImageById の cascade 削除相当 (shared layer も例外なく削除)。
 * 該当 0 件なら null。
 */
export const removeLayersByImageId = (
	state: SlideState,
	imageId: string,
): SlideState | null => {
	let anyChanged = false;
	const nextSlides = state.slides.map((slide) => {
		const filtered = slide.layers.filter(
			(l) => !(l.type === LayerType.IMAGE && l.imageId === imageId),
		);
		if (filtered.length !== slide.layers.length) {
			anyChanged = true;
			return { ...slide, layers: filtered };
		}
		return slide;
	});
	if (!anyChanged) return null;
	return { slides: nextSlides, selectedIndex: state.selectedIndex };
};

/**
 * 指定 layerIndex (selected slide) の ImageLayer の imageId のみを差し替え (v4 Group D D-6b)。
 * legacy 画像差替 (単体) 相当。transform / clipRect 等は維持。
 *   - 範囲外 / 非 image 型 / 同 imageId は null。
 */
export const replaceImageId = (
	state: SlideState,
	layerIndex: number,
	newImageId: string,
): SlideState | null =>
	transformSelectedSlideLayers(state, (layers) => {
		if (layerIndex < 0 || layerIndex >= layers.length) return null;
		const cur = layers[layerIndex];
		if (cur.type !== LayerType.IMAGE) return null;
		if (cur.imageId === newImageId) return null;
		return layers.map((l, i) =>
			i === layerIndex ? ({ ...cur, imageId: newImageId } as Layer) : l,
		);
	});

/**
 * 全 slide の同 oldImageId を参照する ImageLayer の imageId を newImageId に置換 (v4 Group D D-6b)。
 * legacy 画像差替 (同一参照画像をまとめて差替) 相当。transform / clipRect 等は維持。
 *   - 同 id / 該当 0 件は null。
 */
export const replaceImageIdAll = (
	state: SlideState,
	oldImageId: string,
	newImageId: string,
): SlideState | null => {
	if (oldImageId === newImageId) return null;
	let anyChanged = false;
	const nextSlides = state.slides.map((slide) => {
		let slideChanged = false;
		const nextLayers = slide.layers.map((l) => {
			if (l.type === LayerType.IMAGE && l.imageId === oldImageId) {
				slideChanged = true;
				return { ...l, imageId: newImageId } as Layer;
			}
			return l;
		});
		if (slideChanged) {
			anyChanged = true;
			return { ...slide, layers: nextLayers };
		}
		return slide;
	});
	if (!anyChanged) return null;
	return { slides: nextSlides, selectedIndex: state.selectedIndex };
};

// --- transform ops (v4 Group D D-4b) ---

/** rotation += deltaDeg。値変化なし (delta=0) は null。 */
export const rotateBy = (state: SlideState, layerIndex: number, deltaDeg: number): SlideState | null =>
	transformSelectedSlideLayers(state, (layers) => {
		if (layerIndex < 0 || layerIndex >= layers.length) return null;
		if (deltaDeg === 0) return null;
		const cur = layers[layerIndex];
		return layers.map((l, i) =>
			i === layerIndex ? ({ ...cur, rotation: cur.rotation + deltaDeg } as Layer) : l,
		);
	});

/** rotation = 0。すでに 0 なら null。 */
export const resetRotation = (state: SlideState, layerIndex: number): SlideState | null =>
	transformSelectedSlideLayers(state, (layers) => {
		if (layerIndex < 0 || layerIndex >= layers.length) return null;
		const cur = layers[layerIndex];
		if (cur.rotation === 0) return null;
		return layers.map((l, i) => (i === layerIndex ? ({ ...cur, rotation: 0 } as Layer) : l));
	});

/** mirrorH を toggle。 */
export const toggleMirrorH = (state: SlideState, layerIndex: number): SlideState | null =>
	transformSelectedSlideLayers(state, (layers) => {
		if (layerIndex < 0 || layerIndex >= layers.length) return null;
		const cur = layers[layerIndex];
		return layers.map((l, i) => (i === layerIndex ? ({ ...cur, mirrorH: !cur.mirrorH } as Layer) : l));
	});

/** mirrorV を toggle。 */
export const toggleMirrorV = (state: SlideState, layerIndex: number): SlideState | null =>
	transformSelectedSlideLayers(state, (layers) => {
		if (layerIndex < 0 || layerIndex >= layers.length) return null;
		const cur = layers[layerIndex];
		return layers.map((l, i) => (i === layerIndex ? ({ ...cur, mirrorV: !cur.mirrorV } as Layer) : l));
	});

/** opacity = 1。すでに 1 なら null。 */
export const resetOpacity = (state: SlideState, layerIndex: number): SlideState | null =>
	transformSelectedSlideLayers(state, (layers) => {
		if (layerIndex < 0 || layerIndex >= layers.length) return null;
		const cur = layers[layerIndex];
		if (cur.opacity === 1) return null;
		return layers.map((l, i) => (i === layerIndex ? ({ ...cur, opacity: 1 } as Layer) : l));
	});

/**
 * slide 寸法に fit-to-area (aspect 維持で最大化、中央配置)。
 * legacy Slide.fitLayer 互換:
 *   - rotation ±90° なら content の W/H を入れ替えて scale を計算
 *   - scale1 = min(scaleX, scaleY) (fit), scale2 = max (cover)
 *   - 既に中央 + scale1 なら scale2 に toggle (legacy の小細工)
 *   - それ以外は scale1 + 中央
 * - contentW/contentH は呼び出し側 (DOM 計測) から渡す。0 以下なら null。
 * - 結果が現在と一致なら null (no-op)。
 */
export const fitToSlide = (
	state: SlideState,
	layerIndex: number,
	slideW: number,
	slideH: number,
	contentW: number,
	contentH: number,
): SlideState | null =>
	transformSelectedSlideLayers(state, (layers) => {
		if (layerIndex < 0 || layerIndex >= layers.length) return null;
		if (contentW <= 0 || contentH <= 0) return null;
		const cur = layers[layerIndex];
		const isQuarter = cur.rotation === 90 || cur.rotation === -90;
		const sx = isQuarter ? slideW / contentH : slideW / contentW;
		const sy = isQuarter ? slideH / contentW : slideH / contentH;
		const scale1 = Math.min(sx, sy);
		const scale2 = Math.max(sx, sy);
		const slideCx = slideW / 2;
		const slideCy = slideH / 2;
		const curCx = cur.transX + contentW / 2;
		const curCy = cur.transY + contentH / 2;
		const isCentered = curCx === slideCx && curCy === slideCy;
		// legacy compRatio (= 1e10) で scale 一致判定
		const COMP_RATIO = 1e10;
		const isScale1 = Math.round(cur.scaleX * COMP_RATIO) === Math.round(scale1 * COMP_RATIO);
		const targetScale = isCentered && isScale1 ? scale2 : scale1;
		const newTransX = slideCx - contentW / 2;
		const newTransY = slideCy - contentH / 2;
		// 値変化検出
		if (
			cur.scaleX === targetScale &&
			cur.scaleY === targetScale &&
			cur.transX === newTransX &&
			cur.transY === newTransY
		) {
			return null;
		}
		return layers.map((l, i) =>
			i === layerIndex
				? ({
						...cur,
						scaleX: targetScale,
						scaleY: targetScale,
						transX: newTransX,
						transY: newTransY,
					} as Layer)
				: l,
		);
	});

export type AlignEdge = "top" | "right" | "bottom" | "left";

/**
 * layer の visual bounding box (回転考慮) を返す。
 * legacy Layer.bounds 互換: 4 corner を rotate して max(|x|)*2, max(|y|)*2。
 * mirror は visual サイズに影響しない (|scale| 経由で吸収済み)。
 */
const getVisualBounds = (
	contentW: number,
	contentH: number,
	scaleX: number,
	scaleY: number,
	rotationDeg: number,
): { w: number; h: number } => {
	const halfW = (contentW * Math.abs(scaleX)) / 2;
	const halfH = (contentH * Math.abs(scaleY)) / 2;
	const rad = (rotationDeg * Math.PI) / 180;
	const cos = Math.cos(rad);
	const sin = Math.sin(rad);
	const corners: [number, number][] = [
		[halfW, halfH],
		[-halfW, halfH],
		[-halfW, -halfH],
		[halfW, -halfH],
	];
	let maxX = 0;
	let maxY = 0;
	for (const [x, y] of corners) {
		const nx = cos * x - sin * y;
		const ny = cos * y + sin * x;
		if (nx > maxX) maxX = nx;
		if (ny > maxY) maxY = ny;
	}
	return { w: maxX * 2, h: maxY * 2 };
};

/**
 * slide の端 (上/右/下/左) に layer の visual bbox が接するように移動。
 * legacy Slide.arrangeLayer(Direction) 互換:
 *   - TOP:    visual center.y = bounds.h / 2 (visual top が y=0 に接する)
 *   - BOTTOM: visual center.y = slideH - bounds.h / 2
 *   - LEFT:   visual center.x = bounds.w / 2
 *   - RIGHT:  visual center.x = slideW - bounds.w / 2
 * visual center → transform 値: transX = center.x - contentW/2 (transY も同様)。
 * - contentW/H は呼び出し側 (DOM 計測) から渡す。0 以下なら null。
 * - 値変化なし (既に端) なら null。
 */
export const alignTo = (
	state: SlideState,
	layerIndex: number,
	edge: AlignEdge,
	slideW: number,
	slideH: number,
	contentW: number,
	contentH: number,
): SlideState | null =>
	transformSelectedSlideLayers(state, (layers) => {
		if (layerIndex < 0 || layerIndex >= layers.length) return null;
		if (contentW <= 0 || contentH <= 0) return null;
		const cur = layers[layerIndex];
		const bounds = getVisualBounds(contentW, contentH, cur.scaleX, cur.scaleY, cur.rotation);
		let newTransX = cur.transX;
		let newTransY = cur.transY;
		switch (edge) {
			case "top":
				newTransY = bounds.h / 2 - contentH / 2;
				break;
			case "bottom":
				newTransY = slideH - bounds.h / 2 - contentH / 2;
				break;
			case "left":
				newTransX = bounds.w / 2 - contentW / 2;
				break;
			case "right":
				newTransX = slideW - bounds.w / 2 - contentW / 2;
				break;
		}
		if (cur.transX === newTransX && cur.transY === newTransY) return null;
		return layers.map((l, i) =>
			i === layerIndex ? ({ ...cur, transX: newTransX, transY: newTransY } as Layer) : l,
		);
	});
