/**
 * React hooks for consuming ViewerBridge events.
 *
 * Usage:
 *   const { slides, selectedIndex } = useViewerSlides();
 *   const { titles } = useViewerStorage();
 *   const { modified } = useViewerModified();
 *   const { mode } = useViewerMode();
 */

import { useEffect, useState } from "react";
import { Slide } from "../model/Slide";
import { SlideTitle } from "../storage/storageTypes";
import { ViewerBridge, ViewerBridgeEventMap } from "./ViewerBridge";

// ─── Generic helper ──────────────────────────────────────────────────────────

function useBridgeEvent<K extends keyof ViewerBridgeEventMap>(
	type: K,
	initialValue: ViewerBridgeEventMap[K]
): ViewerBridgeEventMap[K] {
	const [value, setValue] = useState<ViewerBridgeEventMap[K]>(initialValue);

	useEffect(() => {
		return ViewerBridge.subscribe(type, (payload) => {
			setValue(payload);
		});
	}, [type]);

	return value;
}

// ─── Slide list ───────────────────────────────────────────────────────────────

type SlidesState = {
	slides: readonly Slide[];
	selectedIndex: number;
	revision: number;
};

export function useViewerSlides(): SlidesState {
	const [value, setValue] = useState<SlidesState>({ slides: [], selectedIndex: -1, revision: 0 });

	useEffect(() => {
		return ViewerBridge.subscribe("slidesChanged", (payload) => {
			setValue((current) => ({
				slides: payload.slides,
				selectedIndex: payload.selectedIndex,
				revision: current.revision + 1,
			}));
		});
	}, []);

	return value;
}

export function useViewerImageDeleteRequest(): { imageId: string; name: string } | null {
	return useBridgeEvent("imageDeleteRequested", null);
}

export function useViewerImages(): {
	images: readonly { id: string; name: string; width: number; height: number; src: string }[];
} {
	return useBridgeEvent("imageLibraryChanged", { images: [] });
}

export function useViewerSharedLayerRemovalRequest(): { layerName: string } | null {
	return useBridgeEvent("sharedLayerRemovalRequested", null);
}

export function useViewerSpreadLayerRequest(): { layerName: string } | null {
	return useBridgeEvent("spreadLayerRequested", null);
}

export function useViewerTextLayerInputRequest(): { open: boolean } | null {
	return useBridgeEvent("textLayerInputRequested", null);
}

export function useViewerNewDocumentRequest(): { open: boolean } | null {
	return useBridgeEvent("newDocumentRequested", null);
}

export function useViewerImportDialogRequest(): { open: boolean } | null {
	return useBridgeEvent("importDialogRequested", null);
}

export function useViewerImportFileDialogRequest(): { open: boolean } | null {
	return useBridgeEvent("importFileDialogRequested", null);
}

export function useViewerSaveChoiceRequest(): { open: boolean } | null {
	return useBridgeEvent("saveChoiceRequested", null);
}

export function useViewerStorageProgress(): { percentage: number } {
	return useBridgeEvent("storageProgressChanged", { percentage: 0 });
}

export function useViewerNotice(): { id: number; message: string; variant: "error" | "info" } | null {
	return useBridgeEvent("noticeChanged", null);
}

// ─── Storage ──────────────────────────────────────────────────────────────────

type StorageState = {
	titles: readonly SlideTitle[];
};

export function useViewerStorage(): StorageState {
	return useBridgeEvent("savedFilesChanged", { titles: [] });
}

export function useViewerSavedFileSelection(): { selectedId: string | null } {
	return useBridgeEvent("savedFileSelectionChanged", { selectedId: null });
}

export function useViewerSlideshowSettings(): {
	duration: number;
	interval: number;
	bgColor: string;
	fullscreen: boolean;
	mirrorH: boolean;
	mirrorV: boolean;
} {
	return useBridgeEvent("slideshowSettingsChanged", {
		duration: 2000,
		interval: 6000,
		bgColor: "#999999",
		fullscreen: false,
		mirrorH: false,
		mirrorV: false,
	});
}

export function useViewerSlideshowPlayback(): { isRun: boolean; isPause: boolean } {
	return useBridgeEvent("slideshowPlaybackChanged", { isRun: false, isPause: false });
}

// ─── Modified flag ────────────────────────────────────────────────────────────

export function useViewerModified(): { modified: boolean } {
	return useBridgeEvent("modifiedChanged", { modified: false });
}

// ─── Viewer mode ──────────────────────────────────────────────────────────────

export function useViewerMode(): { mode: "select" | "edit" | "slideshow" } {
	return useBridgeEvent("modeChanged", { mode: "select" });
}

export function useViewerHistory(): { canUndo: boolean; canRedo: boolean } {
	return useBridgeEvent("historyChanged", { canUndo: false, canRedo: false });
}

export function useViewerEditSelection(): { hasSelection: boolean } {
	return useBridgeEvent("editSelectionChanged", { hasSelection: false });
}

export function useViewerEditCanvasState(): { scale: number; rectEdit: boolean } {
	return useBridgeEvent("editCanvasStateChanged", {
		scale: 1,
		rectEdit: false,
	});
}

export function useViewerEditLayers(): {
	layers: readonly {
		index: number;
		id: number;
		name: string;
		type: string;
		locked: boolean;
		visible: boolean;
		shared: boolean;
		selected: boolean;
	}[];
} {
	return useBridgeEvent("editLayersChanged", { layers: [] });
}

export function useViewerEditLayerState(): {
	hasSelection: boolean;
	canPasteLayer: boolean;
	canPasteLayerTransform: boolean;
	name: string | null;
	visible: boolean | null;
	locked: boolean | null;
	shared: boolean | null;
	x: number | null;
	y: number | null;
	scale: number | null;
	rotation: number | null;
	opacity: number | null;
	layerType: string | null;
	mirrorH: boolean | null;
	mirrorV: boolean | null;
	isText: boolean | null;
	textContent: string | null;
	clipTop: number | null;
	clipRight: number | null;
	clipBottom: number | null;
	clipLeft: number | null;
} {
	return useBridgeEvent("editLayerStateChanged", {
		hasSelection: false,
		canPasteLayer: false,
		canPasteLayerTransform: false,
		name: null,
		visible: null,
		locked: null,
		shared: null,
		x: null,
		y: null,
		scale: null,
		rotation: null,
		opacity: null,
		layerType: null,
		mirrorH: null,
		mirrorV: null,
		isText: null,
		textContent: null,
		clipTop: null,
		clipRight: null,
		clipBottom: null,
		clipLeft: null,
	});
}
