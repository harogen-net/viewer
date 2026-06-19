import { PropertyEvent } from "../events/PropertyEvent";
import { Layer, LayerType } from "../model/Layer";
import { createImageLayer, ImageLayer } from "../model/layer/ImageLayer";
import { createTextLayer, TextLayer } from "../model/layer/TextLayer";
import { PropFlags } from "../model/PropFlags";
import { SLIDE_LAYER_NUM_MAX, type Direction, type Slide } from "../model/Slide";
import { layerStore, type EditLayerValues } from "../state/layerStore";
import { slideStore } from "../state/slideStore";
import {
    createEditLayerMutationUseCase,
    type EditLayerMutationUseCase,
    type LayerMutationRenderScope,
} from "../useCase/EditLayerMutationUseCase";
import { ImageManager } from "../utils/ImageManager";
import {
    EDITABLE_SLIDE_VIEW_SCALE_DEFAULT,
    type EditableSlideViewHandle,
} from "../view/slide";
import { mountEditableSlideViewInto, type ReactViewMount } from "./mountReactView";
import { ViewerMode } from "./viewerMode";

export class EditCanvasRuntime {
	public slideView: EditableSlideViewHandle;
	private observedLayer: Layer | null = null;
	private readonly layerMutations: EditLayerMutationUseCase;
	private readonly slideViewMount: ReactViewMount<EditableSlideViewHandle>;

	constructor(public obj: HTMLElement) {
		this.obj.classList.add("slideCanvas");

		this.slideViewMount = mountEditableSlideViewInto(this.obj, (imageId) => {
			this.layerMutations.addImageLayer(imageId);
		});
		this.slideView = this.slideViewMount.handle;
		this.layerMutations = createEditLayerMutationUseCase({
			getSelectedLayer: () => this.slideView.editingLayer,
			getCurrentSlide: () => this.slide,
			getNextSlide: (slide) => slideStore.getState().getNextSlide(slide as Slide),
			getPrevSlide: (slide) => slideStore.getState().getPrevSlide(slide as Slide),
			getReferenceLayers: () => layerStore.getState().layers,
			createTextLayer,
			createImageLayer,
			getSharedLayerRemovalTargets: (layer) => this.slideView.getSharedLayerRemovalTargets(layer),
			registerImageFromFile: (file) => ImageManager.shared.registImageFromFile(file),
			selectLayer: (layer) => this.selectEditLayer(layer),
			trackSharedLayer: (layer) => this.slideView.trackSharedLayer(layer),
			clearSharedLayerTracking: (layer) => this.slideView.clearSharedLayerTracking(layer),
			maxLayerMoveOffset: SLIDE_LAYER_NUM_MAX,
			emitAfterMutation: (render, includeLayerList) => {
				this.emitAfterLayerMutation(render, includeLayerList);
			},
		});

		this.slideView.addEventListener(PropertyEvent.UPDATE, (pe: PropertyEvent) => {
			if (pe.propFlags & PropFlags.LV_SELECT) {
				this.watchSelectedLayer();
				this.emitSelectedLayerState();
				this.emitLayerListState();
			}
			if (pe.propFlags & (PropFlags.DSV_SCALE | PropFlags.ESV_RECT)) {
				this.emitCanvasState();
			}
		});
	}

	//

	initialize() {
		this.setSlide(createSlide());
		// this.slideView.slide = createSlide();
	}

	setMode(mode: ViewerMode): void {
		switch (mode) {
			case ViewerMode.SELECT:
			case ViewerMode.SLIDESHOW:
				this.slideView.isActive = false;
				break;
			case ViewerMode.EDIT:
				this.slideView.isActive = true;
				break;
		}
	}

	public setSlide(newSlide: Slide) {
		if (this.slide) {
			this.slide.removeEventListener(PropertyEvent.UPDATE, this.onSlideUpdate);
		}

		this.slideView.slide = newSlide;

		if (this.slide) {
			this.slide.addEventListener(PropertyEvent.UPDATE, this.onSlideUpdate);
		}
		this.watchSelectedLayer();
		this.emitSelectedLayerState();
		this.emitLayerListState();
		this.emitCanvasState();
	}

	private emitCanvasState(): void {
		layerStore.getState().setEditCanvasState({
			scale: this.slideView.scale,
			rectEdit: this.slideView.rectEdit,
		});
	}

