import { create } from "zustand";
import type { Layer } from "../model/Layer";
import type { Slide } from "../model/Slide";

type LayerStateSnapshot = {
	layers: readonly Layer[];
	revision: number;
};

type LayerActions = {
	setLayers: (layers: readonly Layer[]) => void;
	setLayersFromSlides: (slides: readonly Slide[]) => void;
	notifyLayersChanged: (slides: readonly Slide[]) => void;
	reset: () => void;
};

export type LayerStore = LayerStateSnapshot & LayerActions;

const getLayersFromSlides = (slides: readonly Slide[]): readonly Layer[] => {
	return slides.flatMap((slide) => slide.layers);
};

const initialLayerState = {
	layers: [] as readonly Layer[],
};

export const useLayerStore = create<LayerStore>((set, get) => ({
	...initialLayerState,
	revision: 0,
	setLayers: (layers) => {
		set((state) => ({
			layers,
			revision: state.revision + 1,
		}));
	},
	setLayersFromSlides: (slides) => {
		get().setLayers(getLayersFromSlides(slides));
	},
	notifyLayersChanged: (slides) => {
		get().setLayersFromSlides(slides);
	},
	reset: () => {
		set((state) => ({
			...initialLayerState,
			revision: state.revision + 1,
		}));
	},
}));

export const layerStore = useLayerStore;
