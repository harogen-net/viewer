/**
 * ViewerBridge – typed event bus between legacy jQuery/Viewer and React components.
 *
 * Rules:
 *  - Viewer (jQuery side) calls ViewerBridge.emit(...)
 *  - React hooks call ViewerBridge.subscribe(...)
 *  - No DOM dependency; no React import needed here.
 */

import { Slide } from "../model/Slide";
import { SlideTitle } from "../storage/storageTypes";

export type ViewerBridgeEventMap = {
	/** Slide list changed (added / removed / reordered) */
	slidesChanged: { slides: readonly Slide[]; selectedIndex: number };
	/** Selected slide index changed */
	selectionChanged: { selectedIndex: number };
	/** Saved file titles in storage changed */
	savedFilesChanged: { titles: readonly SlideTitle[] };
	/** Selected saved file changed */
	savedFileSelectionChanged: { selectedId: string | null };
	/** Slideshow-related settings changed */
	slideshowSettingsChanged: {
		duration: number;
		interval: number;
		bgColor: string;
		fullscreen: boolean;
		mirrorH: boolean;
		mirrorV: boolean;
	};
	/** Document modified status changed */
	modifiedChanged: { modified: boolean };
	/** Viewer mode changed */
	modeChanged: { mode: "select" | "edit" | "slideshow" };
	/** Undo/Redo availability changed */
	historyChanged: { canUndo: boolean; canRedo: boolean };
	/** Edit layer selection state changed */
	editSelectionChanged: { hasSelection: boolean };
	/** Selected edit layer properties changed */
	editLayerStateChanged: {
		hasSelection: boolean;
		x: number | null;
		y: number | null;
		scale: number | null;
		rotation: number | null;
		opacity: number | null;
		layerType: string | null;
		mirrorH: boolean | null;
		mirrorV: boolean | null;
		clipTop: number | null;
		clipRight: number | null;
		clipBottom: number | null;
		clipLeft: number | null;
	};
};

export type ViewerBridgeEventType = keyof ViewerBridgeEventMap;

type Listener<K extends ViewerBridgeEventType> = (payload: ViewerBridgeEventMap[K]) => void;

class ViewerBridgeClass {
	private listeners = new Map<string, Set<Listener<never>>>();

	subscribe<K extends ViewerBridgeEventType>(type: K, listener: Listener<K>): () => void {
		const key = type as string;
		if (!this.listeners.has(key)) {
			this.listeners.set(key, new Set());
		}
		const set = this.listeners.get(key)!;
		set.add(listener as Listener<never>);
		return () => set.delete(listener as Listener<never>);
	}

	emit<K extends ViewerBridgeEventType>(type: K, payload: ViewerBridgeEventMap[K]): void {
		const set = this.listeners.get(type as string);
		if (!set) return;
		for (const fn of set) {
			fn(payload as never);
		}
	}
}

export const ViewerBridge = new ViewerBridgeClass();
