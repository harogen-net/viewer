import {
	createElement,
	createRef,
	type FunctionComponent,
	type Ref,
} from "react";
import { flushSync } from "react-dom";
import { createRoot } from "react-dom/client";

import { PropertyEvent } from "../events/PropertyEvent";
import { Layer, LayerType } from "../model/Layer";
import { createImageLayer, ImageLayer } from "../model/layer/ImageLayer";
import { createTextLayer, TextLayer } from "../model/layer/TextLayer";
import { PropFlags } from "../model/PropFlags";
import { createSlide, SLIDE_LAYER_NUM_MAX, type Slide } from "../model/Slide";
import { layerStore, type EditLayerValues } from "../state/layerStore";
import { slideStore } from "../state/slideStore";
import {
	createEditLayerMutationUseCase,
	type EditLayerMutationUseCase,
} from "../useCase/EditLayerMutationUseCase";
import { ImageManager } from "../utils/ImageManager";
import {
	EDITABLE_SLIDE_VIEW_SCALE_DEFAULT,
	EditableSlideView,
	type EditableSlideViewHandle,
} from "../view/slide";
import { ViewerMode } from "./viewerMode";

/**
 * R4 (bullet 4): 旧 `EditCanvasRuntime` クラスを撤去し、factory 関数 +
 * `EditableSlideView` の React マウントだけを担う極小コンテナへ縮約。
 *
 * `EditLayerMutationUseCase` の全 API を spread でそのまま露出することで、
 * クラス時代の thin delegating method 群を消し去っている。クラス専属だった追加
 * メソッド（`zoomInCanvas` 等）と `editCanvasEmitters` / `mountReactView` の
 * 両 helper はすべて本ファイルに統合済み。
 */

export type EditCanvasRuntime = EditLayerMutationUseCase & {
	readonly slideView: EditableSlideViewHandle;
	initialize(): void;
	setMode(mode: ViewerMode): void;
	setSlide(newSlide: Slide): void;
	emitCurrentState(): void;
	hasSelectedLayer(): boolean;
	selectEditLayerByIndex(index: number): boolean;
	getSelectedLayerRemovalRequest(): { layerName: string; shared: boolean } | null;
	downloadSelectedImage(): boolean;
	zoomInCanvas(): void;
	zoomOutCanvas(): void;
	resetCanvasZoom(): void;
	setCanvasScale(scale: number): boolean;
	toggleRectEdit(): void;
	setRectEdit(enabled: boolean): void;
};

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

const EditableSlideViewForRender = EditableSlideView as unknown as FunctionComponent<{
	ref: Ref<EditableSlideViewHandle>;
	slide: Slide;
	onImageDropped?: (imageId: string) => void;
}>;

