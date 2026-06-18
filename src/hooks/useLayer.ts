import { useMemo } from "react";
import type { LayerSnapshot } from "../model/snapshot";
import {
	useLayerStore,
	type EditCanvasState,
	type EditLayerListItem,
	type EditLayerSelectionState,
	type EditLayerValues,
	type LayerCommandsUseCase,
} from "../state/layerStore";

/**
 * R3.8: `useLayer` hook — public API for layer-domain state + actions.
 *
 * 設計方針：
 * - 状態は `layerStore` selector で購読し、React の再レンダリングを駆動。
 * - 操作は `layerStore.commands`（R3.7 で注入された `LayerCommandsUseCase`）の
 *   メソッドへ委譲する。後続フェーズ（useCase 吸収）で実装は store action 内部に
 *   移送するが、本 hook の I/F は変えない。
 * - 内部 publish 系メソッド（`publishEditSelectionState` 等）は外部公開しない。
 *
 * 利用例：
 *   const { state, actions } = useLayer();
 *   state.values.x; state.selection.hasSelection;
 *   actions.rotateLeft(); actions.setPosition(10, 20);
 */

export type LayerHookState = {
	selection: EditLayerSelectionState;
	values: EditLayerValues;
	canvas: EditCanvasState;
	layers: readonly EditLayerListItem[];
	snapshots: readonly LayerSnapshot[];
};

export type LayerHookActions = Omit<
	LayerCommandsUseCase,
	"publishEditSelectionState" | "publishCurrentEditState"
>;

export type LayerHook = {
	state: LayerHookState;
	actions: LayerHookActions;
};

const noopActions: LayerHookActions = {
	rotateLeft: () => {},
	rotateRight: () => {},
	toggleMirrorH: () => {},
	toggleMirrorV: () => {},
	toggleIsText: () => {},
	spread: () => {},
	fit: () => {},
	arrangeTop: () => {},
	arrangeRight: () => {},
	arrangeBottom: () => {},
	arrangeLeft: () => {},
	moveUp: () => {},
	moveDown: () => {},
	moveToTop: () => {},
	moveToBottom: () => {},
	moveToIndex: () => {},
	copyLayer: () => {},
	cutLayer: () => {},
	pasteLayer: () => {},
	addTextLayer: () => {},
	requestTextLayerInput: () => {},
	copyTransform: () => {},
	pasteTransform: () => {},
	remove: () => {},
	nudgeLeft: () => {},
	nudgeRight: () => {},
	nudgeUp: () => {},
	nudgeDown: () => {},
	scaleUp: () => {},
	scaleDown: () => {},
	adjustRotationLeft: () => {},
	adjustRotationRight: () => {},
	resetRotation: () => {},
	decreaseOpacity: () => {},
	increaseOpacity: () => {},
	resetOpacity: () => {},
	setPosition: () => {},
	setScale: () => {},
	setRotation: () => {},
	setOpacity: () => {},
	setImageClip: () => {},
	resetImageClip: () => {},
	selectByIndex: () => {},
	toggleVisible: () => {},
	toggleLocked: () => {},
	toggleShared: () => {},
	setName: () => {},
	setText: () => {},
	zoomInCanvas: () => {},
	zoomOutCanvas: () => {},
	resetCanvasZoom: () => {},
	setCanvasScale: () => {},
	toggleRectEdit: () => {},
	setRectEdit: () => {},
	replaceImage: () => Promise.resolve(),
	downloadImage: () => {},
	deleteImageById: () => {},
	undo: () => {},
	redo: () => {},
};

