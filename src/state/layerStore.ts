import { create } from "zustand";
import type { Layer } from "../model/Layer";
import type { Slide } from "../model/Slide";
import { toLayerSnapshot, type LayerSnapshot } from "../model/snapshot";

type LayerStateSnapshot = {
	layers: readonly Layer[];
	layerSnapshots: readonly LayerSnapshot[];
	editLayers: readonly EditLayerListItem[];
	editLayerState: EditLayerState;
	editCanvasState: EditCanvasState;
	revision: number;
};

type LayerActions = {
	setLayers: (layers: readonly Layer[]) => void;
	setLayersFromSlides: (slides: readonly Slide[]) => void;
	setEditLayers: (editLayers: readonly EditLayerListItem[]) => void;
	setEditLayerState: (editLayerState: EditLayerState) => void;
	clearEditLayerState: () => void;
	setEditCanvasState: (editCanvasState: EditCanvasState) => void;
	notifyLayersChanged: (slides: readonly Slide[]) => void;
	reset: () => void;
};

export type LayerStore = LayerStateSnapshot & LayerActions;

export type EditLayerListItem = {
	index: number;
	id: number;
	name: string;
	type: string;
	locked: boolean;
	visible: boolean;
	shared: boolean;
	selected: boolean;
};

export type EditLayerState = {
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
};

export type EditCanvasState = {
	scale: number;
	rectEdit: boolean;
};

const getLayersFromSlides = (slides: readonly Slide[]): readonly Layer[] => {
	return slides.flatMap((slide) => slide.layers);
};

const initialLayerState = {
	layers: [] as readonly Layer[],
	layerSnapshots: [] as readonly LayerSnapshot[],
	editLayers: [] as readonly EditLayerListItem[],
	editLayerState: {
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
	} satisfies EditLayerState,
	editCanvasState: {
		scale: 1,
		rectEdit: false,
	} satisfies EditCanvasState,
};

export const useLayerStore = create<LayerStore>((set, get) => ({
	...initialLayerState,
	revision: 0,
	setLayers: (layers) => {
		set((state) => ({
			layers,
			layerSnapshots: layers.map(toLayerSnapshot),
			revision: state.revision + 1,
		}));
	},
	setLayersFromSlides: (slides) => {
		get().setLayers(getLayersFromSlides(slides));
	},
	setEditLayers: (editLayers) => {
		set((state) => ({
			editLayers,
			revision: state.revision + 1,
		}));
	},
	setEditLayerState: (editLayerState) => {
		set((state) => ({
			editLayerState,
			revision: state.revision + 1,
		}));
	},
	clearEditLayerState: () => {
		set((state) => ({
			editLayerState: initialLayerState.editLayerState,
			revision: state.revision + 1,
		}));
	},
	setEditCanvasState: (editCanvasState) => {
		set((state) => ({
			editCanvasState,
			revision: state.revision + 1,
		}));
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
