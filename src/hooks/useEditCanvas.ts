import { useMemo } from "react";
import {
    useViewerEditCanvasState,
    useViewerEditLayers,
    useViewerEditSelection,
    useViewerEditValues,
} from "../bridge/useViewerBridge";
import type {
    EditCanvasState,
    EditLayerListItem,
    EditLayerSelectionState,
    EditLayerValues,
} from "../state/layerStore";
import { useLayer } from "./useLayer";

/**
 * R3.12: `useEditCanvas` hook — 編集キャンバスの状態と操作を集約した束ね hook。
 *
 * `EditCanvasRuntime` は jQuery + DOM 直操作の命令的クラスだが、外部 API は
 * `layerStore` action 経由に統一されている。本 hook はそれら state/action を
 * React コンポーネントへの公開窓口としてまとめ、Runtime 実体に触らせない。
 */

export type EditCanvasHookState = {
	canvasState: EditCanvasState;
	selection: EditLayerSelectionState;
	layers: readonly EditLayerListItem[];
	values: EditLayerValues;
};

export type EditCanvasHookActions = {
	zoomCanvas: (zoom: number) => void;
	setRectEdit: (enabled: boolean) => void;
};

export type EditCanvasHook = {
	state: EditCanvasHookState;
	actions: EditCanvasHookActions;
};

export function useEditCanvas(): EditCanvasHook {
	const canvasState = useViewerEditCanvasState();
	const selection = useViewerEditSelection();
	const { layers } = useViewerEditLayers();
	const values = useViewerEditValues();
	const { actions: layerActions } = useLayer();

	const actions = useMemo<EditCanvasHookActions>(
		() => ({
			zoomCanvas: (zoom) => layerActions.zoomCanvas(zoom),
			setRectEdit: (enabled) => layerActions.setRectEdit(enabled),
		}),
		[layerActions]
	);

	return { state: { canvasState, selection, layers, values }, actions };
}
