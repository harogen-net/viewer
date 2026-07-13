import type { ImageLayer, Layer, LayerBase, TextLayer } from "@/types/Layer";
import { LayerType } from "@/types/Layer";
import type { Slide } from "@/types/Slide";
import type { SlideState } from "@/types/SlideState";
import { newUuid } from "./uuid";

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
//   - プロパティ編集系 (updateLayer / updateImageLayer / updateTextLayer / rotateBy /
//     resetRotation / toggleMirrorH/V / resetOpacity / fitToSlide / alignTo) は withLayerSync で
//     兄弟同期を後付けする (§7):
//       - 編集対象が shared=true → 連続する隣接スライドの shared 兄弟へ変化分を伝播 (D-15)
//       - shared でなく rectEdit 有効 → 全スライドの同矩形 image layer へ transform を伝播 (D-18)
//     (shared を優先。legacy 同様 shared 層では rectEdit を無視)
//
// shared 兄弟の判定キー (legacy listSharedLayers): shared=true かつ 同 type かつ
//   (image=imageId / text=text 一致)。uuid は使わない。連続隣接のみ (途切れたら打ち切り)。
// rect 兄弟の判定キー (legacy listRectLayers): image のみ、自然寸法 + transX/transY/scaleX/scaleY/
//   mirrorH/mirrorV 一致 (rotation は判定外)。全スライド走査。自然寸法は setRectSyncConfig で注入。

// --- 内部 helpers ---

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
	updater: (layers: Layer[]) => Layer[] | null
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

// --- shared layer 連動 (§7、legacy EditableSlideView.listSharedLayers / multipleLayerOperation) ---

// 兄弟へ同期するプロパティ (legacy multipleLayerOperation の flag セット準拠)。
// name / id / uuid は同期しない。
const SHARED_SYNC_KEYS = [
	"transX",
	"transY",
	"scaleX",
	"scaleY",
	"rotation",
	"mirrorH",
	"mirrorV",
	"visible",
	"locked",
	"opacity",
	"imageId",
	"clipRect",
	"isText",
	"text",
] as const;

const valueEq = (a: unknown, b: unknown): boolean => {
	if (Array.isArray(a) && Array.isArray(b)) {
		return a.length === b.length && a.every((v, i) => v === b[i]);
	}
	return a === b;
};

// 編集前後の layer を比較し、同期対象プロパティのうち変化したものだけを patch にする。
const diffSyncedProps = (prev: Layer, next: Layer): Record<string, unknown> => {
	const p = prev as unknown as Record<string, unknown>;
	const n = next as unknown as Record<string, unknown>;
	const patch: Record<string, unknown> = {};
	for (const k of SHARED_SYNC_KEYS) {
		if (k in n && !valueEq(p[k], n[k])) patch[k] = n[k];
	}
	return patch;
};

// 内容同一性判定: 同 type かつ (image=imageId / text=text 一致)。shared フラグは見ない。
const matchesIdentity = (ref: Layer, candidate: Layer): boolean => {
	if (ref.type !== candidate.type) return false;
	if (ref.type === LayerType.IMAGE && candidate.type === LayerType.IMAGE) {
		return ref.imageId === candidate.imageId;
	}
	if (ref.type === LayerType.TEXT && candidate.type === LayerType.TEXT) {
		return ref.text === candidate.text;
	}
	return false;
};

// shared の「兄弟」判定: shared=true かつ 内容同一。
const matchesShared = (ref: Layer, candidate: Layer): boolean =>
	candidate.shared && matchesIdentity(ref, candidate);

