import { useEffect, useImperativeHandle, useRef, type ReactNode, type Ref } from "react";
import {
	useEventDispatcher,
	type EventDispatcher,
	type EventListenerMap,
} from "../../events/EventDispatcher";
import { PropertyEvent } from "../../events/PropertyEvent";
import { Layer } from "../../model/Layer";
import { PropFlags } from "../../model/PropFlags";
import { Slide } from "../../model/Slide";
import { LayerViewFactory } from "../../utils/LayerViewFactory";
import { LayerView } from "../LayerView";

export type DOMSlideViewHandle = EventDispatcher & {
	readonly element: HTMLDivElement | null;
	readonly containerElement: HTMLDivElement | null;
	readonly layerViews: LayerView[];
	readonly width: number;
	readonly height: number;
	selected: boolean;
	slide: Slide;
	scale: number;
	readonly actualScale: number;
	setScaleBase: (value: number) => void;
	destroy: () => void;
	getViewByLayer: (layer: Layer) => LayerView | null;
	addLayerView: (layer: Layer) => LayerView;
	removeLayerView: (layer: Layer) => LayerView;
	updateViewsOrder: () => void;
	show: () => void;
	hide: () => void;
	stopAnimation: () => void;
	setOpacity: (opacity: number) => void;
	setZIndex: (zIndex: number) => void;
	animateOpacity: (opacity: number, duration: number) => void;
	setLayerWrapperTransition: (transition: string) => void;
	setImageTransition: (transition: string) => void;
	setDisplayTransform: (transform: string, width: number, height: number) => void;
};

export type DOMSlideViewProps = {
	ref?: Ref<DOMSlideViewHandle>;
	slide: Slide;
	className?: string;
	children?: ReactNode;
	handleOptions?: DOMSlideViewHandleOptions;
};

export type DOMSlideViewHandleOptions = {
	onSlideUpdate?: (event: PropertyEvent, handle: DOMSlideViewHandle) => boolean | void;
	onLayerViewAdded?: (layerView: LayerView, handle: DOMSlideViewHandle) => void;
	onLayerViewRemoving?: (layerView: LayerView, handle: DOMSlideViewHandle) => void;
};

const clampScale = (value: number, min: number, max: number) => {
	return value > min ? (value < max ? value : max) : min;
};

