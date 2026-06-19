import { useEffect, useImperativeHandle, useRef, useState, type ReactNode } from "react";
import {
    useEventDispatcher,
    type EventDispatcher,
    type EventListenerMap,
} from "../events/EventDispatcher";
import { PropertyEvent } from "../events/PropertyEvent";
import { PropFlags } from "../model/PropFlags";
import { Slide } from "../model/Slide";

export type SlideViewHandle = EventDispatcher & {
	readonly element: HTMLDivElement | null;
	readonly selected: boolean;
	setSelected: (value: boolean) => void;
	readonly slide: Slide | null;
	setSlide: (value: Slide | null) => void;
	destroy: () => void;
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

export const SlideView = ({
	ref,
	slide: initialSlide,
	selected: initialSelected = false,
	children,
	className = "",
	onSlideUpdate,
}: SlideViewProps) => {
	const elementRef = useRef<HTMLDivElement | null>(null);
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
	const slideRef = useRef<Slide | null>(null);
	const onSlideUpdateRef = useRef(onSlideUpdate);
	const [selected, setSelectedState] = useState(initialSelected);
	const [renderedSlide, setRenderedSlide] = useState<Slide | null>(initialSlide);
	const selectedRef = useRef(initialSelected);
	const handleRef = useRef<SlideViewHandle | null>(null);

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
			return listeners;
		},
		dispatchEvent,
		addEventListener,
		removeEventListener,
		clearEventListener,
		containEventListener,
		hasEventListener,
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
	};

	useImperativeHandle(ref, () => handleRef.current as SlideViewHandle, []);

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
