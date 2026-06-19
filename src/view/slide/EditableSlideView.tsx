import {
	useEffect,
	useImperativeHandle,
	useMemo,
	useRef,
	type FunctionComponent,
	type ReactNode,
	type Ref,
} from "react";
import {
	useEventDispatcher,
	type EventDispatcher,
	type EventListenerMap,
} from "../../events/EventDispatcher";
import { PropertyEvent } from "../../events/PropertyEvent";
import { IDroppable } from "../../interface/IDroppable";
import { Layer, LayerType } from "../../model/Layer";
import { ImageLayer } from "../../model/layer/ImageLayer";
import { TextLayer } from "../../model/layer/TextLayer";
import { PropFlags } from "../../model/PropFlags";
import { Slide } from "../../model/Slide";
import { slideStore } from "../../state/slideStore";
import { DropHelper } from "../../utils/DropHelper";
import { AdjustView, type AdjustViewHandle } from "../layer/AdjustView";
import { LayerView } from "../LayerView";
import { DOMSlideView } from "./DOMSlideView";

type DOMSlideViewHandle = {
	readonly element: HTMLDivElement | null;
	readonly layerViews: LayerView[];
	slide: Slide;
	scale: number;
	readonly actualScale: number;
	setScaleBase: (value: number) => void;
	destroy: () => void;
	getViewByLayer: (layer: Layer) => LayerView | null;
};
type DOMSlideViewRenderProps = {
	ref?: Ref<DOMSlideViewHandle>;
	slide: Slide;
	className?: string;
	children?: ReactNode;
	handleOptions?: unknown;
};

const DOMSlideViewForRender = DOMSlideView as unknown as FunctionComponent<DOMSlideViewRenderProps>;

export const EDITABLE_SLIDE_VIEW_SCALE_DEFAULT = 0.9;

export type EditableSlideViewProps = {
	ref?: Ref<EditableSlideViewHandle>;
	slide: Slide;
	onImageDropped?: (imageId: string) => void;
};

export type EditableSlideViewHandle = EventDispatcher &
	IDroppable & {
		readonly layerViews: LayerView[];
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
		trackSharedLayer: (layer: Layer) => void;
		getSharedLayerRemovalTargets: (layer: Layer) => readonly Layer[] | undefined;
		clearSharedLayerTracking: (layer: Layer) => void;
	};

type LayerCleanup = () => void;