	private emitLayerListState(): void {
		const selected = this.slideView.selectedLayer;
		const layers = this.slide.layers.map((layer, index) => ({
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

	private watchSelectedLayer(): void {
		const currentLayer = this.slideView.editingLayer;
		if (this.observedLayer === currentLayer) {
			return;
		}
		if (this.observedLayer) {
			this.observedLayer.removeEventListener(PropertyEvent.UPDATE, this.onObservedLayerUpdate);
		}
		this.observedLayer = currentLayer;
		if (this.observedLayer) {
			this.observedLayer.addEventListener(PropertyEvent.UPDATE, this.onObservedLayerUpdate);
		}
	}

	private onObservedLayerUpdate = (pe: PropertyEvent) => {
		this.emitSelectedLayerState();
		if (pe.propFlags & (PropFlags.NAME | PropFlags.LOCKED | PropFlags.VISIBLE | PropFlags.SHARED)) {
			this.emitLayerListState();
		}
	};

	private emitSelectedLayerState(): void {
		const layer = this.slideView.editingLayer;
		const canPasteLayer = this.layerMutations.canPasteLayer();
		const canPasteLayerTransform = this.layerMutations.canPasteLayerTransform();
		if (!layer) {
			layerStore.getState().setEditSelection({
				hasSelection: false,
				canPasteLayer,
				canPasteLayerTransform,
			});
			const values: EditLayerValues = {
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
			layerStore.getState().setEditValues(values);
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

	public emitCurrentState(): void {
		this.watchSelectedLayer();
		this.emitSelectedLayerState();
		this.emitLayerListState();
		this.emitCanvasState();
	}

	/**
	 * Republish the layer/slide plain-data snapshots from the current model
	 * state. Invoked as part of the layer-mutation commit so that model updates
	 * and snapshot updates happen in the same transaction, without depending on
	 * `PropertyEvent` UI synchronization.
	 */
	private republishSlideSnapshots(): void {
		slideStore.getState().notifyLayersChanged();
	}

	private emitAfterLayerMutation(render: LayerMutationRenderScope, includeLayerList = false): void {
		this.republishSlideSnapshots();
		if (render === "current") {
			this.emitCurrentState();
			return;
		}
		this.emitSelectedLayerState();
		if (includeLayerList) {
			this.emitLayerListState();
		}
	}

	public toggleSelectedLayerIsText(): boolean {
		return this.layerMutations.toggleSelectedLayerIsText();
	}

	public spreadSelectedLayer(): boolean {
		return this.layerMutations.spreadSelectedLayer();
	}

	public hasSelectedLayer(): boolean {
		return this.slideView.editingLayer != null;
	}

	public selectEditLayerByIndex(index: number): boolean {
		if (!Number.isInteger(index)) return false;
		const layer = this.slide.layers[index];
		if (!layer) return false;
		return this.selectEditLayer(layer);
	}

	public toggleSelectedLayerVisible(): boolean {
		return this.layerMutations.toggleSelectedLayerVisible();
	}

	public toggleSelectedLayerLocked(): boolean {
		return this.layerMutations.toggleSelectedLayerLocked();
	}

	public toggleSelectedLayerShared(): boolean {
		return this.layerMutations.toggleSelectedLayerShared();
	}

	public setSelectedLayerName(name: string): boolean {
		return this.layerMutations.setSelectedLayerName(name);
	}

	public setSelectedLayerText(text: string): boolean {
		return this.layerMutations.setSelectedLayerText(text);
	}

	public rotateSelectedLayer(degree: number): boolean {
		return this.layerMutations.rotateSelectedLayer(degree);
	}

	public toggleSelectedLayerMirrorH(): boolean {
		return this.layerMutations.toggleSelectedLayerMirrorH();
	}

	public toggleSelectedLayerMirrorV(): boolean {
		return this.layerMutations.toggleSelectedLayerMirrorV();
	}

	public fitSelectedLayer(): boolean {
		return this.layerMutations.fitSelectedLayer();
	}

	public arrangeSelectedLayer(direction: Direction): boolean {
		return this.layerMutations.arrangeSelectedLayer(direction);
	}

	public swapSelectedLayer(offset: number): boolean {
		return this.layerMutations.swapSelectedLayer(offset);
	}

	public moveSelectedLayerToTop(): boolean {
		return this.layerMutations.moveSelectedLayerToTop();
	}

	public moveSelectedLayerToBottom(): boolean {
		return this.layerMutations.moveSelectedLayerToBottom();
	}

	public moveSelectedLayerToIndex(toIndex: number): boolean {
		return this.layerMutations.moveSelectedLayerToIndex(toIndex);
	}

	public copySelectedLayer(): boolean {
		if (!this.layerMutations.copySelectedLayer()) return false;
		this.emitSelectedLayerState();
		return true;
	}

	public cutSelectedLayer(): boolean {
		return this.layerMutations.cutSelectedLayer();
	}

	public pasteLayer(): boolean {
		return this.layerMutations.pasteLayer();
	}

	public copySelectedLayerTransform(): boolean {
		if (!this.layerMutations.copySelectedLayerTransform()) return false;
		this.emitSelectedLayerState();
		return true;
	}

	public pasteLayerTransform(): boolean {
		return this.layerMutations.pasteLayerTransform();
	}

	public getSelectedLayerRemovalRequest(): { layerName: string; shared: boolean } | null {
		const layer = this.slideView.editingLayer;
		if (!layer) return null;
		return {
			layerName: layer.name || "selected layer",
			shared: this.layerMutations.hasSelectedLayerSharedRemovalTargets(),
		};
	}

	public removeSelectedLayer(confirmedSharedRemoval = false): boolean {
		return this.layerMutations.removeSelectedLayer(confirmedSharedRemoval);
	}

	public addTextLayer(text: string): boolean {
		return this.layerMutations.addTextLayer(text);
	}

	public async replaceSelectedImage(file: File, applyAllReferences: boolean): Promise<boolean> {
		return this.layerMutations.replaceSelectedImage(file, applyAllReferences);
	}

	public downloadSelectedImage(): boolean {
		const layer = this.slideView.editingLayer;
		if (!layer || layer.type != LayerType.IMAGE) return false;
		const imageLayer = layer as ImageLayer;
		const src = ImageManager.shared.getSrcById(imageLayer.imageId);
		if (!src) return false;
		const a = document.createElement("a");
		a.href = src;
		a.target = "_blank";
		a.download = this.selectedLayer?.name || "image";
		a.click();
		window.URL.revokeObjectURL(a.href);
		return true;
	}

	public nudgeSelectedLayer(deltaX: number, deltaY: number): boolean {
		return this.layerMutations.nudgeSelectedLayer(deltaX, deltaY);
	}

	public setSelectedLayerPosition(nextX: number, nextY: number): boolean {
		return this.layerMutations.setSelectedLayerPosition(nextX, nextY);
	}

	public scaleSelectedLayer(factor: number): boolean {
		return this.layerMutations.scaleSelectedLayer(factor);
	}

	public setSelectedLayerScale(scale: number): boolean {
		return this.layerMutations.setSelectedLayerScale(scale);
	}

	public adjustSelectedLayerRotation(delta: number): boolean {
		return this.layerMutations.adjustSelectedLayerRotation(delta);
	}

	public setSelectedLayerRotation(rotation: number): boolean {
		return this.layerMutations.setSelectedLayerRotation(rotation);
	}

	public resetSelectedLayerRotation(): boolean {
		return this.layerMutations.resetSelectedLayerRotation();
	}

	public adjustSelectedLayerOpacity(delta: number): boolean {
		return this.layerMutations.adjustSelectedLayerOpacity(delta);
	}

	public setSelectedLayerOpacity(opacity: number): boolean {
		return this.layerMutations.setSelectedLayerOpacity(opacity);
	}

	public resetSelectedLayerOpacity(): boolean {
		return this.layerMutations.resetSelectedLayerOpacity();
	}

	public setSelectedImageClip(top: number, right: number, bottom: number, left: number): boolean {
		return this.layerMutations.setSelectedImageClip(top, right, bottom, left);
	}

	public resetSelectedImageClip(): boolean {
		return this.layerMutations.resetSelectedImageClip();
	}

	public zoomInCanvas(): void {
		this.setCanvasScale(this.slideView.scale * 1.1);
	}

	public zoomOutCanvas(): void {
		this.setCanvasScale(this.slideView.scale / 1.1);
	}

	public resetCanvasZoom(): void {
		this.setCanvasScale(EDITABLE_SLIDE_VIEW_SCALE_DEFAULT);
	}

	public setCanvasScale(scale: number): boolean {
		if (!isFinite(scale) || scale <= 0) return false;
		const next = Math.max(0.1, Math.min(20, scale));
		if (next === this.slideView.scale) return true;
		this.slideView.scale = next;
		this.emitCanvasState();
		return true;
	}

	public toggleRectEdit(): void {
		this.setRectEdit(!this.slideView.rectEdit);
	}

	public setRectEdit(enabled: boolean): void {
		if (this.slideView.rectEdit === enabled) return;
		this.slideView.rectEdit = enabled;
		this.emitCanvasState();
	}

	//
	// event handlers
	//
	private onSlideUpdate = (pe: PropertyEvent) => {
		var flag = pe.propFlags;
		if (flag & (PropFlags.S_LAYER_ADD | PropFlags.S_LAYER_REMOVE | PropFlags.S_LAYER_ORDER)) {
			this.emitLayerListState();
		}
	};

	//
	// getset
	//
	private selectEditLayer(layer: Layer): boolean {
		const layerView = this.slideView.layerViews.find((view) => view.data === layer);
		if (!layerView) return false;
		this.slideView.selectLayerView(layerView);
		this.watchSelectedLayer();
		this.emitSelectedLayerState();
		this.emitLayerListState();
		return true;
	}

	private get slide(): Slide {
		return this.slideView.slide;
	}
	private get selectedLayer(): Layer {
		return this.slideView.selectedLayer;
	}
}