// 自スライドの前後へ「連続する隣接スライド」のみ走査し、各スライドで最初にマッチした
// shared 兄弟の位置を集める (マッチが途切れたスライドで打ち切り、legacy listSharedLayers)。
const findSharedSiblingPositions = (
	slides: Slide[],
	slideIndex: number,
	ref: Layer
): Array<{ si: number; li: number }> => {
	const positions: Array<{ si: number; li: number }> = [];
	if (!ref.shared) return positions;
	const scan = (step: number): void => {
		for (let si = slideIndex + step; si >= 0 && si < slides.length; si += step) {
			const li = slides[si].layers.findIndex((l) => matchesShared(ref, l));
			if (li < 0) break; // 連続が途切れたら打ち切り
			positions.push({ si, li });
		}
	};
	scan(1);
	scan(-1);
	return positions;
};

// 指定位置群の layer に patch を当てた新 slides を返す (shared / rect 共通)。
const applyPatchAtPositions = (
	slides: Slide[],
	positions: Array<{ si: number; li: number }>,
	patch: Record<string, unknown>
): Slide[] => {
	const bySlide = new Map<number, Set<number>>();
	for (const { si, li } of positions) {
		const set = bySlide.get(si) ?? new Set<number>();
		set.add(li);
		bySlide.set(si, set);
	}
	return slides.map((slide, si) => {
		const lis = bySlide.get(si);
		if (!lis) return slide;
		const layers = slide.layers.map((l, li) => (lis.has(li) ? ({ ...l, ...patch } as Layer) : l));
		return { ...slide, layers };
	});
};

// 編集済み next state の shared 兄弟へ、変化プロパティを伝播する。
// 兄弟探索は編集前 layer の identity (旧 imageId/text) で行うため、imageId 変更時も
// 旧 id でマッチした兄弟に新 id を patch する (legacy 挙動)。
const propagateToSharedSiblings = (
	prevState: SlideState,
	nextState: SlideState,
	slideIndex: number,
	layerIndex: number
): SlideState => {
	if (slideIndex < 0) return nextState;
	const prevLayer = prevState.slides[slideIndex]?.layers[layerIndex];
	const nextLayer = nextState.slides[slideIndex]?.layers[layerIndex];
	if (!prevLayer || !nextLayer || !prevLayer.shared) return nextState;
	const patch = diffSyncedProps(prevLayer, nextLayer);
	if (Object.keys(patch).length === 0) return nextState;
	const positions = findSharedSiblingPositions(nextState.slides, slideIndex, prevLayer);
	if (positions.length === 0) return nextState;
	return {
		slides: applyPatchAtPositions(nextState.slides, positions, patch),
		selectedIndex: nextState.selectedIndex,
	};
};

// --- rectEdit (矩形連動編集、§7 D-18、legacy listRectLayers / _rectEdit) ---

// rect 同期で兄弟へコピーする transform プロパティ (legacy flagForRect、rotation を含む)。
const RECT_SYNC_KEYS = [
	"transX",
	"transY",
	"scaleX",
	"scaleY",
	"mirrorH",
	"mirrorV",
	"rotation",
] as const;

// rectEdit の実行時コンテキスト: UI トグル + 画像自然寸法 (imageId → {w,h})。
// 純粋な layer データだけでは originWidth/Height を判定できないため、
// useRectSyncConfig hook が editViewStore.rectEdit + imageLibraryStore の寸法を流し込む。
// default は無効 (enabled=false) なので、設定されない限り rect 同期は一切起きない。
interface RectSyncConfig {
	enabled: boolean;
	dims: Record<string, { w: number; h: number }>;
}
let rectSyncConfig: RectSyncConfig = { enabled: false, dims: {} };
export const setRectSyncConfig = (cfg: RectSyncConfig): void => {
	rectSyncConfig = cfg;
};

// 矩形一致キー: image のみ。[自然幅, 自然高, transX, transY, scaleX, scaleY, mirrorH, mirrorV]。
// rotation は一致判定に含めない (legacy listRectLayers と同じ)。寸法不明なら null。
const rectKey = (
	layer: Layer,
	dims: RectSyncConfig["dims"]
): [number, number, number, number, number, number, boolean, boolean] | null => {
	if (layer.type !== LayerType.IMAGE) return null;
	const d = dims[layer.imageId];
	if (!d) return null;
	return [
		d.w,
		d.h,
		layer.transX,
		layer.transY,
		layer.scaleX,
		layer.scaleY,
		layer.mirrorH,
		layer.mirrorV,
	];
};

