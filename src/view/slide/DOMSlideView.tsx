import {
	useEffect,
	useImperativeHandle,
	useLayoutEffect,
	useRef,
	useState,
	type ReactNode,
	type Ref,
} from "react";
import { flushSync } from "react-dom";
import {
	useEventDispatcher,
	type EventDispatcher,
	type EventListenerMap,
} from "../../events/EventDispatcher";
import { PropertyEvent } from "../../events/PropertyEvent";
import { Layer } from "../../model/Layer";
import { PropFlags } from "../../model/PropFlags";
import { Slide } from "../../model/Slide";
import { pickLayerViewComponent } from "../../utils/LayerViewFactory";
import { LayerView, type LayerViewHandle } from "../LayerView";

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

/**
 * 個別レイヤーの host コンテナ FC。
 *
 * - `<div className="layerWrapper" style={{ zIndex }} ref={hostRef}>` を描画し、
 *   その中で適切なレイヤー FC (`pickLayerViewComponent(layer)`) を子としてレンダ。
 * - レイヤー FC は `hostRef` を受け取り、コミット段階で hostRef.current が attach
 *   された後に `useLayoutEffect` / 各種 getter から参照する。
 * - mount/unmount を `onMount` / `onUnmount` で parent に通知。
 *
 * host の DOM 自体・レイヤー FC のライフサイクル共に React が管理する
 * （ネスト React root や `flushSync` を内部で使わない）。
 */
type LayerHostProps = {
	layer: Layer;
	zIndex: number;
	onMount: (layer: Layer, handle: LayerViewHandle) => void;
	onUnmount: (layer: Layer, handle: LayerViewHandle) => void;
};

