import { create } from "zustand";

// 編集 stage の view-only 状態 (v4 Group D D-7、§0-10 新側内製)。
// レガシー src/view/slide/EditableSlideView.ts / DOMSlideView.ts の
// `_scale` (ユーザズーム係数) を hook/store として再実装したもの。
//
// レガシーの実効描画 scale = `_scale * scale_base` で、`scale_base` は
// fit-to-area (= min(area/slide)) に相当する。新側では SlideEditView が
// fit-to-area scale を毎フレーム算出するため、この store はユーザ操作で
// 上乗せする倍率 `zoom` のみを保持する (実効 scale = fitScale * zoom)。
//
// ズーム操作の parity (function-list §4 ズームイン/アウト/全体表示):
//   - zoomIn  : ×1.1                 (legacy EditViewController `.zoomIn`)
//   - zoomOut : ÷1.1                 (legacy `.zoomOut`)
//   - showAll : zoom=ZOOM_DEFAULT    (legacy `.showAll` → SCALE_DEFAULT)
//   - wheel   : setZoom(zoom / (1 + 0.1*sign(deltaY)))  (legacy obj.on("wheel"))
//
// 仕様差 (§0-9 spec-based、pixel-perfect 不問):
//   レガシー SCALE_DEFAULT は 0.9 (= fit-to-area より一回り小さく余白を残す) だが、
//   新側 D-1 の fit-to-area は「領域いっぱいに収める」を「全体表示」の基準としたため
//   ZOOM_DEFAULT = 1.0 とする。余白の有無は仕様書に規定されない描画細部。

export const ZOOM_MIN = 0.2; // legacy DOMSlideView.scale_min
export const ZOOM_MAX = 5; // legacy DOMSlideView.scale_max
export const ZOOM_DEFAULT = 1.0; // 全体表示 = fit-to-area いっぱい (§0-9 注記参照)
export const ZOOM_STEP = 1.1; // legacy zoomIn ×1.1 / zoomOut ÷1.1

const clampZoom = (value: number): number => {
	if (!Number.isFinite(value)) return ZOOM_DEFAULT;
	return Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, value));
};

interface EditViewState {
	/** ユーザズーム倍率。実効描画 scale = fit-to-area scale × zoom。 */
	zoom: number;
	/** 任意倍率に設定 (clamp 込み)。wheel ハンドラから使用。 */
	setZoom: (zoom: number) => void;
	/** ×1.1 ズームイン。 */
	zoomIn: () => void;
	/** ÷1.1 ズームアウト。 */
	zoomOut: () => void;
	/** 全体表示 (zoom を既定値に戻す)。 */
	showAll: () => void;
}

export const useEditViewStore = create<EditViewState>()((set) => ({
	zoom: ZOOM_DEFAULT,
	setZoom: (zoom) => set({ zoom: clampZoom(zoom) }),
	zoomIn: () => set((s) => ({ zoom: clampZoom(s.zoom * ZOOM_STEP) })),
	zoomOut: () => set((s) => ({ zoom: clampZoom(s.zoom / ZOOM_STEP) })),
	showAll: () => set({ zoom: ZOOM_DEFAULT }),
}));