const rectKeyEq = (a: ReturnType<typeof rectKey>, b: ReturnType<typeof rectKey>): boolean => {
	if (!a || !b) return false;
	return a.every((v, i) => v === b[i]);
};

// 全スライドを走査し、編集前 layer と同矩形 (rectKey 一致) な image layer の位置を集める。
// 自身 (slideIndex, layerIndex) は除外。1 スライド複数可 (legacy は break しない)。
const findRectSiblingPositions = (
	slides: Slide[],
	slideIndex: number,
	layerIndex: number,
	refKey: ReturnType<typeof rectKey>
): Array<{ si: number; li: number }> => {
	const positions: Array<{ si: number; li: number }> = [];
	if (!refKey) return positions;
	for (let si = 0; si < slides.length; si++) {
		const layers = slides[si].layers;
		for (let li = 0; li < layers.length; li++) {
			if (si === slideIndex && li === layerIndex) continue;
			if (rectKeyEq(refKey, rectKey(layers[li], rectSyncConfig.dims))) {
				positions.push({ si, li });
			}
		}
	}
	return positions;
};

// 編集済み next state の同矩形 layer へ transform 変化分を伝播する。
const propagateToRectSiblings = (
	prevState: SlideState,
	nextState: SlideState,
	slideIndex: number,
	layerIndex: number
): SlideState => {
	if (slideIndex < 0) return nextState;
	const prevLayer = prevState.slides[slideIndex]?.layers[layerIndex];
	const nextLayer = nextState.slides[slideIndex]?.layers[layerIndex];
	if (!prevLayer || !nextLayer || prevLayer.type !== LayerType.IMAGE) return nextState;
	// 変化した rect 同期プロパティのみ patch
	const p = prevLayer as unknown as Record<string, unknown>;
	const n = nextLayer as unknown as Record<string, unknown>;
	const patch: Record<string, unknown> = {};
	for (const k of RECT_SYNC_KEYS) {
		if (p[k] !== n[k]) patch[k] = n[k];
	}
	if (Object.keys(patch).length === 0) return nextState;
	// 兄弟探索は編集前の矩形で行う (next では編集対象だけが動いている)。
	const refKey = rectKey(prevLayer, rectSyncConfig.dims);
	const positions = findRectSiblingPositions(nextState.slides, slideIndex, layerIndex, refKey);
	if (positions.length === 0) return nextState;
	return {
		slides: applyPatchAtPositions(nextState.slides, positions, patch),
		selectedIndex: nextState.selectedIndex,
	};
};

// プロパティ編集系 op の結果に「shared 兄弟同期」または「rect 連動同期」を後付けするラッパ。
// shared を優先 (legacy: shared 層では rectEdit を無視)。next が null (no-op) ならそのまま null。
const withLayerSync = (
	prev: SlideState,
	layerIndex: number,
	next: SlideState | null
): SlideState | null => {
	if (!next) return null;
	const si = prev.selectedIndex;
	const prevLayer = prev.slides[si]?.layers[layerIndex];
	if (!prevLayer) return next;
	if (prevLayer.shared) return propagateToSharedSiblings(prev, next, si, layerIndex);
	if (rectSyncConfig.enabled) return propagateToRectSiblings(prev, next, si, layerIndex);
	return next;
};

/**
 * 選択 slide の layer を前後の連続スライドへ「展開 (spread)」する (§7、legacy spreadLayers)。
 *   - source を shared=true 化
 *   - 前後それぞれの隣接スライドを走査し、各スライドで内容同一な layer を探す:
 *       - 見つからなければ source の clone (新 id/uuid、shared=true) を source と同じ index に挿入
 *       - 非 shared なマッチ層があれば shared=true 化
 *       - 既に shared なマッチ層に到達したらその方向の走査を打ち切り (展開済みグループの端)
 * 変化が無ければ null (no-op)。
 */