export const EditableSlideView = ({ ref, slide, onImageDropped }: EditableSlideViewProps) => {
	const baseRef = useRef<DOMSlideViewHandle | null>(null);
	const adjustViewRef = useRef<AdjustViewHandle | null>(null);
	const borderRef = useRef<HTMLDivElement | null>(null);
	const selectedLayerViewRef = useRef<LayerView | null>(null);
	const isActiveRef = useRef(false);
	const rectEditRef = useRef(false);
	const lastSelectedIdRef = useRef("");
	const lastSelectedIndexRef = useRef(-1);
	const sharedLayersByUUIDRef = useRef<{ [key: string]: Layer[] }>({});
	const rectLayersRef = useRef<{ [key: string]: Layer[] }>({});
	const layerCleanupsRef = useRef(new Map<LayerView, LayerCleanup>());
	// 委譲化したマウス操作の状態：mousedown でセット、mousemove で drag 開始 or
	// mouseup でクリック選択化、いずれかで null にリセットする。
	const pendingLayerMoveRef = useRef<LayerView | null>(null);
	const handleRef = useRef<EditableSlideViewHandle | null>(null);
	const listenersRef = useRef<EventListenerMap>({});
	const {
		listeners,
		dispatchEvent,
		addEventListener,
		removeEventListener,
		clearEventListener,
		containEventListener,
		hasEventListener,
	} = useEventDispatcher(listenersRef);

	const getBase = () => baseRef.current as DOMSlideViewHandle;
	const getAdjustView = () => adjustViewRef.current as AdjustViewHandle;
	const getSlideStore = () => slideStore.getState();

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

		layerCleanupsRef.current.set(layerView, () => {
			layerView.removeEventListener(PropertyEvent.UPDATE, onLayerViewUpdate);
		});

		if (layerView.data.shared) {
			listSharedLayers(layerView.data);
		}
	};

	const cleanupLayerView = (layerView: LayerView) => {
		layerCleanupsRef.current.get(layerView)?.();
		layerCleanupsRef.current.delete(layerView);
		// 委譲ハンドラ側で参照中の pending を解除（マウント解除されたレイヤーへの誤適用を防ぐ）。
		if (pendingLayerMoveRef.current === layerView) {
			pendingLayerMoveRef.current = null;
		}

		if (layerView.selected) {
			selectLayerView(null);
		}
		if (sharedLayersByUUIDRef.current[layerView.data.uuid] !== undefined) {
			delete sharedLayersByUUIDRef.current[layerView.data.uuid];
		}
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

		let slide = getSlideStore().getNextSlide(getBase().slide);
		while (slide && findInSlide(slide)) slide = getSlideStore().getNextSlide(slide);
		slide = getSlideStore().getPrevSlide(getBase().slide);
		while (slide && findInSlide(slide)) slide = getSlideStore().getPrevSlide(slide);
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
		let slide = getSlideStore().getNextSlide(getBase().slide);
		while (slide) {
			collect(slide);
			slide = getSlideStore().getNextSlide(slide);
		}
		slide = getSlideStore().getPrevSlide(getBase().slide);
		while (slide) {
			collect(slide);
			slide = getSlideStore().getPrevSlide(slide);
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

	const handle = useMemo(() => {
		const dispatcher = {
			listeners,
			dispatchEvent,
			addEventListener,
			removeEventListener,
			clearEventListener,
			containEventListener,
			hasEventListener,
		} as EditableSlideViewHandle;
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
		dispatcher.trackSharedLayer = listSharedLayers;
		dispatcher.getSharedLayerRemovalTargets = (layer: Layer): readonly Layer[] | undefined => {
			if (!layer.shared) return undefined;
			return sharedLayersByUUIDRef.current[layer.uuid];
		};
		dispatcher.clearSharedLayerTracking = (layer: Layer): void => {
			delete sharedLayersByUUIDRef.current[layer.uuid];
		};
		return dispatcher;
	}, [
		addEventListener,
		clearEventListener,
		containEventListener,
		dispatchEvent,
		hasEventListener,
		listeners,
		removeEventListener,
	]);

	handleRef.current = handle;
	// 子 (`DOMSlideView` → `LayerHost`) の useLayoutEffect 内から `getBase()` 等で
	// 参照されるため、毎レンダで cleanup→再 attach されないよう deps `[]` を渡す。
	useImperativeHandle(ref, () => handle, []);

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
			onImageDropped?.(imageId);
		});
		const onWheel = (event: WheelEvent) => {
			if (!isActiveRef.current) return;
			const dScale = (0.1 * event.deltaY) / Math.abs(event.deltaY);
			handle.scale = handle.scale / (1 + dScale);
			if (adjustViewRef.current) adjustViewRef.current.base_scale = base.actualScale;
			event.preventDefault();
			event.stopPropagation();
		};
		// イベント委譲: 旧 setupLayerView でレイヤーごとに addEventListener していた
		// mousedown / mousemove / mouseup を、`base.element`（編集領域ルート）への
		// 単一リスナーで処理する。`event.target.closest(".layerWrapper")` で
		// 対象レイヤーを判定し、`base.layerViews` から `LayerView` ハンドルを引く。
		const findLayerViewFromEvent = (event: MouseEvent): LayerView | null => {
			if (!(event.target instanceof Element)) return null;
			const wrapper = event.target.closest<HTMLElement>(".layerWrapper");
			if (!wrapper) return null;
			return base.layerViews.find((layerView) => layerView.element === wrapper) ?? null;
		};
		const onMouseDown = (event: MouseEvent) => {
			if (!isActiveRef.current) return;
			if (event.target instanceof Element && event.target.closest(".controls")) return;
			const layerView = findLayerViewFromEvent(event);
			if (layerView && layerView.selected) {
				// 選択済みレイヤー上での mousedown は何もしない（旧実装で
				// stopImmediatePropagation により背景ハンドラを抑止していた挙動と等価）。
				return;
			}
			if (layerView && !layerView.data.locked) {
				pendingLayerMoveRef.current = layerView;
				return;
			}
			// 背景クリック、もしくはロック済みレイヤークリック → 選択解除
			selectLayerView(null);
		};
		const onMouseMove = (event: MouseEvent) => {
			const layerView = pendingLayerMoveRef.current;
			if (!layerView) return;
			pendingLayerMoveRef.current = null;
			layerView.selected = true;
			getAdjustView().startDrag(event);
		};
		const onMouseUp = () => {
			const layerView = pendingLayerMoveRef.current;
			pendingLayerMoveRef.current = null;
			if (!layerView) return;
			if (!layerView.selected && !getAdjustView().isDrag && !layerView.data.locked) {
				layerView.selected = true;
			}
		};
		const onResize = () => {
			setTimeout(() => updateSize(), 50);
		};
		base.element?.addEventListener("wheel", onWheel);
		base.element?.addEventListener("mousedown", onMouseDown);
		base.element?.addEventListener("mousemove", onMouseMove);
		base.element?.addEventListener("mouseup", onMouseUp);
		window.addEventListener("resize", onResize);
		if (base.element?.clientWidth === 0 && base.element?.clientHeight === 0) {
			requestAnimationFrame(() => updateSize());
		} else {
			updateSize();
		}
		return () => {
			base.element?.removeEventListener("wheel", onWheel);
			base.element?.removeEventListener("mousedown", onMouseDown);
			base.element?.removeEventListener("mousemove", onMouseMove);
			base.element?.removeEventListener("mouseup", onMouseUp);
			window.removeEventListener("resize", onResize);
			dropHelper.clearEventListener();
		};
	}, [handle, onImageDropped]);

	return (
		<DOMSlideViewForRender
			ref={baseRef}
			slide={slide}
			className="editable"
			handleOptions={handleOptions}>
			<AdjustView ref={adjustViewRef} />
			<div ref={borderRef} className="border" />
		</DOMSlideViewForRender>
	);
};
