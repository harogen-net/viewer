import {
	useEffect,
	useImperativeHandle,
	useLayoutEffect,
	useRef,
	useState,
	type Ref,
	type RefObject,
} from "react";
import {
	useEventDispatcher,
	type EventDispatcher,
	type EventListenerMap,
} from "../events/EventDispatcher";
import { PropertyEvent } from "../events/PropertyEvent";
import { Layer, LayerType } from "../model/Layer";
import { PropFlags } from "../model/PropFlags";

export type LayerViewHandle = EventDispatcher & {
	readonly data: Layer;
	readonly element: HTMLElement;
	readonly type: LayerType;
	readonly id: number;
	readonly width: number;
	readonly height: number;
	selected: boolean;
	destroy: () => void;
};

// 後方互換：以前は class 名、現在はハンドル型のエイリアス。
export type LayerView = LayerViewHandle;

export type LayerHostRef = RefObject<HTMLElement | null>;

export type LayerViewProps = {
	layer: Layer;
	hostRef: LayerHostRef;
	ref?: Ref<LayerViewHandle>;
};

export type UseLayerViewOptions = {
	getWidth?: (host: HTMLElement | null) => number;
	getHeight?: (host: HTMLElement | null) => number;
};

const applyWrapperStyles = (host: HTMLElement | null, layer: Layer): void => {
	if (!host) return;
	host.classList.toggle("invisible", !layer.visible);
	host.classList.toggle("locked", layer.locked);
	host.style.transform = "matrix(" + layer.matrix.join(",") + ")";
};

/**
 * レイヤー FC 共通フック。
 *
 * - レイヤーモデルの `PropertyEvent.UPDATE` を購読し、変化時に呼び出し側 FC を再レンダ。
 * - host 要素の `invisible` / `locked` / `transform` を毎レンダ後に同期。
 * - `LayerViewHandle` を `useImperativeHandle` で公開（外部互換 API）。
 * - width/height の算出は呼び出し側 FC が options 経由で差し替え可能。
 *
 * host は `RefObject` 経由で受け取る。React のコミット段階で ref が attach される
 * ため、フック内のゲッタ／effect は `hostRef.current` を遅延参照する。
 */
export const useLayerView = (
	layer: Layer,
	hostRef: LayerHostRef,
	ref: Ref<LayerViewHandle> | undefined,
	options: UseLayerViewOptions = {}
): void => {
	const [, setTick] = useState(0);
	const selectedRef = useRef(false);
	const listenersRef = useRef<EventListenerMap>({});
	const dispatcher = useEventDispatcher(listenersRef);
	const handleRef = useRef<LayerViewHandle | null>(null);
	const getWidth = options.getWidth ?? ((host: HTMLElement | null) => host?.offsetWidth ?? 0);
	const getHeight = options.getHeight ?? ((host: HTMLElement | null) => host?.offsetHeight ?? 0);

	if (!handleRef.current) {
		const handle: LayerViewHandle = {
			get listeners() {
				return dispatcher.listeners;
			},
			dispatchEvent: dispatcher.dispatchEvent,
			addEventListener: dispatcher.addEventListener,
			removeEventListener: dispatcher.removeEventListener,
			clearEventListener: dispatcher.clearEventListener,
			containEventListener: dispatcher.containEventListener,
			hasEventListener: dispatcher.hasEventListener,
			get data() {
				return layer;
			},
			get element() {
				return hostRef.current as HTMLElement;
			},
			get type() {
				return layer.type;
			},
			get id() {
				return layer.id;
			},
			get width() {
				return getWidth(hostRef.current);
			},
			get height() {
				return getHeight(hostRef.current);
			},
			get selected() {
				return selectedRef.current;
			},
			set selected(value: boolean) {
				if (selectedRef.current === value) return;
				selectedRef.current = value;
				dispatcher.dispatchEvent(
					new PropertyEvent(PropertyEvent.UPDATE, handle, PropFlags.LV_SELECT)
				);
			},
			destroy: () => {
				dispatcher.clearEventListener();
			},
		};
		handleRef.current = handle;
	}

	useImperativeHandle(ref, () => handleRef.current!);

	useEffect(() => {
		const onUpdate = (_e: PropertyEvent) => setTick((t) => t + 1);
		layer.addEventListener(PropertyEvent.UPDATE, onUpdate);
		return () => {
			layer.removeEventListener(PropertyEvent.UPDATE, onUpdate);
		};
	}, [layer]);

	// host への wrapper クラス／transform 同期は、ref attach 済みのコミット段階で
	// 実行する必要があるため useLayoutEffect を使用。
	useLayoutEffect(() => {
		applyWrapperStyles(hostRef.current, layer);
	});
};

export const LayerViewComponent = ({ layer, hostRef, ref }: LayerViewProps) => {
	useLayerView(layer, hostRef, ref);
	return null;
};