export const spreadLayer = (state: SlideState, layerIndex: number): SlideState | null => {
	const { slides, selectedIndex } = state;
	if (selectedIndex < 0 || selectedIndex >= slides.length) return null;
	const source = slides[selectedIndex].layers[layerIndex];
	if (!source) return null;

	// 各 slide の layers を浅コピーした作業バッファ (layer オブジェクトは変更時のみ差し替え)。
	const buf: Layer[][] = slides.map((s) => [...s.layers]);
	let changed = !source.shared; // source を shared 化したら変化扱い

	// source を shared=true に
	buf[selectedIndex][layerIndex] = { ...source, shared: true };
	const insertIndex = layerIndex;

	const walk = (step: number): void => {
		for (let si = selectedIndex + step; si >= 0 && si < slides.length; si += step) {
			const layers = buf[si];
			const li = layers.findIndex((l) => matchesIdentity(source, l));
			if (li >= 0) {
				if (layers[li].shared) break; // 既存 shared に到達 → 打ち切り
				layers[li] = { ...layers[li], shared: true };
				changed = true;
			} else {
				const clone = {
					...source,
					id: nextLayerId(layers),
					uuid: newUuid(),
					shared: true,
				} as Layer;
				layers.splice(Math.min(insertIndex, layers.length), 0, clone);
				changed = true;
			}
		}
	};
	walk(1);
	walk(-1);

	if (!changed) return null;
	const nextSlides = slides.map((s, i) => ({ ...s, layers: buf[i] }));
	return { slides: nextSlides, selectedIndex };
};

/**
 * 選択 layer の「連続隣接スライドにある shared 兄弟」の数を返す (§7、削除確認 UI 用)。
 * shared でない / 兄弟なしは 0。
 */
export const sharedSiblingCount = (state: SlideState, layerIndex: number): number => {
	const { slides, selectedIndex } = state;
	const layer = slides[selectedIndex]?.layers[layerIndex];
	if (!layer || !layer.shared) return 0;
	return findSharedSiblingPositions(slides, selectedIndex, layer).length;
};

/**
 * 選択 layer とその連続隣接 shared 兄弟をまとめて削除する (§7、legacy shared 連鎖削除)。
 * shared でなければ当該 layer のみ削除 (= removeLayer 相当)。範囲外 / 未選択は null。
 */
export const removeLayerWithSharedSiblings = (
	state: SlideState,
	layerIndex: number
): SlideState | null => {
	const { slides, selectedIndex } = state;
	if (selectedIndex < 0 || selectedIndex >= slides.length) return null;
	const layer = slides[selectedIndex]?.layers[layerIndex];
	if (!layer) return null;
	const siblings = layer.shared ? findSharedSiblingPositions(slides, selectedIndex, layer) : [];
	const removeBySlide = new Map<number, Set<number>>();
	const mark = (si: number, li: number): void => {
		const set = removeBySlide.get(si) ?? new Set<number>();
		set.add(li);
		removeBySlide.set(si, set);
	};
	mark(selectedIndex, layerIndex);
	for (const { si, li } of siblings) mark(si, li);
	const nextSlides = slides.map((slide, si) => {
		const lis = removeBySlide.get(si);
		if (!lis) return slide;
		return { ...slide, layers: slide.layers.filter((_, li) => !lis.has(li)) };
	});
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
	patch: Partial<LayerBase>
): SlideState | null =>
	withLayerSync(
		state,
		layerIndex,
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
		})
	);

