import { create } from "zustand";
import type { Layer } from "../model/Layer";
import type { Slide } from "../model/Slide";
import { toLayerSnapshot, type LayerSnapshot } from "../model/snapshot";

type LayerStateSnapshot = {
	layers: readonly Layer[];
	layerSnapshots: readonly LayerSnapshot[];
	editLayers: readonly EditLayerListItem[];
	editSelection: EditLayerSelectionState;
	editValues: EditLayerValues;
	editCanvasState: EditCanvasState;
	revision: number;
};

type LayerActions = {
	setLayers: (layers: readonly Layer[]) => void;
	setLayersFromSlides: (slides: readonly Slide[]) => void;
	setEditLayers: (editLayers: readonly EditLayerListItem[]) => void;
	setEditSelection: (editSelection: EditLayerSelectionState) => void;
	setEditValues: (editValues: EditLayerValues) => void;
	clearEditState: () => void;
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

/**
 * UI-only selection state for the edit panel. Independent of any model values
 * so that paste availability and selection presence can update without
 * re-publishing per-layer numeric values.
 */
export type EditLayerSelectionState = {
	hasSelection: boolean;
	canPasteLayer: boolean;
	canPasteLayerTransform: boolean;
};

/**
 * Model-derived values of the currently selected layer. `null` when there is
 * no selection (or the field does not apply to the selected layer type).
 */
export type EditLayerValues = {
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

const initialEditSelection: EditLayerSelectionState = {
	hasSelection: false,
	canPasteLayer: false,
	canPasteLayerTransform: false,
};

const initialEditValues: EditLayerValues = {
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
};

const initialLayerState = {
	layers: [] as readonly Layer[],
	layerSnapshots: [] as readonly LayerSnapshot[],
	editLayers: [] as readonly EditLayerListItem[],
	editSelection: initialEditSelection,
	editValues: initialEditValues,
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
	setEditSelection: (editSelection) => {
		set((state) => ({
			editSelection,
			revision: state.revision + 1,
		}));
	},
	setEditValues: (editValues) => {
		set((state) => ({
			editValues,
			revision: state.revision + 1,
		}));
	},
	clearEditState: () => {
		set((state) => ({
			editSelection: initialEditSelection,
			editValues: initialEditValues,
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
