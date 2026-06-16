import { useEffect, useImperativeHandle, useMemo, useRef, type Ref } from "react";
import { EventDispatcher } from "../../events/EventDispatcher";
import { PropertyEvent } from "../../events/PropertyEvent";
import { IDroppable } from "../../interface/IDroppable";
import { Layer, LayerType } from "../../model/Layer";
import { ImageLayer } from "../../model/layer/ImageLayer";
import { TextLayer } from "../../model/layer/TextLayer";
import { PropFlags } from "../../model/PropFlags";
import { Slide } from "../../model/Slide";
import { ViewerDocument } from "../../model/ViewerDocument";
import { DropHelper } from "../../utils/DropHelper";
import { Command, HistoryManager, Transaction } from "../../utils/HistoryManager";
import { AdjustView, type AdjustViewHandle } from "../layer/AdjustView";
import { LayerView } from "../LayerView";
import { DOMSlideView, type DOMSlideViewHandle } from "./DOMSlideView";

export const EDITABLE_SLIDE_VIEW_SCALE_DEFAULT = 0.9;

type EditableSlideViewProps = {
	ref?: Ref<EditableSlideViewHandle>;
	slide: Slide;
};

export type EditableSlideViewHandle = EventDispatcher &
	IDroppable & {
		readonly layerViews: LayerView[];
		readonly canPasteLayer: boolean;
		readonly canPasteLayerTransform: boolean;
		selectedLayerView: LayerView | null;
		isActive: boolean;
		rectEdit: boolean;
		scale: number;
		slide: Slide;
		readonly selectedLayer: Layer | null;
		readonly editingLayer: Layer | null;
		destroy: () => void;
		updateSize: () => void;
		selectLayerView: (targetLayerView?: LayerView | null) => void;
		cut: () => void;
		copy: () => void;
		paste: () => void;
		copyTrans: () => void;
		pasteTrans: () => void;
		spreadLayers: (layer: Layer) => void;
		runWithSharedLayerRemovalConfirmation: <T>(confirmed: boolean, operation: () => T) => T;
		hasSharedLayerRemovalTargets: (layer: Layer) => boolean;
	};

type LayerCleanup = () => void;

const getLayerElement = (layerView: LayerView): HTMLElement => {
	return layerView.element;
};

