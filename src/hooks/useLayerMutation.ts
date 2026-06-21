import { useCallback } from "react";
import type { ImageLayer, LayerBase, TextLayer } from "../types/Layer";
import type { NewLayer } from "../utils/layerOps";
import * as layerOps from "../utils/layerOps";
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
		patch: Partial<Omit<ImageLayer, "type" | "id" | "uuid">>,
	) => void;
	updateTextLayer: (
		layerIndex: number,
		patch: Partial<Omit<TextLayer, "type" | "id" | "uuid">>,
	) => void;
	addLayer: (layer: NewLayer) => void;
	removeLayer: (layerIndex: number) => void;
	duplicateLayer: (layerIndex: number) => void;
	reorderLayer: (fromIndex: number, toIndex: number) => void;
	bringToFront: (layerIndex: number) => void;
	sendToBack: (layerIndex: number) => void;
	bringForward: (layerIndex: number) => void;
	sendBackward: (layerIndex: number) => void;
	updateSharedLayer: (sharedUuid: string, patch: Partial<LayerBase>) => void;
}

export const useLayerMutation = (): UseLayerMutation => {
	const { applySlideChange } = useDocumentMutation();

	const updateLayer = useCallback(
		(layerIndex: number, patch: Partial<LayerBase>) =>
			applySlideChange("update layer", (s) => layerOps.updateLayer(s, layerIndex, patch)),
		[applySlideChange],
	);
	const updateImageLayer = useCallback(
		(layerIndex: number, patch: Partial<Omit<ImageLayer, "type" | "id" | "uuid">>) =>
			applySlideChange("update image layer", (s) =>
				layerOps.updateImageLayer(s, layerIndex, patch),
			),
		[applySlideChange],
	);
	const updateTextLayer = useCallback(
		(layerIndex: number, patch: Partial<Omit<TextLayer, "type" | "id" | "uuid">>) =>
			applySlideChange("update text layer", (s) =>
				layerOps.updateTextLayer(s, layerIndex, patch),
			),
		[applySlideChange],
	);
	const addLayer = useCallback(
		(layer: NewLayer) =>
			applySlideChange("add layer", (s) => layerOps.addLayer(s, layer)),
		[applySlideChange],
	);
	const removeLayer = useCallback(
		(layerIndex: number) =>
			applySlideChange("remove layer", (s) => layerOps.removeLayer(s, layerIndex)),
		[applySlideChange],
	);
	const duplicateLayer = useCallback(
		(layerIndex: number) =>
			applySlideChange("duplicate layer", (s) => layerOps.duplicateLayer(s, layerIndex)),
		[applySlideChange],
	);
	const reorderLayer = useCallback(
		(fromIndex: number, toIndex: number) =>
			applySlideChange("reorder layer", (s) => layerOps.reorderLayer(s, fromIndex, toIndex)),
		[applySlideChange],
	);
	const bringToFront = useCallback(
		(layerIndex: number) =>
			applySlideChange("bring layer to front", (s) => layerOps.bringToFront(s, layerIndex)),
		[applySlideChange],
	);
	const sendToBack = useCallback(
		(layerIndex: number) =>
			applySlideChange("send layer to back", (s) => layerOps.sendToBack(s, layerIndex)),
		[applySlideChange],
	);
	const bringForward = useCallback(
		(layerIndex: number) =>
			applySlideChange("bring layer forward", (s) => layerOps.bringForward(s, layerIndex)),
		[applySlideChange],
	);
	const sendBackward = useCallback(
		(layerIndex: number) =>
			applySlideChange("send layer backward", (s) => layerOps.sendBackward(s, layerIndex)),
		[applySlideChange],
	);
	const updateSharedLayer = useCallback(
		(sharedUuid: string, patch: Partial<LayerBase>) =>
			applySlideChange("update shared layer", (s) =>
				layerOps.updateSharedLayer(s, sharedUuid, patch),
			),
		[applySlideChange],
	);

	return {
		updateLayer,
		updateImageLayer,
		updateTextLayer,
		addLayer,
		removeLayer,
		duplicateLayer,
		reorderLayer,
		bringToFront,
		sendToBack,
		bringForward,
		sendBackward,
		updateSharedLayer,
	};
};