/** image 専用 layer 更新 (clipRect 等含む)。type が image でなければ null。 */
export const updateImageLayer = (
	state: SlideState,
	layerIndex: number,
	patch: Partial<Omit<ImageLayer, "type" | "id" | "uuid">>
): SlideState | null =>
	withLayerSync(
		state,
		layerIndex,
		transformSelectedSlideLayers(state, (layers) => {
			if (layerIndex < 0 || layerIndex >= layers.length) return null;
			const cur = layers[layerIndex];
			if (cur.type !== LayerType.IMAGE) return null;
			return layers.map((l, i) => (i === layerIndex ? ({ ...l, ...patch } as Layer) : l));
		})
	);

/** text 専用 layer 更新。type が text でなければ null。 */
export const updateTextLayer = (
	state: SlideState,
	layerIndex: number,
	patch: Partial<Omit<TextLayer, "type" | "id" | "uuid">>
): SlideState | null =>
	withLayerSync(
		state,
		layerIndex,
		transformSelectedSlideLayers(state, (layers) => {
			if (layerIndex < 0 || layerIndex >= layers.length) return null;
			const cur = layers[layerIndex];
			if (cur.type !== LayerType.TEXT) return null;
			return layers.map((l, i) => (i === layerIndex ? ({ ...l, ...patch } as Layer) : l));
		})
	);

/**
 * 画像を slide に contain fit 配置する ImageLayer プロパティ (id/uuid 未採番) を生成 (D-11/D-12 共通)。
 * legacy EditableSlideView drop / ListViewController drop の配置ロジックを移植:
 *   - 0° と -90° の contain scale を比較し、より大きく収まる向きを採用 (縦長画像の自動回転)
 *     (legacy `originHeight > originWidth*1.2` で -90° を、scale 比較に一般化)
 *   - visual center を slide 中央に配置 (transform-origin 50% 50%、回転は中心軸)
 * scale 同点なら 0° (無回転) を優先。
 */
export const buildFitImageLayer = (
	slideW: number,
	slideH: number,
	imgW: number,
	imgH: number,
	imageId: string,
	name = ""
): NewLayer => {
	const scale0 = Math.min(slideW / imgW, slideH / imgH);
	const scaleR = Math.min(slideW / imgH, slideH / imgW);
	const useRotation = scaleR > scale0;
	const scale = useRotation ? scaleR : scale0;
	return {
		name,
		opacity: 1,
		locked: false,
		visible: true,
		shared: false,
		transX: slideW / 2 - imgW / 2,
		transY: slideH / 2 - imgH / 2,
		scaleX: scale,
		scaleY: scale,
		rotation: useRotation ? -90 : 0,
		mirrorH: false,
		mirrorV: false,
		type: "image",
		imageId,
		clipRect: [0, 0, 0, 0],
		isText: false,
	};
};

/**
 * 末尾 (前面) に layer 追加。id / uuid は自動採番。
 * 引数 layer は id / uuid 以外の完全な layer データ (type 識別子で discriminated)。
 */
export const addLayer = (state: SlideState, layer: NewLayer): SlideState | null =>
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
	slideH: number
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
	toIndex: number
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
 * 指定 imageId を参照する ImageLayer を全 slide から削除 (v4 Group D D-6a)。
 * legacy ImageManager.deleteImageById の cascade 削除相当 (shared layer も例外なく削除)。
 * 該当 0 件なら null。
 */
