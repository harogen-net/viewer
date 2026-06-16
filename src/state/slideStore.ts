import { create } from "zustand";
import type { Slide } from "../model/Slide";
import { layerStore } from "./layerStore";

type SlideStateSnapshot = {
	slides: readonly Slide[];
	selectedIndex: number;
	selectedSlide: Slide | null;
	revision: number;
};

type SlideActions = {
	setSlides: (slides: readonly Slide[], selectedIndex?: number) => void;
	addSlide: (slide: Slide, index?: number) => void;
	removeSlide: (slide: Slide) => void;
	moveSelectedSlideToIndex: (toIndex: number) => boolean;
	setSelectedIndex: (selectedIndex: number) => void;
	setSelectedSlide: (slide: Slide | null) => void;
	getSlideByOffset: (slide: Slide, offset: number) => Slide | null;
	getPrevSlide: (slide: Slide) => Slide | null;
	getNextSlide: (slide: Slide) => Slide | null;
	notifyLayersChanged: () => void;
	reset: () => void;
};

export type SlideStore = SlideStateSnapshot & SlideActions;

const getSelectedSlide = (slides: readonly Slide[], selectedIndex: number): Slide | null => {
	return selectedIndex >= 0 && selectedIndex < slides.length ? slides[selectedIndex] : null;
};

const clampSelectedIndex = (slides: readonly Slide[], selectedIndex: number): number => {
	return selectedIndex >= 0 && selectedIndex < slides.length ? selectedIndex : -1;
};

const initialSlideState = {
	slides: [] as readonly Slide[],
	selectedIndex: -1,
	selectedSlide: null,
};

export const useSlideStore = create<SlideStore>((set, get) => ({
	...initialSlideState,
	revision: 0,
	setSlides: (slides, selectedIndex = get().selectedIndex) => {
		const nextSelectedIndex = clampSelectedIndex(slides, selectedIndex);
		layerStore.getState().setLayersFromSlides(slides);
		set((state) => ({
			slides,
			selectedIndex: nextSelectedIndex,
			selectedSlide: getSelectedSlide(slides, nextSelectedIndex),
			revision: state.revision + 1,
		}));
	},
	addSlide: (slide, index = -1) => {
		const state = get();
		const slides = [...state.slides];
		if (index !== -1 && index < slides.length) {
			slides.splice(index, 0, slide);
		} else {
			slides.push(slide);
		}
		state.setSlides(slides, state.selectedIndex);
	},
	removeSlide: (slide) => {
		const state = get();
		const index = state.slides.indexOf(slide);
		if (index === -1) return;
		const wasSelected = index === state.selectedIndex;
		const slides = state.slides.filter((target) => target !== slide);
		let selectedIndex = state.selectedIndex;
		if (wasSelected) {
			selectedIndex = index < slides.length ? index : slides.length - 1;
		} else if (state.selectedIndex > index) {
			selectedIndex = state.selectedIndex - 1;
		}
		state.setSlides(slides, selectedIndex);
	},
	moveSelectedSlideToIndex: (toIndex) => {
		const state = get();
		const fromIndex = state.selectedIndex;
		if (fromIndex === -1 || !Number.isInteger(toIndex)) return false;
		const clampedToIndex = Math.max(0, Math.min(state.slides.length - 1, toIndex));
		if (fromIndex === clampedToIndex) return false;
		const slides = [...state.slides];
		const [slide] = slides.splice(fromIndex, 1);
		slides.splice(clampedToIndex, 0, slide);
		state.setSlides(slides, clampedToIndex);
		return true;
	},
	setSelectedIndex: (selectedIndex) => {
		const nextSelectedIndex = clampSelectedIndex(get().slides, selectedIndex);
		set((state) => ({
			selectedIndex: nextSelectedIndex,
			selectedSlide: getSelectedSlide(state.slides, nextSelectedIndex),
			revision: state.revision + 1,
		}));
	},
	setSelectedSlide: (slide) => {
		get().setSelectedIndex(slide ? get().slides.indexOf(slide) : -1);
	},
	getSlideByOffset: (slide, offset) => {
		const slides = get().slides;
		const index = slides.indexOf(slide);
		if (index === -1) return null;
		const targetIndex = index + offset;
		return targetIndex >= 0 && targetIndex < slides.length ? slides[targetIndex] : null;
	},
	getPrevSlide: (slide) => {
		return get().getSlideByOffset(slide, -1);
	},
	getNextSlide: (slide) => {
		return get().getSlideByOffset(slide, 1);
	},
	notifyLayersChanged: () => {
		const slides = get().slides;
		layerStore.getState().notifyLayersChanged(slides);
		set((state) => ({
			revision: state.revision + 1,
		}));
	},
	reset: () => {
		layerStore.getState().reset();
		set((state) => ({
			...initialSlideState,
			revision: state.revision + 1,
		}));
	},
}));

export const slideStore = useSlideStore;
