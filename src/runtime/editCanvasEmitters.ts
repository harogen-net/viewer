import { LayerType } from "../model/Layer";
import type { ImageLayer } from "../model/layer/ImageLayer";
import type { TextLayer } from "../model/layer/TextLayer";
import { layerStore, type EditLayerValues } from "../state/layerStore";
import type { EditLayerMutationUseCase } from "../useCase/EditLayerMutationUseCase";
import type { EditableSlideViewHandle } from "../view/slide";

/**
 * R4.7.3: `EditCanvasRuntime` から `layerStore` への同期処理を抽出した emitter 群。
 *
 * いずれの関数も「`slideView` の現在状態を読み、対応する `layerStore` action を呼ぶ」
 * 純粋な投影処理。Runtime クラスから副作用の塊を切り離し、後続で hook へ移送する際の
 * 差し替え地点をひとつにまとめる目的のモジュール。
 */

/** キャンバス側の表示スケール／矩形編集フラグを `layerStore.editCanvasState` に同期。 */
export function emitEditCanvasState(slideView: EditableSlideViewHandle): void {
	layerStore.getState().setEditCanvasState({
		scale: slideView.scale,
		rectEdit: slideView.rectEdit,
	});
}

/** 現在スライドのレイヤー一覧を `layerStore.editLayers` に同期。 */
export function emitEditLayerListState(slideView: EditableSlideViewHandle): void {
	const selected = slideView.selectedLayer;
	const layers = slideView.slide.layers.map((layer, index) => ({
		index,
		id: layer.id,
		name: layer.name ?? "",
		type: String(layer.type),
		locked: Boolean(layer.locked),
		visible: Boolean(layer.visible),
		shared: Boolean(layer.shared),
		selected: selected === layer,
	}));
	layerStore.getState().setEditLayers(layers);
}

const EMPTY_EDIT_VALUES: EditLayerValues = {
	name: null,
	visible: null,
	locked: null,
	shared: null,
	x: null,
	y: null,
	scale: null,
	rotation: null,
	opacity: null,
	layerType: null,
	mirrorH: null,
	mirrorV: null,
	isText: null,
	textContent: null,
	clipTop: null,
	clipRight: null,
	clipBottom: null,
	clipLeft: null,
};

/**
 * 選択中レイヤーの値を `layerStore.editSelection` / `editValues` へ同期。
 * `layerMutations` に問い合わせる canPaste 系フラグを含むため、第二引数として要求する。
 */
export function emitEditSelectedLayerState(
	slideView: EditableSlideViewHandle,
	layerMutations: EditLayerMutationUseCase
): void {
	const layer = slideView.editingLayer;
	const canPasteLayer = layerMutations.canPasteLayer();
	const canPasteLayerTransform = layerMutations.canPasteLayerTransform();
	if (!layer) {
		layerStore.getState().setEditSelection({
			hasSelection: false,
			canPasteLayer,
			canPasteLayerTransform,
		});
		layerStore.getState().setEditValues(EMPTY_EDIT_VALUES);
		return;
	}
	const imageLayer = layer.type == LayerType.IMAGE ? (layer as ImageLayer) : null;
	layerStore.getState().setEditSelection({
		hasSelection: true,
		canPasteLayer,
		canPasteLayerTransform,
	});
	const values: EditLayerValues = {
		name: layer.name,
		visible: layer.visible,
		locked: layer.locked,
		shared: layer.shared,
		layerType: layer.type,
		x: layer.x,
		y: layer.y,
		scale: layer.scale,
		rotation: layer.rotation,
		opacity: layer.opacity,
		mirrorH: layer.mirrorH,
		mirrorV: layer.mirrorV,
		isText: imageLayer ? imageLayer.isText : null,
		textContent: layer.type === LayerType.TEXT ? (layer as TextLayer).text : null,
		clipTop: imageLayer ? imageLayer.clipT : null,
		clipRight: imageLayer ? imageLayer.clipR : null,
		clipBottom: imageLayer ? imageLayer.clipB : null,
		clipLeft: imageLayer ? imageLayer.clipL : null,
	};
	layerStore.getState().setEditValues(values);
}