/** React hook to access layer-domain state and actions. */
export function useLayer(): LayerHook {
	const selection = useLayerStore((s) => s.editSelection);
	const values = useLayerStore((s) => s.editValues);
	const canvas = useLayerStore((s) => s.editCanvasState);
	const layers = useLayerStore((s) => s.editLayers);
	const snapshots = useLayerStore((s) => s.layerSnapshots);
	const commands = useLayerStore((s) => s.commands);

	const actions = useMemo<LayerHookActions>(() => {
		if (!commands) return noopActions;
		return {
			rotateLeft: () => commands.rotateLeft(),
			rotateRight: () => commands.rotateRight(),
			toggleMirrorH: () => commands.toggleMirrorH(),
			toggleMirrorV: () => commands.toggleMirrorV(),
			toggleIsText: () => commands.toggleIsText(),
			spread: (confirmed) => commands.spread(confirmed),
			fit: () => commands.fit(),
			arrangeTop: () => commands.arrangeTop(),
			arrangeRight: () => commands.arrangeRight(),
			arrangeBottom: () => commands.arrangeBottom(),
			arrangeLeft: () => commands.arrangeLeft(),
			moveUp: () => commands.moveUp(),
			moveDown: () => commands.moveDown(),
			moveToTop: () => commands.moveToTop(),
			moveToBottom: () => commands.moveToBottom(),
			moveToIndex: (toIndex) => commands.moveToIndex(toIndex),
			copyLayer: () => commands.copyLayer(),
			cutLayer: () => commands.cutLayer(),
			pasteLayer: () => commands.pasteLayer(),
			addTextLayer: (text) => commands.addTextLayer(text),
			requestTextLayerInput: () => commands.requestTextLayerInput(),
			copyTransform: () => commands.copyTransform(),
			pasteTransform: () => commands.pasteTransform(),
			remove: (confirmedSharedRemoval) => commands.remove(confirmedSharedRemoval),
			nudgeLeft: () => commands.nudgeLeft(),
			nudgeRight: () => commands.nudgeRight(),
			nudgeUp: () => commands.nudgeUp(),
			nudgeDown: () => commands.nudgeDown(),
			scaleUp: () => commands.scaleUp(),
			scaleDown: () => commands.scaleDown(),
			adjustRotationLeft: () => commands.adjustRotationLeft(),
			adjustRotationRight: () => commands.adjustRotationRight(),
			resetRotation: () => commands.resetRotation(),
			decreaseOpacity: () => commands.decreaseOpacity(),
			increaseOpacity: () => commands.increaseOpacity(),
			resetOpacity: () => commands.resetOpacity(),
			setPosition: (x, y) => commands.setPosition(x, y),
			setScale: (scale) => commands.setScale(scale),
			setRotation: (rotation) => commands.setRotation(rotation),
			setOpacity: (opacity) => commands.setOpacity(opacity),
			setImageClip: (top, right, bottom, left) =>
				commands.setImageClip(top, right, bottom, left),
			resetImageClip: () => commands.resetImageClip(),
			selectByIndex: (index) => commands.selectByIndex(index),
			toggleVisible: () => commands.toggleVisible(),
			toggleLocked: () => commands.toggleLocked(),
			toggleShared: () => commands.toggleShared(),
			setName: (name) => commands.setName(name),
			setText: (text) => commands.setText(text),
			zoomInCanvas: () => commands.zoomInCanvas(),
			zoomOutCanvas: () => commands.zoomOutCanvas(),
			resetCanvasZoom: () => commands.resetCanvasZoom(),
			setCanvasScale: (scale) => commands.setCanvasScale(scale),
			toggleRectEdit: () => commands.toggleRectEdit(),
			setRectEdit: (enabled) => commands.setRectEdit(enabled),
			replaceImage: (file, applyAllReferences) =>
				commands.replaceImage(file, applyAllReferences),
			downloadImage: () => commands.downloadImage(),
			deleteImageById: (imageId, confirmed) =>
				commands.deleteImageById(imageId, confirmed),
			undo: () => commands.undo(),
			redo: () => commands.redo(),
		};
	}, [commands]);

	return { state: { selection, values, canvas, layers, snapshots }, actions };
}

/**
 * React 外文脈（keydown ハンドラ・bridge 互換層など）から layer action を呼ぶ用の helper。
 * `layerStore.getState().commands` の short-hand。バインド前は `null` を返す。
 */
export function getLayerActions(): LayerCommandsUseCase | null {
	return useLayerStore.getState().commands;
}
