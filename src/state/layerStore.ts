import { create } from "zustand";
import type { Layer } from "../model/Layer";

interface LayerState {
	selectedLayer: Layer | null;
	setSelectedLayer: (layer: Layer | null) => void;
}

export const useLayerStore = create<LayerState>()((set) => ({
	selectedLayer: null,
	setSelectedLayer: (selectedLayer) => set({ selectedLayer }),
}));
