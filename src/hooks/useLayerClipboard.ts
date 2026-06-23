import { useCallback } from "react";
import { useClipboardStore } from "../state/clipboardStore";
import { useLayerStore } from "../state/layerStore";
import { useSlideStore } from "../state/slideStore";
import type { Layer, LayerTransform } from "../types/Layer";
import { useLayerMutation } from "./useLayerMutation";

// レイヤー clipboard 操作の consumer facade (v4 Group D D-8、§0-10 新側内製)。
// レガシー EditableSlideView の cut() / copy() / paste() / copyTrans() / pasteTrans()
// (L218-283) を hook として再実装。clipboardStore + useLayerMutation を束ねる。
//
// 設計:
//   - copy/cut/copyTransform は「現在の選択 layer」を stores から解決して clipboard に積む
//     (EditOpsPanel / useShellKeyboard どちらの呼び元も index を渡さなくてよい)
//   - paste は現 slide に addLayer (id/uuid 再採番) し、追加した layer を選択する
//   - すべて useLayerMutation 経由なので history / modified / cascade は自動
//
// clone: clipRect 等の参照型を共有しないよう shallow clone + 配列複製する。
// 参照を共有すると clipboard 上のデータが後続編集で書き換わってしまうため。

const cloneLayer = (layer: Layer): Layer => {
	if (layer.type === "image") return { ...layer, clipRect: [...layer.clipRect] };
	return { ...layer };
};

const extractTransform = (layer: Layer): LayerTransform => ({
	transX: layer.transX,
	transY: layer.transY,
	scaleX: layer.scaleX,
	scaleY: layer.scaleY,
	rotation: layer.rotation,
	mirrorH: layer.mirrorH,
	mirrorV: layer.mirrorV,
});

/** 現在の選択 slide / 選択 layer から index + layer を解決 (見つからなければ null)。 */
const resolveSelected = (): { index: number; layer: Layer } | null => {
	const { selectedIndex, slides } = useSlideStore.getState();
	const selected = useLayerStore.getState().selectedLayer;
	if (selectedIndex < 0 || selectedIndex >= slides.length || !selected) return null;
	const layers = slides[selectedIndex].layers;
	const index = layers.findIndex((l) => l.uuid === selected.uuid);
	if (index < 0) return null;
	return { index, layer: layers[index] };
};

export interface UseLayerClipboard {
	copy: () => void;
	cut: () => void;
	paste: () => void;
	copyTransform: () => void;
	pasteTransform: () => void;
	/** clipboard に layer があり paste 可能か。 */
	canPaste: boolean;
	/** clipboard に transform があり、かつ layer 選択中で pasteTransform 可能か。 */
	canPasteTransform: boolean;
}

export const useLayerClipboard = (): UseLayerClipboard => {
	const layer = useLayerMutation();
	const clipboardLayer = useClipboardStore((s) => s.layer);
	const clipboardTransform = useClipboardStore((s) => s.transform);

	const copy = useCallback(() => {
		const r = resolveSelected();
		if (!r) return;
		useClipboardStore.getState().setLayer(cloneLayer(r.layer));
	}, []);

	const cut = useCallback(() => {
		const r = resolveSelected();
		if (!r) return;
		useClipboardStore.getState().setLayer(cloneLayer(r.layer));
		layer.removeLayer(r.index);
	}, [layer.removeLayer]);

	const paste = useCallback(() => {
		const copied = useClipboardStore.getState().layer;
		if (!copied) return;
		// addLayer は id/uuid を再採番するため stale な識別子は無視される。clone で参照分離。
		layer.addLayer(cloneLayer(copied));
		// レガシー paste 同様、追加した (末尾 = 最前面) layer を選択する。
		const { selectedIndex, slides } = useSlideStore.getState();
		const slide = slides[selectedIndex];
		if (slide && slide.layers.length > 0) {
			useLayerStore.getState().setSelectedLayer(slide.layers[slide.layers.length - 1]);
		}
	}, [layer.addLayer]);

	const copyTransform = useCallback(() => {
		const r = resolveSelected();
		if (!r) return;
		useClipboardStore.getState().setTransform(extractTransform(r.layer));
	}, []);

	const pasteTransform = useCallback(() => {
		const t = useClipboardStore.getState().transform;
		const r = resolveSelected();
		if (!t || !r) return;
		layer.updateLayer(r.index, t);
	}, [layer.updateLayer]);

	return {
		copy,
		cut,
		paste,
		copyTransform,
		pasteTransform,
		canPaste: clipboardLayer !== null,
		canPasteTransform: clipboardTransform !== null,
	};
};
