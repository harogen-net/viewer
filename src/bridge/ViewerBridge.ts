/**
 * ViewerBridge – typed event bus for one-shot UI request prompts.
 *
 * Persistent state (mode, modified flag, history availability, slideshow
 * settings/playback, storage titles/selection/progress, image library) lives
 * in Zustand stores (see `state/uiStore.ts`). This bus now only carries
 * request-style events (dialogs, notices) that do not have a meaningful
 * "current value" and are scheduled for further reduction in later steps.
 *
 * Rules:
 *  - Viewer (jQuery side) calls ViewerBridge.emit(...)
 *  - React hooks call ViewerBridge.subscribe(...)
 *  - No DOM dependency; no React import needed here.
 */

export type ViewerBridgeEventMap = {
	/** Image deletion requested from the images panel */
	imageDeleteRequested: { imageId: string; name: string } | null;
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
	/** Runtime notice requested */
	noticeChanged: { id: number; message: string; variant: "error" | "info" } | null;
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