export const removeLayersByImageId = (state: SlideState, imageId: string): SlideState | null => {
	let anyChanged = false;
	const nextSlides = state.slides.map((slide) => {
		const filtered = slide.layers.filter(
			(l) => !(l.type === LayerType.IMAGE && l.imageId === imageId)
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
	newImageId: string
): SlideState | null =>
	// shared 層なら差し替えた imageId を兄弟へ伝播する (兄弟探索は編集前=旧 imageId で行われる)。
	// updateImageLayer と同じく withLayerSync を通す。
	withLayerSync(
		state,
		layerIndex,
		transformSelectedSlideLayers(state, (layers) => {
			if (layerIndex < 0 || layerIndex >= layers.length) return null;
			const cur = layers[layerIndex];
			if (cur.type !== LayerType.IMAGE) return null;
			if (cur.imageId === newImageId) return null;
			return layers.map((l, i) =>
				i === layerIndex ? ({ ...cur, imageId: newImageId } as Layer) : l
			);
		})
	);

/**
 * 全 slide の同 oldImageId を参照する ImageLayer の imageId を newImageId に置換 (v4 Group D D-6b)。
 * legacy 画像差替 (同一参照画像をまとめて差替) 相当。transform / clipRect 等は維持。
 *   - 同 id / 該当 0 件は null。
 */
export const replaceImageIdAll = (
	state: SlideState,
	oldImageId: string,
	newImageId: string
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
export const rotateBy = (
	state: SlideState,
	layerIndex: number,
	deltaDeg: number
): SlideState | null =>
	withLayerSync(
		state,
		layerIndex,
		transformSelectedSlideLayers(state, (layers) => {
			if (layerIndex < 0 || layerIndex >= layers.length) return null;
			if (deltaDeg === 0) return null;
			const cur = layers[layerIndex];
			return layers.map((l, i) =>
				i === layerIndex ? ({ ...cur, rotation: cur.rotation + deltaDeg } as Layer) : l
			);
		})
	);

/** rotation = 0。すでに 0 なら null。 */
export const resetRotation = (state: SlideState, layerIndex: number): SlideState | null =>
	withLayerSync(
		state,
		layerIndex,
		transformSelectedSlideLayers(state, (layers) => {
			if (layerIndex < 0 || layerIndex >= layers.length) return null;
			const cur = layers[layerIndex];
			if (cur.rotation === 0) return null;
			return layers.map((l, i) => (i === layerIndex ? ({ ...cur, rotation: 0 } as Layer) : l));
		})
	);

/** mirrorH を toggle。 */
export const toggleMirrorH = (state: SlideState, layerIndex: number): SlideState | null =>
	withLayerSync(
		state,
		layerIndex,
		transformSelectedSlideLayers(state, (layers) => {
			if (layerIndex < 0 || layerIndex >= layers.length) return null;
			const cur = layers[layerIndex];
			return layers.map((l, i) =>
				i === layerIndex ? ({ ...cur, mirrorH: !cur.mirrorH } as Layer) : l
			);
		})
	);

/** mirrorV を toggle。 */
export const toggleMirrorV = (state: SlideState, layerIndex: number): SlideState | null =>
	withLayerSync(
		state,
		layerIndex,
		transformSelectedSlideLayers(state, (layers) => {
			if (layerIndex < 0 || layerIndex >= layers.length) return null;
			const cur = layers[layerIndex];
			return layers.map((l, i) =>
				i === layerIndex ? ({ ...cur, mirrorV: !cur.mirrorV } as Layer) : l
			);
		})
	);

/** opacity = 1。すでに 1 なら null。 */
export const resetOpacity = (state: SlideState, layerIndex: number): SlideState | null =>
	withLayerSync(
		state,
		layerIndex,
		transformSelectedSlideLayers(state, (layers) => {
			if (layerIndex < 0 || layerIndex >= layers.length) return null;
			const cur = layers[layerIndex];
			if (cur.opacity === 1) return null;
			return layers.map((l, i) => (i === layerIndex ? ({ ...cur, opacity: 1 } as Layer) : l));
		})
	);

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
	contentH: number
): SlideState | null =>
	withLayerSync(
		state,
		layerIndex,
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
					: l
			);
		})
	);

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
	rotationDeg: number
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
	contentH: number
): SlideState | null =>
	withLayerSync(
		state,
		layerIndex,
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
				i === layerIndex ? ({ ...cur, transX: newTransX, transY: newTransY } as Layer) : l
			);
		})
	);
