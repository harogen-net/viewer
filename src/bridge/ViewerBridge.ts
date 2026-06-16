/**
 * ViewerBridge – typed event bus between legacy jQuery/Viewer and React components.
 *
 * Rules:
 *  - Viewer (jQuery side) calls ViewerBridge.emit(...)
 *  - React hooks call ViewerBridge.subscribe(...)
 *  - No DOM dependency; no React import needed here.
 */

import { SlideTitle } from "../storage/storageTypes";

export type ViewerBridgeEventMap = {
	/** Image deletion requested from the images panel */
	imageDeleteRequested: { imageId: string; name: string } | null;
	/** Registered image library changed */
	imageLibraryChanged: {
		images: readonly {
			id: string;
			name: string;
			width: number;
			height: number;
			src: string;
		}[];
	};
	/** Shared layer removal requested from an edit command */
	sharedLayerRemovalRequested: { layerName: string } | null;
	/** Spread selected layer requested from an edit command */
	spreadLayerRequested: { layerName: string } | null;
	/** Text layer input requested from an edit command */
	textLayerInputRequested: { open: boolean } | null;
	/** New document confirmation requested from a command */
	newDocumentRequested: { open: boolean } | null;
	/** Import confirmation requested from a command */
	importDialogRequested: { open: boolean } | null;
	/** Import file picker requested from a command */
	importFileDialogRequested: { open: boolean } | null;
	/** Save destination choice requested from a command */
	saveChoiceRequested: { open: boolean } | null;
	/** Storage loading progress changed */
	storageProgressChanged: { percentage: number };
	/** Runtime notice requested */
	noticeChanged: { id: number; message: string; variant: "error" | "info" } | null;
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
	/** Slideshow playback state changed */
	slideshowPlaybackChanged: { isRun: boolean; isPause: boolean };
	/** Document modified status changed */
	modifiedChanged: { modified: boolean };
	/** Viewer mode changed */
	modeChanged: { mode: "select" | "edit" | "slideshow" };
	/** Undo/Redo availability changed */
	historyChanged: { canUndo: boolean; canRedo: boolean };
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

	hasListeners<K extends ViewerBridgeEventType>(type: K): boolean {
		return Boolean(this.listeners.get(type as string)?.size);
	}
}

export const ViewerBridge = new ViewerBridgeClass();
