import { create } from "zustand";
import type { SlideTitle } from "../storage/storageTypes";

/**
 * UI-side state previously broadcast via `ViewerBridge` pub/sub events.
 *
 * This store is the SSoT for state-like UI bits (mode / history / slideshow /
 * storage / image library / document-modified flag). Request-style transient
 * prompts (dialogs, notices) remain on the bridge for now and are migrated in
 * a later step.
 */

export type ViewerUiMode = "select" | "edit" | "slideshow";

export type HistoryAvailability = {
	canUndo: boolean;
	canRedo: boolean;
};

export type SlideshowSettings = {
	duration: number;
	interval: number;
	bgColor: string;
	fullscreen: boolean;
	mirrorH: boolean;
	mirrorV: boolean;
};

export type SlideshowPlayback = {
	isRun: boolean;
	isPause: boolean;
};

export type ImageLibraryEntry = {
	id: string;
	name: string;
	width: number;
	height: number;
	src: string;
};

export type StorageState = {
	titles: readonly SlideTitle[];
	selectedId: string | null;
	progress: number;
};

type UiStateSnapshot = {
	mode: ViewerUiMode;
	modified: boolean;
	history: HistoryAvailability;
	slideshowSettings: SlideshowSettings;
	slideshowPlayback: SlideshowPlayback;
	storage: StorageState;
	imageLibrary: readonly ImageLibraryEntry[];
};

type UiActions = {
	setMode: (mode: ViewerUiMode) => void;
	setModified: (modified: boolean) => void;
	setHistory: (history: HistoryAvailability) => void;
	setSlideshowSettings: (settings: SlideshowSettings) => void;
	setSlideshowPlayback: (playback: SlideshowPlayback) => void;
	setStorageTitles: (titles: readonly SlideTitle[]) => void;
	setStorageSelection: (selectedId: string | null) => void;
	setStorageProgress: (progress: number) => void;
	setImageLibrary: (images: readonly ImageLibraryEntry[]) => void;
	reset: () => void;
};

export type UiStore = UiStateSnapshot & UiActions;

const initialSlideshowSettings: SlideshowSettings = {
	duration: 2000,
	interval: 6000,
	bgColor: "#999999",
	fullscreen: false,
	mirrorH: false,
	mirrorV: false,
};

const initialSlideshowPlayback: SlideshowPlayback = {
	isRun: false,
	isPause: false,
};

const initialStorage: StorageState = {
	titles: [],
	selectedId: null,
	progress: 0,
};

const initialUiState: UiStateSnapshot = {
	mode: "select",
	modified: false,
	history: { canUndo: false, canRedo: false },
	slideshowSettings: initialSlideshowSettings,
	slideshowPlayback: initialSlideshowPlayback,
	storage: initialStorage,
	imageLibrary: [],
};

export const useUiStore = create<UiStore>((set) => ({
	...initialUiState,
	setMode: (mode) => set({ mode }),
	setModified: (modified) => set({ modified }),
	setHistory: (history) => set({ history }),
	setSlideshowSettings: (slideshowSettings) => set({ slideshowSettings }),
	setSlideshowPlayback: (slideshowPlayback) => set({ slideshowPlayback }),
	setStorageTitles: (titles) =>
		set((state) => ({ storage: { ...state.storage, titles } })),
	setStorageSelection: (selectedId) =>
		set((state) => ({ storage: { ...state.storage, selectedId } })),
	setStorageProgress: (progress) =>
		set((state) => ({ storage: { ...state.storage, progress } })),
	setImageLibrary: (imageLibrary) => set({ imageLibrary }),
	reset: () => set({ ...initialUiState }),
}));

export const uiStore = useUiStore;
