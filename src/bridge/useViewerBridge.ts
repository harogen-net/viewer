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
import { Layer } from "../model/Layer";
import { Slide } from "../model/Slide";
import type { ViewerDocument } from "../model/ViewerDocument";
import {
	type EditCanvasState,
	type EditLayerListItem,
	type EditLayerState,
	useLayerStore,
} from "../state/layerStore";
import { useSlideStore } from "../state/slideStore";
import { useViewerDocumentStore } from "../state/viewerDocumentStore";
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
	const slides = useSlideStore((state) => state.slides);
	const selectedIndex = useSlideStore((state) => state.selectedIndex);
	const revision = useSlideStore((state) => state.revision);
	return { slides, selectedIndex, revision };
}

export function useViewerDocument(): ViewerDocument | null {
	return useViewerDocumentStore((state) => state.document);
}

export function useViewerDocumentState() {
	const document = useViewerDocumentStore((state) => state.document);
	const title = useViewerDocumentStore((state) => state.title);
	const createTime = useViewerDocumentStore((state) => state.createTime);
	const editTime = useViewerDocumentStore((state) => state.editTime);
	const isSensitive = useViewerDocumentStore((state) => state.isSensitive);
	const duration = useViewerDocumentStore((state) => state.duration);
	const interval = useViewerDocumentStore((state) => state.interval);
	const width = useViewerDocumentStore((state) => state.width);
	const height = useViewerDocumentStore((state) => state.height);
	const bgColor = useViewerDocumentStore((state) => state.bgColor);
	const revision = useViewerDocumentStore((state) => state.revision);

	return {
		document,
		title,
		createTime,
		editTime,
		isSensitive,
		duration,
		interval,
		width,
		height,
		bgColor,
		revision,
	};
}

export function useViewerLayers(): readonly Layer[] {
	return useLayerStore((state) => state.layers);
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

export function useViewerNotice(): {
	id: number;
	message: string;
	variant: "error" | "info";
} | null {
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
	const hasSelection = useLayerStore((state) => state.editLayerState.hasSelection);
	return { hasSelection };
}

export function useViewerEditCanvasState(): EditCanvasState {
	return useLayerStore((state) => state.editCanvasState);
}

export function useViewerEditLayers(): { layers: readonly EditLayerListItem[] } {
	const layers = useLayerStore((state) => state.editLayers);
	return { layers };
}

export function useViewerEditLayerState(): EditLayerState {
	return useLayerStore((state) => state.editLayerState);
}
