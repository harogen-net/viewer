import { useRef } from "react";

export type EventListenerEntry = {
	type: string;
	handler: Function;
	priolity: number;
};

export type EventListenerMap = Record<string, EventListenerEntry[]>;

export type EventDispatcherListenersRef = {
	current: EventListenerMap;
};

export interface EventDispatcher {
	listeners: EventListenerMap;
	dispatchEvent: (event: Event) => void;
	addEventListener: (type: string, callback: Function, priolity?: number) => void;
	removeEventListener: (type: string, callback: Function) => void;
	clearEventListener: () => void;
	containEventListener: (type: string) => boolean;
	hasEventListener: (type: string, callback: Function) => boolean;
}

const sortListeners = (listeners: EventListenerEntry[]) => {
	listeners.sort((listener1, listener2) => listener2.priolity - listener1.priolity);
};

export const createEventDispatcher = (
	listenersRef: EventDispatcherListenersRef = { current: {} }
): EventDispatcher => {
	const dispatcher: EventDispatcher = {
		get listeners() {
			return listenersRef.current;
		},
		set listeners(value: EventListenerMap) {
			listenersRef.current = value;
		},
		dispatchEvent: (event: Event): void => {
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
		},
		addEventListener: (type: string, callback: Function, priolity: number = 0): void => {
			if (listenersRef.current[type] == null) {
				listenersRef.current[type] = [];
			}
			listenersRef.current[type].push({ type, handler: callback, priolity });
			sortListeners(listenersRef.current[type]);
		},
		removeEventListener: (type: string, callback: Function): void => {
			if (!dispatcher.hasEventListener(type, callback)) return;
			listenersRef.current[type] = listenersRef.current[type].filter(
				(listener) => !(listener.type === type && listener.handler === callback)
			);
		},
		clearEventListener: (): void => {
			Object.keys(listenersRef.current).forEach((type) => {
				delete listenersRef.current[type];
			});
		},
		containEventListener: (type: string): boolean => {
			return Boolean(listenersRef.current[type]?.length);
		},
		hasEventListener: (type: string, callback: Function): boolean => {
			const entries = listenersRef.current[type];
			if (!entries) return false;
			return entries.some((listener) => listener.type === type && listener.handler === callback);
		},
	};

	return dispatcher;
};

export const attachEventDispatcher = <T extends object>(target: T): T & EventDispatcher => {
	const dispatcher = createEventDispatcher();
	Object.defineProperties(target, {
		listeners: {
			get: () => dispatcher.listeners,
			set: (value: EventListenerMap) => {
				dispatcher.listeners = value;
			},
			configurable: true,
		},
		dispatchEvent: { value: dispatcher.dispatchEvent, configurable: true },
		addEventListener: { value: dispatcher.addEventListener, configurable: true },
		removeEventListener: { value: dispatcher.removeEventListener, configurable: true },
		clearEventListener: { value: dispatcher.clearEventListener, configurable: true },
		containEventListener: { value: dispatcher.containEventListener, configurable: true },
		hasEventListener: { value: dispatcher.hasEventListener, configurable: true },
	});
	return target as T & EventDispatcher;
};

export const useEventDispatcher = (listenersRef: EventDispatcherListenersRef): EventDispatcher => {
	const dispatcherRef = useRef<EventDispatcher | null>(null);
	if (!dispatcherRef.current) {
		dispatcherRef.current = createEventDispatcher(listenersRef);
	}
	return dispatcherRef.current;
};
