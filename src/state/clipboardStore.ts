import { create } from "zustand";
import type { Layer, LayerTransform } from "../types/Layer";

// レイヤー clipboard 状態 (v4 Group D D-8、§0-10 新側内製)。
// レガシー src/view/slide/EditableSlideView.ts の copyedLayer / copyedTrans
// (インスタンスフィールド) を store として再実装したもの。
//
// 2 系統の clipboard を保持する (function-list §4):
//   - layer    : カット/コピー/ペースト 用。コピー元 layer の clone データを保持。
//                paste 時に addLayer (id/uuid 再採番) で現 slide に複製する。
//   - transform: 変形情報コピー/貼付 用。LayerTransform 7 値のみ保持。
//                pasteTransform 時に選択 layer へ updateLayer で適用する。
//
// 実際の copy/cut/paste 操作 (clone・history・選択復元) は useLayerClipboard が担当。
// この store は「何がコピーされているか」の保持のみに責務を限定する。

interface ClipboardState {
	/** コピー済み layer (clone 済みデータ。未コピーは null)。 */
	layer: Layer | null;
	/** コピー済み変形 (未コピーは null)。 */
	transform: LayerTransform | null;
	setLayer: (layer: Layer) => void;
	setTransform: (transform: LayerTransform) => void;
	clear: () => void;
}

export const useClipboardStore = create<ClipboardState>()((set) => ({
	layer: null,
	transform: null,
	setLayer: (layer) => set({ layer }),
	setTransform: (transform) => set({ transform }),
	clear: () => set({ layer: null, transform: null }),
}));
