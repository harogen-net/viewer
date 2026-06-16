import { create } from "zustand";
import type { Layer } from "../model/Layer";
import type { Slide } from "../model/Slide";
import type { ViewerDocument } from "../model/ViewerDocument";

type ViewerDocumentStateSnapshot = {
	document: ViewerDocument | null;
	slides: readonly Slide[];
	selectedIndex: number;
	selectedSlide: Slide | null;
	layers: readonly Layer[];
	revision: number;
};

type ViewerDocumentActions = {
	setDocument: (document: ViewerDocument | null, selectedIndex?: number) => void;
	setSlides: (slides: readonly Slide[], selectedIndex?: number) => void;
	setSelectedIndex: (selectedIndex: number) => void;
	notifyLayersChanged: () => void;
	reset: () => void;
};

export type ViewerDocumentStore = ViewerDocumentStateSnapshot & ViewerDocumentActions;

const getSelectedSlide = (slides: readonly Slide[], selectedIndex: number): Slide | null => {
	return selectedIndex >= 0 && selectedIndex < slides.length ? slides[selectedIndex] : null;
};

const getLayers = (slides: readonly Slide[]): readonly Layer[] => {
	return slides.flatMap((slide) => slide.layers);
};

export const useViewerDocumentStore = create<ViewerDocumentStore>((set, get) => ({
	document: null,
	slides: [],
	selectedIndex: -1,
	selectedSlide: null,
	layers: [],
	revision: 0,
	setDocument: (document, selectedIndex = -1) => {
		const slides = document?.slides ?? [];
		set((state) => ({
			document,
			slides,
			selectedIndex,
			selectedSlide: getSelectedSlide(slides, selectedIndex),
			layers: getLayers(slides),
			revision: state.revision + 1,
		}));
	},
	setSlides: (slides, selectedIndex = get().selectedIndex) => {
		set((state) => ({
			slides,
			selectedIndex,
			selectedSlide: getSelectedSlide(slides, selectedIndex),
			layers: getLayers(slides),
			revision: state.revision + 1,
		}));
	},
	setSelectedIndex: (selectedIndex) => {
		set((state) => ({
			selectedIndex,
			selectedSlide: getSelectedSlide(state.slides, selectedIndex),
			revision: state.revision + 1,
		}));
	},
	notifyLayersChanged: () => {
		set((state) => ({
			layers: getLayers(state.slides),
			revision: state.revision + 1,
		}));
	},
	reset: () => {
		set((state) => ({
			document: null,
			slides: [],
			selectedIndex: -1,
			selectedSlide: null,
			layers: [],
			revision: state.revision + 1,
		}));
	},
}));

export const viewerDocumentStore = useViewerDocumentStore;
