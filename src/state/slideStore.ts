import { create } from "zustand";
import type { Slide } from "../types/Slide";
import { useLayerStore } from "./layerStore";

interface SlideState {
	slides: Slide[];
	selectedIndex: number;
	setSlides: (slides: Slide[]) => void;
	setSelectedIndex: (index: number) => void;
}

export const useSlideStore = create<SlideState>()((set, get) => ({
	slides: [],
	selectedIndex: -1,
	setSlides: (slides) => {
		set({ slides, selectedIndex: -1 });
		// slides 差し替え時は選択解除 + layerStore も空に同期
		useLayerStore.getState().setLayers([]);
	},
	setSelectedIndex: (selectedIndex) => {
		set({ selectedIndex });
		// 選択スライドの layers を layerStore に同期
		const slide = get().slides[selectedIndex];
		useLayerStore.getState().setLayers(slide?.layers ?? []);
	},
}));