export const EditableSlideView = ({ ref, slide }: EditableSlideViewProps) => {
	const baseRef = useRef<DOMSlideViewHandle | null>(null);
	const adjustViewRef = useRef<AdjustViewHandle | null>(null);
	const borderRef = useRef<HTMLDivElement | null>(null);
	const selectedLayerViewRef = useRef<LayerView | null>(null);
	const copiedLayerRef = useRef<Layer | null>(null);
	const copiedTransformRef = useRef<any>(null);
	const isActiveRef = useRef(false);
	const rectEditRef = useRef(false);
	const lastSelectedIdRef = useRef("");
	const lastSelectedIndexRef = useRef(-1);
	const sharedLayersByUUIDRef = useRef<{ [key: string]: Layer[] }>({});
	const rectLayersRef = useRef<{ [key: string]: Layer[] }>({});
	const allowSharedLayerRemovalWithoutConfirmRef = useRef(false);
	const layerCleanupsRef = useRef(new Map<LayerView, LayerCleanup>());
	const handleRef = useRef<EditableSlideViewHandle | null>(null);

	const getBase = () => baseRef.current as DOMSlideViewHandle;
	const getAdjustView = () => adjustViewRef.current as AdjustViewHandle;

	const selectLayerView = (targetLayerView: LayerView | null = null) => {
		const handle = handleRef.current as EditableSlideViewHandle;
		selectedLayerViewRef.current = targetLayerView;
		if (adjustViewRef.current) {
			adjustViewRef.current.targetLayerView = selectedLayerViewRef.current;
		}
		handle.dispatchEvent(new PropertyEvent(PropertyEvent.UPDATE, handle, PropFlags.LV_SELECT));

		getBase().layerViews.forEach((layerView) => {
			if (layerView !== targetLayerView) layerView.selected = false;
		});

		if (selectedLayerViewRef.current !== null) {
			if (selectedLayerViewRef.current.type === LayerType.IMAGE) {
				lastSelectedIdRef.current = (selectedLayerViewRef.current.data as ImageLayer).imageId;
			} else if (selectedLayerViewRef.current.type === LayerType.TEXT) {
				lastSelectedIdRef.current = (selectedLayerViewRef.current.data as TextLayer).text;
			}
			lastSelectedIndexRef.current = getBase().slide.layers.indexOf(
				selectedLayerViewRef.current.data
			);

			if (rectEditRef.current) {
				listRectLayers(selectedLayerViewRef.current.data);
			}
		}
	};

	const onLayerViewUpdate = (event: PropertyEvent) => {
		if (!isActiveRef.current) return;
		if (event.propFlags & PropFlags.LV_SELECT && (event.targe as LayerView).selected) {
			selectLayerView(event.targe as LayerView);
		}
	};

	const setupLayerView = (layerView: LayerView) => {
		layerView.selected = false;
		layerView.addEventListener(PropertyEvent.UPDATE, onLayerViewUpdate);
		const element = getLayerElement(layerView);

		const removePendingMove = () => {
			element.removeEventListener("mousemove", onMouseMove);
		};
		const onMouseMove = (event: MouseEvent) => {
			removePendingMove();
			layerView.selected = true;
			getAdjustView().startDrag(event);
		};
		const onMouseDown = (event: MouseEvent) => {
			if (layerView.selected) return;
			if (layerView.data.locked) return;
			removePendingMove();
			element.addEventListener("mousemove", onMouseMove);
			event.stopImmediatePropagation();
		};
		const onMouseUp = () => {
			removePendingMove();
			if (!layerView.selected && !getAdjustView().isDrag && !layerView.data.locked) {
				layerView.selected = true;
			}
		};

		element.addEventListener("mousedown", onMouseDown);
		element.addEventListener("mouseup", onMouseUp);

		layerCleanupsRef.current.set(layerView, () => {
			layerView.removeEventListener(PropertyEvent.UPDATE, onLayerViewUpdate);
			removePendingMove();
			element.removeEventListener("mousedown", onMouseDown);
			element.removeEventListener("mouseup", onMouseUp);
		});

		if (layerView.data.shared) {
			listSharedLayers(layerView.data);
		}
	};

	const cleanupLayerView = (layerView: LayerView) => {
		layerCleanupsRef.current.get(layerView)?.();
		layerCleanupsRef.current.delete(layerView);

		if (layerView.selected) {
			selectLayerView(null);
		}
		if (sharedLayersByUUIDRef.current[layerView.data.uuid] !== undefined) {
			delete sharedLayersByUUIDRef.current[layerView.data.uuid];
		}
	};

	const copy = () => {
		if (!isActiveRef.current) return;
		if (selectedLayerViewRef.current) {
			copiedLayerRef.current = selectedLayerViewRef.current.data.clone();
		}
	};

	const cut = () => {
		if (!isActiveRef.current) return;
		if (!selectedLayerViewRef.current) return;
		copy();
		const layer = selectedLayerViewRef.current.data;
		const index = getBase().slide.indexOf(layer);
		HistoryManager.shared
			.record(
				new Command(
					() => {
						getBase().slide.removeLayer(layer);
					},
					() => {
						getBase().slide.addLayer(layer, index);
					}
				)
			)
			.do();
	};

	const paste = () => {
		if (!isActiveRef.current) return;
		if (!copiedLayerRef.current) return;
		const layer = copiedLayerRef.current.clone();
		HistoryManager.shared
			.record(
				new Command(
					() => {
						getBase().slide.addLayer(layer);
						const layerView = getBase().getViewByLayer(layer);
						if (layerView) layerView.selected = true;
					},
					() => {
						getBase().slide.removeLayer(layer);
					}
				)
			)
			.do();
	};

	const copyTrans = () => {
		if (!selectedLayerViewRef.current) return;
		copiedTransformRef.current = selectedLayerViewRef.current.data.transform;
	};

	const pasteTrans = () => {
		if (!selectedLayerViewRef.current) return;
		if (!copiedTransformRef.current) return;
		const layer = selectedLayerViewRef.current.data;
		const initValue = layer.transform;
		const endValue = Object.assign({}, copiedTransformRef.current);
		HistoryManager.shared
			.record(
				new Command(
					() => {
						layer.transform = endValue;
					},
					() => {
						layer.transform = initValue;
					}
				)
			)
			.do();
	};

	const updateSize = () => {
		const base = getBase();
		const element = base.element;
		if (!element || !base.slide) return;
		const nextScaleBase = Math.min(
			element.clientWidth / base.slide.width,
			element.clientHeight / base.slide.height
		);
		base.setScaleBase(nextScaleBase);
		if (borderRef.current) {
			borderRef.current.style.borderWidth = `${6 / base.actualScale}px`;
		}
		if (adjustViewRef.current) {
			adjustViewRef.current.base_scale = base.actualScale;
		}
	};

	const replaceSlide = (newSlide: Slide) => {
		const base = getBase();
		rectEditRef.current = false;
		selectLayerView(null);
		sharedLayersByUUIDRef.current = {};
		rectLayersRef.current = {};
		base.slide = newSlide;
		base.scale = EDITABLE_SLIDE_VIEW_SCALE_DEFAULT;

		let autoSelectedLayer: Layer | null = null;
		if (base.slide.layers.length > 0) {
			if (lastSelectedIdRef.current !== "") {
				base.slide.layers.forEach((layer) => {
					if (layer.type === LayerType.IMAGE) {
						if (lastSelectedIdRef.current === (layer as ImageLayer).imageId) {
							if (!layer.locked && layer.visible) autoSelectedLayer = layer;
						}
					} else if (layer.type === LayerType.TEXT) {
						if (lastSelectedIdRef.current === (layer as TextLayer).text) {
							if (!layer.locked && layer.visible) autoSelectedLayer = layer;
						}
					}
				});
			}

			if (!autoSelectedLayer) {
				if (
					lastSelectedIndexRef.current !== -1 &&
					base.slide.layers.length > lastSelectedIndexRef.current
				) {
					const layer = base.slide.layers[lastSelectedIndexRef.current];
					if (!layer.locked && layer.visible) autoSelectedLayer = layer;
				}
			}
			if (!autoSelectedLayer) {
				for (let index = base.slide.layers.length - 1; index >= 0; index--) {
					const layer = base.slide.layers[index];
					if (!layer.locked && layer.visible) {
						autoSelectedLayer = layer;
						break;
					}
				}
			}
			if (autoSelectedLayer) {
				const layerView = base.getViewByLayer(autoSelectedLayer);
				if (layerView) layerView.selected = true;
			}
		}
	};

	const listSharedLayers = (layer: Layer) => {
		if (!layer.shared) return;
		sharedLayersByUUIDRef.current[layer.uuid] = [];
		const findInSlide = (slide: Slide) => {
			let find = false;
			for (let index = 0; index < slide.layers.length; index++) {
				const tmpLayer = slide.layers[index];
				if (!tmpLayer.shared) continue;
				if (tmpLayer.type !== layer.type) continue;
				if (layer.type === LayerType.IMAGE) {
					if ((layer as ImageLayer).imageId === (tmpLayer as ImageLayer).imageId) {
						find = true;
						sharedLayersByUUIDRef.current[layer.uuid].push(tmpLayer);
						break;
					}
				} else if (layer.type === LayerType.TEXT) {
					if ((layer as TextLayer).text === (tmpLayer as TextLayer).text) {
						find = true;
						sharedLayersByUUIDRef.current[layer.uuid].push(tmpLayer);
						break;
					}
				}
			}
			return find;
		};

		let slide = ViewerDocument.shared.getNextSlide(getBase().slide);
		while (slide && findInSlide(slide)) slide = ViewerDocument.shared.getNextSlide(slide);
		slide = ViewerDocument.shared.getPrevSlide(getBase().slide);
		while (slide && findInSlide(slide)) slide = ViewerDocument.shared.getPrevSlide(slide);
	};

	const listRectLayers = (layer: Layer) => {
		if (layer.type !== LayerType.IMAGE) return;
		rectLayersRef.current[layer.uuid] = [];
		const collect = (slide: Slide) => {
			slide.layers.forEach((tmpLayer) => {
				if (tmpLayer.uuid === layer.uuid) return;
				if (tmpLayer.type !== layer.type) return;
				if (layer.x !== tmpLayer.x) return;
				if (layer.y !== tmpLayer.y) return;
				if (layer.originWidth !== tmpLayer.originWidth) return;
				if (layer.originHeight !== tmpLayer.originHeight) return;
				if (layer.scaleX !== tmpLayer.scaleX) return;
				if (layer.scaleY !== tmpLayer.scaleY) return;
				if (layer.mirrorH !== tmpLayer.mirrorH) return;
				if (layer.mirrorV !== tmpLayer.mirrorV) return;
				rectLayersRef.current[layer.uuid].push(tmpLayer);
			});
		};

		collect(getBase().slide);
		let slide = ViewerDocument.shared.getNextSlide(getBase().slide);
		while (slide) {
			collect(slide);
			slide = ViewerDocument.shared.getNextSlide(slide);
		}
		slide = ViewerDocument.shared.getPrevSlide(getBase().slide);
		while (slide) {
			collect(slide);
			slide = ViewerDocument.shared.getPrevSlide(slide);
		}
	};

	const multipleLayerOperation = (layer: Layer, layers: Layer[], flag: number) => {
		if (!layer || !layers || layers.length === 0 || flag === 0) return;
		isActiveRef.current = false;
		layers.forEach((tmpLayer) => {
			if (
				flag &
				(PropFlags.X |
					PropFlags.Y |
					PropFlags.SCALE_X |
					PropFlags.SCALE_Y |
					PropFlags.ROTATION |
					PropFlags.MIRROR_H |
					PropFlags.MIRROR_V)
			) {
				tmpLayer.transform = layer.transform;
			}
			if (flag & PropFlags.VISIBLE) tmpLayer.visible = layer.visible;
			if (flag & PropFlags.LOCKED) tmpLayer.locked = layer.locked;
			if (flag & PropFlags.OPACITY) tmpLayer.opacity = layer.opacity;
			if (layer.type === LayerType.IMAGE) {
				if (flag & PropFlags.IMG_IMAGEID)
					(tmpLayer as ImageLayer).imageId = (layer as ImageLayer).imageId;
				if (flag & PropFlags.IMG_CLIP)
					(tmpLayer as ImageLayer).clipRect = (layer as ImageLayer).clipRect;
				if (flag & PropFlags.IMG_TEXT)
					(tmpLayer as ImageLayer).isText = (layer as ImageLayer).isText;
			}
			if (layer.type === LayerType.TEXT && flag & PropFlags.TXT_TEXT) {
				(tmpLayer as TextLayer).text = (layer as TextLayer).text;
			}
		});
		isActiveRef.current = true;
	};

	const spreadLayers = (layer: Layer) => {
		if (!layer) return;
		if (!getBase().slide.contains(layer)) return;
		if (!layer.shared) layer.shared = true;
		const index = getBase().slide.indexOf(layer);
		const transaction = new Transaction();
		const applyToSlide = (slide: Slide) => {
			let continueToNext = true;
			let find = false;
			for (let i = 0; i < slide.layers.length; i++) {
				const tmpLayer = slide.layers[i];
				if (tmpLayer.type !== layer.type) continue;
				if (layer.type === LayerType.IMAGE) {
					if ((layer as ImageLayer).imageId === (tmpLayer as ImageLayer).imageId) {
						find = true;
						if (tmpLayer.shared) {
							continueToNext = false;
						} else {
							const targetLayer = tmpLayer;
							transaction.record(
								() => {
									targetLayer.shared = true;
								},
								() => {
									targetLayer.shared = false;
								}
							);
						}
						break;
					}
				} else if (layer.type === LayerType.TEXT) {
					if ((layer as TextLayer).text === (tmpLayer as TextLayer).text) {
						find = true;
						if (tmpLayer.shared) {
							continueToNext = false;
						} else {
							const targetLayer = tmpLayer;
							transaction.record(
								() => {
									targetLayer.shared = true;
								},
								() => {
									targetLayer.shared = false;
								}
							);
						}
						break;
					}
				}
			}
			if (!find) {
				const newLayer = layer.clone();
				transaction.record(
					() => {
						slide.addLayer(newLayer, index);
					},
					() => {
						slide.removeLayer(newLayer);
					}
				);
			}
			return continueToNext;
		};

		let slide = ViewerDocument.shared.getNextSlide(getBase().slide);
		while (slide && applyToSlide(slide)) slide = ViewerDocument.shared.getNextSlide(slide);
		slide = ViewerDocument.shared.getPrevSlide(getBase().slide);
		while (slide && applyToSlide(slide)) slide = ViewerDocument.shared.getPrevSlide(slide);

		if (transaction.length > 0) {
			HistoryManager.shared.record(transaction).do();
			listSharedLayers(layer);
		}
	};

	const handle = useMemo(() => {
		const dispatcher = new EventDispatcher() as EditableSlideViewHandle;
		Object.defineProperties(dispatcher, {
			element: {
				get: () => baseRef.current?.element ?? null,
			},
			layerViews: {
				get: () => baseRef.current?.layerViews ?? [],
			},
			selectedLayerView: {
				get: () => selectedLayerViewRef.current,
				set: (value: LayerView | null) => {
					selectedLayerViewRef.current = value;
				},
			},
			canPasteLayer: {
				get: () => copiedLayerRef.current !== null,
			},
			canPasteLayerTransform: {
				get: () => copiedTransformRef.current !== null,
			},
			isActive: {
				get: () => isActiveRef.current,
				set: (value: boolean) => {
					isActiveRef.current = value;
					const element = baseRef.current?.element;
					if (isActiveRef.current) {
						element?.classList.remove("passive");
						setTimeout(() => updateSize(), 300);
					} else {
						element?.classList.add("passive");
						element?.classList.remove("fileOver");
					}
				},
			},
			rectEdit: {
				get: () => rectEditRef.current,
				set: (value: boolean) => {
					if (rectEditRef.current === value) return;
					rectEditRef.current = value;
					if (rectEditRef.current && selectedLayerViewRef.current) {
						listRectLayers(selectedLayerViewRef.current.data);
					}
					dispatcher.dispatchEvent(
						new PropertyEvent(PropertyEvent.UPDATE, dispatcher, PropFlags.ESV_RECT)
					);
				},
			},
			scale: {
				get: () => baseRef.current?.scale ?? EDITABLE_SLIDE_VIEW_SCALE_DEFAULT,
				set: (value: number) => {
					if (!baseRef.current) return;
					baseRef.current.scale = value;
					dispatcher.dispatchEvent(
						new PropertyEvent(PropertyEvent.UPDATE, dispatcher, PropFlags.DSV_SCALE)
					);
				},
			},
			slide: {
				get: () => baseRef.current?.slide,
				set: (value: Slide) => replaceSlide(value),
			},
			selectedLayer: {
				get: () => selectedLayerViewRef.current?.data ?? null,
			},
			editingLayer: {
				get: () => {
					const selectedLayer = selectedLayerViewRef.current?.data ?? null;
					if (selectedLayer && selectedLayer.locked && !selectedLayer.visible) return null;
					return selectedLayer;
				},
			},
		});
		dispatcher.destroy = () => {
			layerCleanupsRef.current.forEach((cleanup) => cleanup());
			layerCleanupsRef.current.clear();
			baseRef.current?.destroy();
			dispatcher.clearEventListener();
		};
		dispatcher.updateSize = updateSize;
		dispatcher.selectLayerView = selectLayerView;
		dispatcher.cut = cut;
		dispatcher.copy = copy;
		dispatcher.paste = paste;
		dispatcher.copyTrans = copyTrans;
		dispatcher.pasteTrans = pasteTrans;
		dispatcher.spreadLayers = spreadLayers;
		dispatcher.runWithSharedLayerRemovalConfirmation = <T,>(
			confirmed: boolean,
			operation: () => T
		): T => {
			const previous = allowSharedLayerRemovalWithoutConfirmRef.current;
			allowSharedLayerRemovalWithoutConfirmRef.current = confirmed;
			try {
				return operation();
			} finally {
				allowSharedLayerRemovalWithoutConfirmRef.current = previous;
			}
		};
		dispatcher.hasSharedLayerRemovalTargets = (layer: Layer): boolean => {
			return Boolean(layer.shared && sharedLayersByUUIDRef.current[layer.uuid] !== undefined);
		};
		return dispatcher;
	}, []);

	handleRef.current = handle;
	useImperativeHandle(ref, () => handle);

	const handleOptions = useMemo(
		() => ({
			onLayerViewAdded: (layerView: LayerView) => setupLayerView(layerView),
			onLayerViewRemoving: (layerView: LayerView) => cleanupLayerView(layerView),
			onSlideUpdate: (event: PropertyEvent) => {
				if (!isActiveRef.current) return false;
				const flag = event.propFlags;
				if (flag & PropFlags.S_LAYER) {
					const layer: Layer = event.options.layer;
					if (flag & PropFlags.SHARED) {
						if (!layer.shared) delete sharedLayersByUUIDRef.current[layer.uuid];
					} else if (layer.shared) {
						if (sharedLayersByUUIDRef.current[layer.uuid] === undefined) listSharedLayers(layer);
						multipleLayerOperation(layer, sharedLayersByUUIDRef.current[layer.uuid], flag);
						if (flag & PropFlags.IMG_IMAGEID) {
							delete sharedLayersByUUIDRef.current[layer.uuid];
							listSharedLayers(layer);
						}
					} else if (rectEditRef.current) {
						const flagForRect =
							flag &
							(PropFlags.X |
								PropFlags.Y |
								PropFlags.SCALE_X |
								PropFlags.SCALE_Y |
								PropFlags.MIRROR_H |
								PropFlags.MIRROR_V |
								PropFlags.ROTATION);
						if (flagForRect)
							multipleLayerOperation(layer, rectLayersRef.current[layer.uuid], flagForRect);
					}
				} else if (flag & PropFlags.S_LAYER_REMOVE) {
					const layer: Layer = event.options.layer;
					if (
						layer.shared &&
						sharedLayersByUUIDRef.current[layer.uuid] !== undefined &&
						allowSharedLayerRemovalWithoutConfirmRef.current
					) {
						const transaction = new Transaction();
						sharedLayersByUUIDRef.current[layer.uuid].forEach((tmpLayer) => {
							const slide = tmpLayer.parent;
							const index = slide.indexOf(tmpLayer);
							transaction.record(
								() => {
									slide.removeLayer(tmpLayer);
								},
								() => {
									slide.addLayer(tmpLayer, index);
								}
							);
						});
						delete sharedLayersByUUIDRef.current[layer.uuid];
						if (transaction.length) HistoryManager.shared.record(transaction).do();
					}
				}
				return false;
			},
		}),
		[]
	);

	useEffect(() => {
		const base = getBase();
		base.scale = EDITABLE_SLIDE_VIEW_SCALE_DEFAULT;
		base.element?.classList.add("editable");
		handle.isActive = false;
		const dropHelper = new DropHelper(handle);
		dropHelper.addEventListener(DropHelper.EVENT_DROP_COMPLETE, (event: CustomEvent) => {
			const imageId = event.detail;
			const layer = new ImageLayer(imageId);
			if (layer.originHeight > layer.originWidth * 1.2) layer.rotation -= 90;
			HistoryManager.shared
				.record(
					new Command(
						() => {
							base.slide.addLayer(layer);
							const layerView = base.getViewByLayer(layer);
							if (layerView) layerView.selected = true;
							base.slide.fitLayer(layer);
						},
						() => {
							base.slide.removeLayer(layer);
							layer.scale = 1;
						}
					)
				)
				.do();
		});
		const onWheel = (event: WheelEvent) => {
			if (!isActiveRef.current) return;
			const dScale = (0.1 * event.deltaY) / Math.abs(event.deltaY);
			handle.scale = handle.scale / (1 + dScale);
			if (adjustViewRef.current) adjustViewRef.current.base_scale = base.actualScale;
			event.preventDefault();
			event.stopPropagation();
		};
		const onMouseDown = () => {
			if (!isActiveRef.current) return;
			selectLayerView(null);
		};
		const onResize = () => {
			setTimeout(() => updateSize(), 50);
		};
		base.element?.addEventListener("wheel", onWheel);
		base.element?.addEventListener("mousedown", onMouseDown);
		window.addEventListener("resize", onResize);
		if (base.element?.clientWidth === 0 && base.element?.clientHeight === 0) {
			requestAnimationFrame(() => updateSize());
		} else {
			updateSize();
		}
		return () => {
			base.element?.removeEventListener("wheel", onWheel);
			base.element?.removeEventListener("mousedown", onMouseDown);
			window.removeEventListener("resize", onResize);
			dropHelper.clearEventListener();
		};
	}, []);

	return (
		<DOMSlideView ref={baseRef} slide={slide} className="editable" handleOptions={handleOptions}>
			<AdjustView ref={adjustViewRef} />
			<div ref={borderRef} className="border" />
		</DOMSlideView>
	);
};