export const createDOMSlideViewHandle = (
	elementRef: React.RefObject<HTMLDivElement | null>,
	containerRef: React.RefObject<HTMLDivElement | null>,
	eventDispatcher: EventDispatcher,
	options: DOMSlideViewHandleOptions = {}
): DOMSlideViewHandle => {
	let slideValue: Slide | null = null;
	let selectedValue = false;
	let scaleBase = 1;
	let scaleValue = 1;
	const scaleMin = 0.2;
	const scaleMax = 5;
	const layerViews: LayerView[] = [];
	const dispatcher = eventDispatcher as DOMSlideViewHandle;

	const getElement = () => elementRef.current;
	const getContainer = () => containerRef.current;

	const updateContainerSize = () => {
		const container = getContainer();
		if (!container || !slideValue) return;
		container.style.width = `${slideValue.width}px`;
		container.style.height = `${slideValue.height}px`;
	};

	const removeAllLayerViews = () => {
		while (layerViews.length > 0) {
			layerViews.pop()?.destroy();
		}
	};

	const onSlideUpdateLambda = (event: PropertyEvent) => {
		if (options.onSlideUpdate?.(event, dispatcher)) return;
		const flag = event.propFlags;
		if (flag & PropFlags.S_LAYER_ADD) {
			dispatcher.addLayerView(event.options.layer);
		}
		if (flag & PropFlags.S_LAYER_REMOVE) {
			dispatcher.removeLayerView(event.options.layer).destroy();
		}
		if (flag & PropFlags.S_LAYER_ORDER) {
			dispatcher.updateViewsOrder();
		}
	};

	const replaceSlide = (newSlide: Slide | null) => {
		removeAllLayerViews();
		slideValue?.removeEventListener(PropertyEvent.UPDATE, onSlideUpdateLambda);
		slideValue = newSlide;
		updateContainerSize();
		slideValue?.addEventListener(PropertyEvent.UPDATE, onSlideUpdateLambda);
		slideValue?.layers.forEach((layer) => dispatcher.addLayerView(layer));
	};

	Object.defineProperties(dispatcher, {
		element: {
			get: () => getElement(),
		},
		containerElement: {
			get: () => getContainer(),
		},
		layerViews: {
			get: () => layerViews,
		},
		width: {
			get: () => (getElement()?.clientWidth ?? 0) * scaleValue * scaleBase,
		},
		height: {
			get: () => (getElement()?.clientHeight ?? 0) * scaleValue * scaleBase,
		},
		selected: {
			get: () => selectedValue,
			set: (value: boolean) => {
				if (value === selectedValue) return;
				selectedValue = value;
				getElement()?.classList.toggle("selected", selectedValue);
				dispatcher.dispatchEvent(
					new PropertyEvent(PropertyEvent.UPDATE, dispatcher, PropFlags.SV_SELECT)
				);
			},
		},
		slide: {
			get: () => slideValue,
			set: (value: Slide | null) => replaceSlide(value),
		},
		scale: {
			get: () => scaleValue,
			set: (value: number) => {
				if (!slideValue) return;
				scaleValue = clampScale(value, scaleMin, scaleMax);
				const actualScale = scaleValue * scaleBase;
				const element = getElement();
				const container = getContainer();
				if (!element || !container) return;
				const containerWidth = slideValue.width * actualScale;
				const containerHeight = slideValue.height * actualScale;
				const defX =
					-((slideValue.width * (1 - actualScale)) / 2) +
					(element.clientWidth - containerWidth) / 2;
				const defY =
					-((slideValue.height * (1 - actualScale)) / 2) +
					(element.clientHeight - containerHeight) / 2;
				container.style.transform = `matrix(${actualScale},0,0,${actualScale},${defX},${defY})`;
				dispatcher.dispatchEvent(
					new PropertyEvent(PropertyEvent.UPDATE, dispatcher, PropFlags.DSV_SCALE)
				);
			},
		},
		actualScale: {
			get: () => scaleValue * scaleBase,
		},
	});

	dispatcher.setScaleBase = (value: number) => {
		scaleBase = Number.isFinite(value) && value > 0 ? value : 1;
		dispatcher.scale = scaleValue;
	};

	dispatcher.getViewByLayer = (layer: Layer): LayerView | null => {
		return layerViews.find((layerView) => layerView.data === layer) ?? null;
	};

	dispatcher.addLayerView = (layer: Layer): LayerView => {
		const container = getContainer();
		if (!container) throw new Error("DOMSlideView container is not mounted.");
		const layerView = LayerViewFactory.ViewFromLayer(layer);
		layerViews.push(layerView);
		container.appendChild(layerView.element);
		dispatcher.updateViewsOrder();
		options.onLayerViewAdded?.(layerView, dispatcher);
		return layerView;
	};

	dispatcher.removeLayerView = (layer: Layer): LayerView => {
		const layerView = dispatcher.getViewByLayer(layer);
		if (!layerView) return null;
		options.onLayerViewRemoving?.(layerView, dispatcher);
		layerViews.splice(layerViews.indexOf(layerView), 1);
		dispatcher.updateViewsOrder();
		return layerView;
	};

	dispatcher.updateViewsOrder = () => {
		if (!slideValue) return;
		layerViews.sort((a: LayerView, b: LayerView) => {
			return slideValue.layers.indexOf(a.data) < slideValue.layers.indexOf(b.data) ? -1 : 1;
		});
		layerViews.forEach((layerView, index) => {
			layerView.element.style.zIndex = String(index);
		});
	};

	dispatcher.destroy = () => {
		dispatcher.clearEventListener();
		slideValue?.removeEventListener(PropertyEvent.UPDATE, onSlideUpdateLambda);
		removeAllLayerViews();
		slideValue = null;
	};

	dispatcher.show = () => {
		const element = getElement();
		if (element) element.style.display = "";
	};

	dispatcher.hide = () => {
		const element = getElement();
		if (element) element.style.display = "none";
	};

	dispatcher.stopAnimation = () => {
		getElement()
			?.getAnimations()
			.forEach((animation) => animation.cancel());
	};

	dispatcher.setOpacity = (opacity: number) => {
		const element = getElement();
		if (element) element.style.opacity = String(opacity);
	};

	dispatcher.setZIndex = (zIndex: number) => {
		const element = getElement();
		if (element) element.style.zIndex = String(zIndex);
	};

	dispatcher.animateOpacity = (opacity: number, duration: number) => {
		const element = getElement();
		if (!element) return;
		dispatcher.stopAnimation();
		element.style.opacity = String(opacity);
	};

	dispatcher.setLayerWrapperTransition = (transition: string) => {
		getElement()
			?.querySelectorAll<HTMLElement>(".layerWrapper")
			.forEach((element) => {
				element.style.transition = transition;
			});
	};

	dispatcher.setImageTransition = (transition: string) => {
		getElement()
			?.querySelectorAll<HTMLElement>("img")
			.forEach((element) => {
				element.style.transition = transition;
			});
	};

	dispatcher.setDisplayTransform = (transform: string, width: number, height: number) => {
		const element = getElement();
		if (!element) return;
		element.style.transform = transform;
		element.style.width = `${width}px`;
		element.style.height = `${height}px`;
	};

	return dispatcher;
};

export const DOMSlideView = ({
	ref,
	slide,
	className = "",
	children,
	handleOptions,
}: DOMSlideViewProps) => {
	const elementRef = useRef<HTMLDivElement | null>(null);
	const containerRef = useRef<HTMLDivElement | null>(null);
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
	const handleRef = useRef<DOMSlideViewHandle | null>(null);

	if (!handleRef.current) {
		handleRef.current = createDOMSlideViewHandle(
			elementRef,
			containerRef,
			{
				listeners,
				dispatchEvent,
				addEventListener,
				removeEventListener,
				clearEventListener,
				containEventListener,
				hasEventListener,
			},
			handleOptions
		);
	}

	useImperativeHandle(ref, () => handleRef.current as DOMSlideViewHandle);

	useEffect(() => {
		const handle = handleRef.current;
		if (!handle) return;
		handle.slide = slide;
		return () => {
			handle.destroy();
		};
	}, [slide]);

	const slideClassName = ["slide", className].filter(Boolean).join(" ");

	return (
		<div ref={elementRef} className={slideClassName}>
			<div ref={containerRef} className="container">
				{children}
			</div>
		</div>
	);
};
