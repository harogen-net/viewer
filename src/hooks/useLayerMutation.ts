import { useEditViewStore } from "@/state/editViewStore";
import { useImageLibraryStore } from "@/state/imageLibraryStore";
import type { ImageLayer, LayerBase, TextLayer } from "@/types/Layer";
import type { AlignEdge, NewLayer } from "@/utils/layerOps";
import * as layerOps from "@/utils/layerOps";
import { useCallback, useEffect } from "react";
import { useDocumentMutation } from "./useDocumentMutation";

// Layer 階層の consumer facade (v4 Group D D-2)。
// useDocumentMutation.applySlideChange に layerOps 純関数を注入する薄 wrapper。
//
// useSlideMutation と同じ設計:
//   - 各 mutation = 1 行 (applySlideChange("label", (s) => layerOps.X(s, args)))
//   - history 自動記録 (C-1R primitive 経由)
//   - cascade で layerStore も自動同期 (selectedIndex 経由)
//
// SlideEditView / LayerListPanel / EditOpsPanel (D-3, D-4) はこの hook 経由で
// layer mutation を行う (store を直接 mutate しない)。

export interface UseLayerMutation {
	updateLayer: (layerIndex: number, patch: Partial<LayerBase>) => void;
	updateImageLayer: (
		layerIndex: number,
		patch: Partial<Omit<ImageLayer, "type" | "id" | "uuid">>
	) => void;
	updateTextLayer: (
		layerIndex: number,
		patch: Partial<Omit<TextLayer, "type" | "id" | "uuid">>
	) => void;
	addLayer: (layer: NewLayer) => void;
	/** テキストレイヤーを slide 中央付近に追加 (§6、legacy `.text` 相当)。 */
	addTextLayer: (text: string, slideW: number, slideH: number) => void;
	removeLayer: (layerIndex: number) => void;
	/** 選択 layer + 連続隣接 shared 兄弟をまとめて削除 (§7、shared 連鎖削除)。 */
	removeLayerWithSharedSiblings: (layerIndex: number) => void;
	duplicateLayer: (layerIndex: number) => void;
	/** 選択 layer を前後の連続スライドへ展開し shared 化 (§7、legacy spreadLayers)。 */
	spreadLayer: (layerIndex: number) => void;
	reorderLayer: (fromIndex: number, toIndex: number) => void;
	bringToFront: (layerIndex: number) => void;
	sendToBack: (layerIndex: number) => void;
	bringForward: (layerIndex: number) => void;
	sendBackward: (layerIndex: number) => void;
	rotateBy: (layerIndex: number, deltaDeg: number) => void;
	resetRotation: (layerIndex: number) => void;
	toggleMirrorH: (layerIndex: number) => void;
	toggleMirrorV: (layerIndex: number) => void;
	resetOpacity: (layerIndex: number) => void;
	fitToSlide: (
		layerIndex: number,
		slideW: number,
		slideH: number,
		contentW: number,
		contentH: number
	) => void;
	alignTo: (
		layerIndex: number,
		edge: AlignEdge,
		slideW: number,
		slideH: number,
		contentW: number,
		contentH: number
	) => void;
	/** 指定 imageId を参照する ImageLayer を全 slide から削除 (D-6a)。 */
	removeLayersByImageId: (imageId: string) => void;
	/** 選択 slide の指定 layerIndex (ImageLayer) の imageId のみ差替 (D-6b、単体差替)。 */
	replaceImageId: (layerIndex: number, newImageId: string) => void;
	/** 全 slide の oldImageId を参照する ImageLayer の imageId を newImageId に置換 (D-6b、まとめて差替)。 */
	replaceImageIdAll: (oldImageId: string, newImageId: string) => void;
}

