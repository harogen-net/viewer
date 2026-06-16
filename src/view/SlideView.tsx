import { useEffect, useImperativeHandle, useRef, useState, type ReactNode } from "react";
import { PropertyEvent } from "../events/PropertyEvent";
import { PropFlags } from "../model/PropFlags";
import { Slide } from "../model/Slide";

type ListenerEntry = {
	type: string;
	handler: Function;
	priolity: number;
};

export type SlideViewHandle = {
	readonly listeners: Record<string, ListenerEntry[]>;
	readonly element: HTMLDivElement | null;
	readonly selected: boolean;
	setSelected: (value: boolean) => void;
	readonly slide: Slide | null;
	setSlide: (value: Slide | null) => void;
	destroy: () => void;
	dispatchEvent: (event: Event) => void;
	addEventListener: (type: string, callback: Function, priolity?: number) => void;
	removeEventListener: (type: string, callback: Function) => void;
	clearEventListener: () => void;
	containEventListener: (type: string) => boolean;
	hasEventListener: (type: string, callback: Function) => boolean;
};

export type SlideView = SlideViewHandle;

type SlideViewProps = {
	ref?: React.Ref<SlideViewHandle>;
	slide: Slide | null;
	selected?: boolean;
	children?: ReactNode;
	className?: string;
	onSlideUpdate?: (event: PropertyEvent) => void;
};

const sortListeners = (listeners: ListenerEntry[]) => {
	listeners.sort((listener1, listener2) => listener2.priolity - listener1.priolity);
};

export const SlideView = ({
	ref,
	slide: initialSlide,
	selected: initialSelected = false,
	children,
	className = "",
	onSlideUpdate,
}: SlideViewProps) => {
	const elementRef = useRef<HTMLDivElement | null>(null);
	const listenersRef = useRef<Record<string, ListenerEntry[]>>({});
	const slideRef = useRef<Slide | null>(null);
	const onSlideUpdateRef = useRef(onSlideUpdate);
	const [selected, setSelectedState] = useState(initialSelected);
	const [renderedSlide, setRenderedSlide] = useState<Slide | null>(initialSlide);
	const selectedRef = useRef(initialSelected);
	const handleRef = useRef<SlideViewHandle | null>(null);

	const dispatchEvent = (event: Event): void => {
		const entries = listenersRef.current[event.type];
		if (!entries) return;

		entries.slice().forEach((listener) => {
			try {
				listener.handler(event);
			} catch (error) {
				if (window.console) {
					console.error((error as Error).stack);
				}
			}
		});
	};

	const addEventListener = (type: string, callback: Function, priolity = 0): void => {
		if (listenersRef.current[type] == null) {
			listenersRef.current[type] = [];
		}
		listenersRef.current[type].push({ type, handler: callback, priolity });
		sortListeners(listenersRef.current[type]);
	};

	const hasEventListener = (type: string, callback: Function): boolean => {
		const entries = listenersRef.current[type];
		if (!entries) return false;
		return entries.some((listener) => listener.type === type && listener.handler === callback);
	};

	const removeEventListener = (type: string, callback: Function): void => {
		const entries = listenersRef.current[type];
		if (!entries) return;
		listenersRef.current[type] = entries.filter(
			(listener) => !(listener.type === type && listener.handler === callback)
		);
	};

	const clearEventListener = (): void => {
		listenersRef.current = {};
	};

	const containEventListener = (type: string): boolean => {
		return Boolean(listenersRef.current[type]?.length);
	};

	const setSelected = (value: boolean): void => {
		if (value === selectedRef.current) return;
		selectedRef.current = value;
		setSelectedState(value);
		dispatchEvent(new PropertyEvent(PropertyEvent.UPDATE, handleRef.current, PropFlags.SV_SELECT));
	};

	const setSlide = (value: Slide | null): void => {
		if (slideRef.current === value) return;
		slideRef.current?.removeEventListener(PropertyEvent.UPDATE, onSlideUpdateLambda);
		slideRef.current = value;
		setRenderedSlide(value);
		slideRef.current?.addEventListener(PropertyEvent.UPDATE, onSlideUpdateLambda);
	};

	function onSlideUpdateLambda(event: PropertyEvent): void {
		onSlideUpdateRef.current?.(event);
	}

	const destroy = (): void => {
		slideRef.current?.removeEventListener(PropertyEvent.UPDATE, onSlideUpdateLambda);
		slideRef.current = null;
		setRenderedSlide(null);
		clearEventListener();
	};

	handleRef.current = {
		get listeners() {
			return listenersRef.current;
		},
		get element() {
			return elementRef.current;
		},
		get selected() {
			return selectedRef.current;
		},
		setSelected,
		get slide() {
			return slideRef.current;
		},
		setSlide,
		destroy,
		dispatchEvent,
		addEventListener,
		removeEventListener,
		clearEventListener,
		containEventListener,
		hasEventListener,
	};

	useImperativeHandle(ref, () => handleRef.current as SlideViewHandle);

	useEffect(() => {
		onSlideUpdateRef.current = onSlideUpdate;
	}, [onSlideUpdate]);

	useEffect(() => {
		setSlide(initialSlide);
		return () => {
			slideRef.current?.removeEventListener(PropertyEvent.UPDATE, onSlideUpdateLambda);
		};
	}, [initialSlide]);

	useEffect(() => {
		setSelected(initialSelected);
	}, [initialSelected]);

	const slideClassName = ["slide", selected ? "selected" : "", className].filter(Boolean).join(" ");

	return (
		<div ref={elementRef} className={slideClassName} data-slide-id={renderedSlide?.id}>
			{children}
		</div>
	);
};