const LayerHost = ({ layer, zIndex, onMount, onUnmount }: LayerHostProps) => {
	const hostRef = useRef<HTMLDivElement | null>(null);
	const handleRef = useRef<LayerViewHandle | null>(null);
	const onMountRef = useRef(onMount);
	const onUnmountRef = useRef(onUnmount);
	onMountRef.current = onMount;
	onUnmountRef.current = onUnmount;

	useLayoutEffect(() => {
		const handle = handleRef.current;
		if (!handle) return;
		onMountRef.current(layer, handle);
		return () => {
			onUnmountRef.current(layer, handle);
			handle.destroy();
			handleRef.current = null;
		};
	}, [layer]);

	const Component = pickLayerViewComponent(layer);
	return (
		<div ref={hostRef} className="layerWrapper" style={{ zIndex }}>
			<Component ref={handleRef} layer={layer} hostRef={hostRef} />
		</div>
	);
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
	const optionsRef = useRef<DOMSlideViewHandleOptions | undefined>(handleOptions);
	optionsRef.current = handleOptions;

	// 内部 slide 状態（handle.slide setter / prop 両方から駆動。
	// 描画する slide.layers の元）
	const [internalSlide, setInternalSlide] = useState<Slide | null>(slide);
	// slide.UPDATE 時の再レンダ tick（layers 配列の in-place 変化を反映）
	const [, setTick] = useState(0);
	// マウント済 LayerView handle のマップ（Layer -> handle）
	const handleMapRef = useRef<Map<Layer, LayerViewHandle>>(new Map());
	// internalSlide の最新値を closure 内 getter で参照するための ref
	const internalSlideRef = useRef<Slide | null>(internalSlide);
	internalSlideRef.current = internalSlide;

	const getElement = () => elementRef.current;
	const getContainer = () => containerRef.current;

	const updateContainerSize = (target: Slide | null) => {
		const container = getContainer();
		if (!container || !target) return;
		container.style.width = `${target.width}px`;
		container.style.height = `${target.height}px`;
	};

	// LayerHost mount/unmount コールバック（ref で stable）
	const layerHostHandlersRef = useRef({
		onMount: (layer: Layer, handle: LayerViewHandle) => {
			handleMapRef.current.set(layer, handle);
			optionsRef.current?.onLayerViewAdded?.(handle, handleRef.current as DOMSlideViewHandle);
		},
		onUnmount: (layer: Layer, handle: LayerViewHandle) => {
			optionsRef.current?.onLayerViewRemoving?.(
				handle,
				handleRef.current as DOMSlideViewHandle
			);
			handleMapRef.current.delete(layer);
		},
	});

	if (!handleRef.current) {
		let selectedValue = false;
		let scaleBase = 1;
		let scaleValue = 1;
		const scaleMin = 0.2;
		const scaleMax = 5;

		const eventDispatcher: EventDispatcher = {
			listeners,
			dispatchEvent,
			addEventListener,
			removeEventListener,
			clearEventListener,
			containEventListener,
			hasEventListener,
		};
		const dispatcher = eventDispatcher as DOMSlideViewHandle;

		Object.defineProperties(dispatcher, {
			element: { get: () => getElement() },
			containerElement: { get: () => getContainer() },
			layerViews: {
				get: () => {
					const target = internalSlideRef.current;
					if (!target) return [];
					const map = handleMapRef.current;
					const result: LayerViewHandle[] = [];
					for (const layer of target.layers) {
						const handle = map.get(layer);
						if (handle) result.push(handle);
					}
					return result;
				},
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
				get: () => internalSlideRef.current,
				set: (value: Slide | null) => {
					flushSync(() => {
						setInternalSlide(value);
					});
				},
			},
			scale: {
				get: () => scaleValue,
				set: (value: number) => {
					const target = internalSlideRef.current;
					if (!target) return;
					scaleValue = clampScale(value, scaleMin, scaleMax);
					const actualScale = scaleValue * scaleBase;
					const element = getElement();
					const container = getContainer();
					if (!element || !container) return;
					const containerWidth = target.width * actualScale;
					const containerHeight = target.height * actualScale;
					const defX =
						-((target.width * (1 - actualScale)) / 2) +
						(element.clientWidth - containerWidth) / 2;
					const defY =
						-((target.height * (1 - actualScale)) / 2) +
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
			return handleMapRef.current.get(layer) ?? null;
		};

		dispatcher.destroy = () => {
			dispatcher.clearEventListener();
			// React unmount により LayerHost 群がアンマウントされ、handleMap も空になる。
			// 内部 slide を null にして layers 描画を抑止する。
			flushSync(() => {
				setInternalSlide(null);
			});
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
		dispatcher.animateOpacity = (opacity: number, _duration: number) => {
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

		handleRef.current = dispatcher;
	}

	useImperativeHandle(ref, () => handleRef.current as DOMSlideViewHandle);

	// prop の slide が変化したら内部 slide を同期（初期マウント以降の外部からの差し替え）
	useEffect(() => {
		setInternalSlide(slide);
	}, [slide]);

	// internalSlide 変化時：コンテナサイズ更新 + slide.UPDATE 購読
	useEffect(() => {
		updateContainerSize(internalSlide);
		if (!internalSlide) return;
		const onUpdate = (event: PropertyEvent) => {
			const shortCircuit = optionsRef.current?.onSlideUpdate?.(
				event,
				handleRef.current as DOMSlideViewHandle
			);
			if (shortCircuit) return;
			const flag = event.propFlags;
			// レイヤー構成変化は同期再レンダで反映（呼び出し直後の getViewByLayer 互換性のため）
			if (
				flag &
				(PropFlags.S_LAYER_ADD | PropFlags.S_LAYER_REMOVE | PropFlags.S_LAYER_ORDER)
			) {
				flushSync(() => {
					setTick((t) => t + 1);
				});
			}
		};
		internalSlide.addEventListener(PropertyEvent.UPDATE, onUpdate);
		return () => {
			internalSlide.removeEventListener(PropertyEvent.UPDATE, onUpdate);
		};
	}, [internalSlide]);

	const slideClassName = ["slide", className].filter(Boolean).join(" ");
	const layers = internalSlide?.layers ?? [];
	const layerHostHandlers = layerHostHandlersRef.current;

	return (
		<div ref={elementRef} className={slideClassName}>
			<div ref={containerRef} className="container">
				{layers.map((layer, index) => (
					<LayerHost
						key={layer.id}
						layer={layer}
						zIndex={index}
						onMount={layerHostHandlers.onMount}
						onUnmount={layerHostHandlers.onUnmount}
					/>
				))}
				{children}
			</div>
		</div>
	);
};
