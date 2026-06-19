import { create } from "zustand";
import type { Layer } from "../types/Layer";

interface LayerState {
	/** 選択中スライドの layers のキャッシュ。slideStore.setSelectedIndex で同期される。 */
	layers: Layer[];
	selectedLayer: Layer | null;
	setLayers: (layers: Layer[]) => void;
	setSelectedLayer: (layer: Layer | null) => void;
}

export const useLayerStore = create<LayerState>()((set) => ({
	layers: [],
	selectedLayer: null,
	setLayers: (layers) => set({ layers, selectedLayer: null }),
	setSelectedLayer: (selectedLayer) => set({ selectedLayer }),
}));