export const useLayerMutation = (): UseLayerMutation => {
	const { applySlideChange } = useDocumentMutation();

	const updateLayer = useCallback(
		(layerIndex: number, patch: Partial<LayerBase>) =>
			applySlideChange("update layer", (s) => layerOps.updateLayer(s, layerIndex, patch)),
		[applySlideChange]
	);
	const updateImageLayer = useCallback(
		(layerIndex: number, patch: Partial<Omit<ImageLayer, "type" | "id" | "uuid">>) =>
			applySlideChange("update image layer", (s) =>
				layerOps.updateImageLayer(s, layerIndex, patch)
			),
		[applySlideChange]
	);
	const updateTextLayer = useCallback(
		(layerIndex: number, patch: Partial<Omit<TextLayer, "type" | "id" | "uuid">>) =>
			applySlideChange("update text layer", (s) => layerOps.updateTextLayer(s, layerIndex, patch)),
		[applySlideChange]
	);
	const addLayer = useCallback(
		(layer: NewLayer) => applySlideChange("add layer", (s) => layerOps.addLayer(s, layer)),
		[applySlideChange]
	);
	const addTextLayer = useCallback(
		(text: string, slideW: number, slideH: number) =>
			applySlideChange("add text layer", (s) => layerOps.addTextLayer(s, text, slideW, slideH)),
		[applySlideChange]
	);
	const removeLayer = useCallback(
		(layerIndex: number) =>
			applySlideChange("remove layer", (s) => layerOps.removeLayer(s, layerIndex)),
		[applySlideChange]
	);
	const removeLayerWithSharedSiblings = useCallback(
		(layerIndex: number) =>
			applySlideChange("remove shared layers", (s) =>
				layerOps.removeLayerWithSharedSiblings(s, layerIndex)
			),
		[applySlideChange]
	);
	const duplicateLayer = useCallback(
		(layerIndex: number) =>
			applySlideChange("duplicate layer", (s) => layerOps.duplicateLayer(s, layerIndex)),
		[applySlideChange]
	);
	const spreadLayer = useCallback(
		(layerIndex: number) =>
			applySlideChange("spread layer", (s) => layerOps.spreadLayer(s, layerIndex)),
		[applySlideChange]
	);
	const reorderLayer = useCallback(
		(fromIndex: number, toIndex: number) =>
			applySlideChange("reorder layer", (s) => layerOps.reorderLayer(s, fromIndex, toIndex)),
		[applySlideChange]
	);
	const bringToFront = useCallback(
		(layerIndex: number) =>
			applySlideChange("bring layer to front", (s) => layerOps.bringToFront(s, layerIndex)),
		[applySlideChange]
	);
	const sendToBack = useCallback(
		(layerIndex: number) =>
			applySlideChange("send layer to back", (s) => layerOps.sendToBack(s, layerIndex)),
		[applySlideChange]
	);
	const bringForward = useCallback(
		(layerIndex: number) =>
			applySlideChange("bring layer forward", (s) => layerOps.bringForward(s, layerIndex)),
		[applySlideChange]
	);
	const sendBackward = useCallback(
		(layerIndex: number) =>
			applySlideChange("send layer backward", (s) => layerOps.sendBackward(s, layerIndex)),
		[applySlideChange]
	);
	const rotateBy = useCallback(
		(layerIndex: number, deltaDeg: number) =>
			applySlideChange("rotate layer", (s) => layerOps.rotateBy(s, layerIndex, deltaDeg)),
		[applySlideChange]
	);
	const resetRotation = useCallback(
		(layerIndex: number) =>
			applySlideChange("reset rotation", (s) => layerOps.resetRotation(s, layerIndex)),
		[applySlideChange]
	);
	const toggleMirrorH = useCallback(
		(layerIndex: number) =>
			applySlideChange("toggle mirror h", (s) => layerOps.toggleMirrorH(s, layerIndex)),
		[applySlideChange]
	);
	const toggleMirrorV = useCallback(
		(layerIndex: number) =>
			applySlideChange("toggle mirror v", (s) => layerOps.toggleMirrorV(s, layerIndex)),
		[applySlideChange]
	);
	const resetOpacity = useCallback(
		(layerIndex: number) =>
			applySlideChange("reset opacity", (s) => layerOps.resetOpacity(s, layerIndex)),
		[applySlideChange]
	);
	const fitToSlide = useCallback(
		(layerIndex: number, slideW: number, slideH: number, contentW: number, contentH: number) =>
			applySlideChange("fit to slide", (s) =>
				layerOps.fitToSlide(s, layerIndex, slideW, slideH, contentW, contentH)
			),
		[applySlideChange]
	);
	const alignTo = useCallback(
		(
			layerIndex: number,
			edge: AlignEdge,
			slideW: number,
			slideH: number,
			contentW: number,
			contentH: number
		) =>
			applySlideChange(`align ${edge}`, (s) =>
				layerOps.alignTo(s, layerIndex, edge, slideW, slideH, contentW, contentH)
			),
		[applySlideChange]
	);
	const removeLayersByImageId = useCallback(
		(imageId: string) =>
			applySlideChange("remove layers by image", (s) => layerOps.removeLayersByImageId(s, imageId)),
		[applySlideChange]
	);
	const replaceImageId = useCallback(
		(layerIndex: number, newImageId: string) =>
			applySlideChange("replace image", (s) => layerOps.replaceImageId(s, layerIndex, newImageId)),
		[applySlideChange]
	);
	const replaceImageIdAll = useCallback(
		(oldImageId: string, newImageId: string) =>
			applySlideChange("replace image (all)", (s) =>
				layerOps.replaceImageIdAll(s, oldImageId, newImageId)
			),
		[applySlideChange]
	);

	return {
		updateLayer,
		updateImageLayer,
		updateTextLayer,
		addLayer,
		addTextLayer,
		removeLayer,
		removeLayerWithSharedSiblings,
		duplicateLayer,
		spreadLayer,
		reorderLayer,
		bringToFront,
		sendToBack,
		bringForward,
		sendBackward,
		rotateBy,
		resetRotation,
		toggleMirrorH,
		toggleMirrorV,
		resetOpacity,
		fitToSlide,
		alignTo,
		removeLayersByImageId,
		replaceImageId,
		replaceImageIdAll,
	};
};

/**
 * rectEdit (§7 D-18) の実行時コンテキストを layerOps へ流し込む hook。
 * editViewStore.rectEdit (トグル) と imageLibraryStore の自然寸法 (D-14) を集約し、
 * layerOps.setRectSyncConfig に渡す。これにより layer プロパティ編集系 op が
 * 「rectEdit 有効時、同矩形 image layer へ transform を連動」させられる。
 * 新モードのルート (AppShell) で 1 回マウントする。
 */
export const useRectSyncConfig = (): void => {
	const rectEdit = useEditViewStore((s) => s.rectEdit);
	const imageById = useImageLibraryStore((s) => s.imageById);
	useEffect(() => {
		const dims: Record<string, { w: number; h: number }> = {};
		for (const [id, e] of Object.entries(imageById)) {
			if (e.width !== undefined && e.height !== undefined) dims[id] = { w: e.width, h: e.height };
		}
		layerOps.setRectSyncConfig({ enabled: rectEdit, dims });
	}, [rectEdit, imageById]);
};
