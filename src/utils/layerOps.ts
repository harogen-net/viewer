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
