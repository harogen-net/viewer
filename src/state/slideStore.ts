import { create } from "zustand";
import type { Slide } from "../model/Slide";

interface SlideState {
	slides: Slide[];
	selectedIndex: number;
	setSlides: (slides: Slide[]) => void;
	setSelectedIndex: (index: number) => void;
}

export const useSlideStore = create<SlideState>()((set) => ({
	slides: [],
	selectedIndex: -1,
	setSlides: (slides) => set({ slides }),
	setSelectedIndex: (selectedIndex) => set({ selectedIndex }),
}));