export function createEditCanvasRuntime(obj: HTMLElement): EditCanvasRuntime {
	obj.classList.add("slideCanvas");

	let observedLayer: Layer | null = null;
	let slideView: EditableSlideViewHandle = null!;

	const emitCanvas = (): void => {
		layerStore.getState().setEditCanvasState({
			scale: slideView.scale,
			rectEdit: slideView.rectEdit,
		});
	};

	const emitLayerList = (): void => {
		const selected = slideView.selectedLayer;
		layerStore.getState().setEditLayers(
			slideView.slide.layers.map((layer, index) => ({
				index,
				id: layer.id,
				name: layer.name ?? "",
				type: String(layer.type),
				locked: Boolean(layer.locked),
				visible: Boolean(layer.visible),
				shared: Boolean(layer.shared),
				selected: selected === layer,
			}))
		);
	};

	const emitSelected = (): void => {
		const layer = slideView.editingLayer;
		const canPasteLayer = lm.canPasteLayer();
		const canPasteLayerTransform = lm.canPasteLayerTransform();
		if (!layer) {
			layerStore.getState().setEditSelection({
				hasSelection: false,
				canPasteLayer,
				canPasteLayerTransform,
			});
			layerStore.getState().setEditValues(EMPTY_EDIT_VALUES);
			return;
		}
		const il = layer.type === LayerType.IMAGE ? (layer as ImageLayer) : null;
		layerStore.getState().setEditSelection({
			hasSelection: true,
			canPasteLayer,
			canPasteLayerTransform,
		});
		layerStore.getState().setEditValues({
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
			isText: il ? il.isText : null,
			textContent: layer.type === LayerType.TEXT ? (layer as TextLayer).text : null,
			clipTop: il ? il.clipT : null,
			clipRight: il ? il.clipR : null,
			clipBottom: il ? il.clipB : null,
			clipLeft: il ? il.clipL : null,
		});
	};

	const onObservedLayerUpdate = (pe: PropertyEvent): void => {
		emitSelected();
		if (pe.propFlags & (PropFlags.NAME | PropFlags.LOCKED | PropFlags.VISIBLE | PropFlags.SHARED)) {
			emitLayerList();
		}
	};

	const watchSelectedLayer = (): void => {
		const current = slideView.editingLayer;
		if (observedLayer === current) return;
		if (observedLayer) {
			observedLayer.removeEventListener(PropertyEvent.UPDATE, onObservedLayerUpdate);
		}
		observedLayer = current;
		if (observedLayer) {
			observedLayer.addEventListener(PropertyEvent.UPDATE, onObservedLayerUpdate);
		}
	};

	const onSlideUpdate = (pe: PropertyEvent): void => {
		if (pe.propFlags & (PropFlags.S_LAYER_ADD | PropFlags.S_LAYER_REMOVE | PropFlags.S_LAYER_ORDER)) {
			emitLayerList();
		}
	};

	const setSlide = (newSlide: Slide): void => {
		const cur = slideView.slide;
		if (cur) cur.removeEventListener(PropertyEvent.UPDATE, onSlideUpdate);
		slideView.slide = newSlide;
		if (slideView.slide) {
			slideView.slide.addEventListener(PropertyEvent.UPDATE, onSlideUpdate);
		}
		watchSelectedLayer();
		emitSelected();
		emitLayerList();
		emitCanvas();
	};

	const selectEditLayer = (layer: Layer): boolean => {
		const layerView = slideView.layerViews.find((v) => v.data === layer);
		if (!layerView) return false;
		slideView.selectLayerView(layerView);
		watchSelectedLayer();
		emitSelected();
		emitLayerList();
		return true;
	};

	const setCanvasScale = (scale: number): boolean => {
		if (!isFinite(scale) || scale <= 0) return false;
		const next = Math.max(0.1, Math.min(20, scale));
		if (next === slideView.scale) return true;
		slideView.scale = next;
		emitCanvas();
		return true;
	};

	const setRectEdit = (enabled: boolean): void => {
		if (slideView.rectEdit === enabled) return;
		slideView.rectEdit = enabled;
		emitCanvas();
	};

	const lm: EditLayerMutationUseCase = createEditLayerMutationUseCase({
		getSelectedLayer: () => slideView.editingLayer,
		getCurrentSlide: () => slideView.slide,
		getNextSlide: (slide) => slideStore.getState().getNextSlide(slide as Slide),
		getPrevSlide: (slide) => slideStore.getState().getPrevSlide(slide as Slide),
		getReferenceLayers: () => layerStore.getState().layers,
		createTextLayer,
		createImageLayer,
		getSharedLayerRemovalTargets: (layer) => slideView.getSharedLayerRemovalTargets(layer),
		registerImageFromFile: (file) => ImageManager.shared.registImageFromFile(file),
		selectLayer: (layer) => selectEditLayer(layer),
		trackSharedLayer: (layer) => slideView.trackSharedLayer(layer),
		clearSharedLayerTracking: (layer) => slideView.clearSharedLayerTracking(layer),
		maxLayerMoveOffset: SLIDE_LAYER_NUM_MAX,
		emitAfterMutation: (render, includeLayerList) => {
			slideStore.getState().notifyLayersChanged();
			if (render === "current") {
				watchSelectedLayer();
				emitSelected();
				emitLayerList();
				emitCanvas();
				return;
			}
			emitSelected();
			if (includeLayerList) emitLayerList();
		},
	});

	// EditableSlideView を React マウント。slideView ハンドルを同期取得するため flushSync を使用。
	const slideViewRef = createRef<EditableSlideViewHandle>();
	const root = createRoot(obj);
	flushSync(() =>
		root.render(
			createElement(EditableSlideViewForRender, {
				ref: slideViewRef,
				slide: createSlide(),
				onImageDropped: (imageId) => lm.addImageLayer(imageId),
			})
		)
	);
	slideView = slideViewRef.current!;

	slideView.addEventListener(PropertyEvent.UPDATE, (pe: PropertyEvent) => {
		if (pe.propFlags & PropFlags.LV_SELECT) {
			watchSelectedLayer();
			emitSelected();
			emitLayerList();
		}
		if (pe.propFlags & (PropFlags.DSV_SCALE | PropFlags.ESV_RECT)) {
			emitCanvas();
		}
	});

	const handle: EditCanvasRuntime = Object.assign({}, lm, {
		slideView,
		initialize() {
			setSlide(createSlide());
		},
		setMode(mode: ViewerMode) {
			slideView.isActive = mode === ViewerMode.EDIT;
		},
		setSlide,
		emitCurrentState() {
			watchSelectedLayer();
			emitSelected();
			emitLayerList();
			emitCanvas();
		},
		hasSelectedLayer: () => slideView.editingLayer != null,
		selectEditLayerByIndex(index: number) {
			if (!Number.isInteger(index)) return false;
			const layer = slideView.slide.layers[index];
			if (!layer) return false;
			return selectEditLayer(layer);
		},
		// クラス時代に emit-after を挟んでいた 2 つだけ override。残りは spread で素通し。
		copySelectedLayer: () => {
			if (!lm.copySelectedLayer()) return false;
			emitSelected();
			return true;
		},
		copySelectedLayerTransform: () => {
			if (!lm.copySelectedLayerTransform()) return false;
			emitSelected();
			return true;
		},
		getSelectedLayerRemovalRequest() {
			const layer = slideView.editingLayer;
			if (!layer) return null;
			return {
				layerName: layer.name || "selected layer",
				shared: lm.hasSelectedLayerSharedRemovalTargets(),
			};
		},
		downloadSelectedImage() {
			const layer = slideView.editingLayer;
			if (!layer || layer.type !== LayerType.IMAGE) return false;
			const src = ImageManager.shared.getSrcById((layer as ImageLayer).imageId);
			if (!src) return false;
			const a = document.createElement("a");
			a.href = src;
			a.target = "_blank";
			a.download = slideView.selectedLayer?.name || "image";
			a.click();
			window.URL.revokeObjectURL(a.href);
			return true;
		},
		zoomInCanvas: () => {
			setCanvasScale(slideView.scale * 1.1);
		},
		zoomOutCanvas: () => {
			setCanvasScale(slideView.scale / 1.1);
		},
		resetCanvasZoom: () => {
			setCanvasScale(EDITABLE_SLIDE_VIEW_SCALE_DEFAULT);
		},
		setCanvasScale,
		toggleRectEdit: () => {
			setRectEdit(!slideView.rectEdit);
		},
		setRectEdit,
	});

	return handle;
}
