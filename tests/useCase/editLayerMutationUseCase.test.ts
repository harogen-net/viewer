import assert from "node:assert/strict";
import test from "node:test";

import type { Layer } from "../../src/model/Layer";
import type { ImageLayer } from "../../src/model/layer/ImageLayer";
import type { TextLayer } from "../../src/model/layer/TextLayer";
import {
    createEditLayerMutationUseCase,
    type LayerMutationRenderScope,
    type LayerMutationSlide,
} from "../../src/useCase/EditLayerMutationUseCase";
import { HistoryManager } from "../../src/utils/HistoryManager";

type MutationEmission = {
	render: LayerMutationRenderScope;
	includeLayerList: boolean;
};

type MutableTextLayer = Layer & TextLayer;
type MutableImageLayer = Layer & ImageLayer;

function createFakeTextLayer(): MutableTextLayer {
	const layer = {
		type: "text",
		name: "",
		visible: true,
		locked: false,
		shared: false,
		x: 0,
		y: 0,
		scale: 1,
		rotation: 0,
		opacity: 1,
		mirrorH: false,
		mirrorV: false,
		transform: { transX: 0, transY: 0, scaleX: 1, scaleY: 1, rotation: 0 },
		text: "hello",
		clone() {
			const cloned = createFakeTextLayer();
			cloned.name = this.name;
			cloned.visible = this.visible;
			cloned.locked = this.locked;
			cloned.shared = this.shared;
			cloned.x = this.x;
			cloned.y = this.y;
			cloned.scale = this.scale;
			cloned.rotation = this.rotation;
			cloned.opacity = this.opacity;
			cloned.mirrorH = this.mirrorH;
			cloned.mirrorV = this.mirrorV;
			cloned.transform = Object.assign({}, this.transform);
			cloned.text = this.text;
			return cloned;
		},
		moveTo(x: number, y: number) {
			this.x = x;
			this.y = y;
		},
	} as unknown as MutableTextLayer;
	return layer;
}

function createFakeImageLayer(imageId = "image-a"): MutableImageLayer {
	const layer = {
		...createFakeTextLayer(),
		type: "image",
		imageId,
		isText: false,
		clipRect: [0, 0, 0, 0],
	} as unknown as MutableImageLayer;
	layer.clone = function cloneImageLayer() {
		const cloned = createFakeImageLayer(this.imageId);
		cloned.name = this.name;
		cloned.visible = this.visible;
		cloned.locked = this.locked;
		cloned.shared = this.shared;
		cloned.x = this.x;
		cloned.y = this.y;
		cloned.scale = this.scale;
		cloned.rotation = this.rotation;
		cloned.opacity = this.opacity;
		cloned.mirrorH = this.mirrorH;
		cloned.mirrorV = this.mirrorV;
		cloned.transform = Object.assign({}, this.transform);
		cloned.isText = this.isText;
		cloned.clipRect = this.clipRect.concat();
		return cloned;
	};
	return layer;
}

function createTextLayerMutationFixture() {
	HistoryManager.init();
	const layer = createFakeTextLayer();
	const emissions: MutationEmission[] = [];
	const useCase = createEditLayerMutationUseCase({
		getSelectedLayer: () => layer,
		emitAfterMutation: (render, includeLayerList) => {
			emissions.push({ render, includeLayerList });
		},
	});
	return { layer, emissions, useCase };
}

function createSlideLayerMutationFixture() {
	HistoryManager.init();
	const firstLayer = createFakeTextLayer();
	const secondLayer = createFakeTextLayer();
	firstLayer.name = "first";
	secondLayer.name = "second";
	const layers = [firstLayer, secondLayer];
	const slide: LayerMutationSlide = {
		layers,
		centerX: 320,
		centerY: 240,
		indexOf: (layer: Layer) => layers.indexOf(layer as MutableTextLayer),
		addLayer: (layer: Layer, index: number = -1) => {
			const currentIndex = layers.indexOf(layer as MutableTextLayer);
			if (currentIndex !== -1) {
				layers.splice(currentIndex, 1);
			}
			if (index === -1) {
				layers.push(layer as MutableTextLayer);
			} else {
				layers.splice(index, 0, layer as MutableTextLayer);
			}
			return layer;
		},
		removeLayer: (layer: Layer) => {
			const currentIndex = layers.indexOf(layer as MutableTextLayer);
			if (currentIndex !== -1) {
				layers.splice(currentIndex, 1);
			}
			return layer;
		},
		swapLayer: (layer: Layer, offset: number) => {
			const currentIndex = layers.indexOf(layer as MutableTextLayer);
			const nextIndex = Math.max(0, Math.min(layers.length - 1, currentIndex + offset));
			slide.addLayer(layer, nextIndex);
			return layer;
		},
		fitLayer: (layer: Layer) => layer,
		arrangeLayer: (layer: Layer) => layer,
	};
	const emissions: MutationEmission[] = [];
	const useCase = createEditLayerMutationUseCase({
		getSelectedLayer: () => firstLayer,
		getCurrentSlide: () => slide,
		emitAfterMutation: (render, includeLayerList) => {
			emissions.push({ render, includeLayerList });
		},
	});
	return { emissions, firstLayer, layers, secondLayer, useCase };
}

function createImageReplacementFixture() {
	HistoryManager.init();
	const selectedLayer = createFakeImageLayer("image-a");
	const linkedLayer = createFakeImageLayer("image-a");
	const unrelatedLayer = createFakeImageLayer("image-b");
	const emissions: MutationEmission[] = [];
	const useCase = createEditLayerMutationUseCase({
		getSelectedLayer: () => selectedLayer,
		getReferenceLayers: () => [selectedLayer, linkedLayer, unrelatedLayer],
		registerImageFromFile: async () => "image-next",
		emitAfterMutation: (render, includeLayerList) => {
			emissions.push({ render, includeLayerList });
		},
	});
	return { emissions, linkedLayer, selectedLayer, unrelatedLayer, useCase };
}

test("setSelectedLayerName records undoable mutation and layer-list emission", () => {
	const { layer, emissions, useCase } = createTextLayerMutationFixture();

	const result = useCase.setSelectedLayerName(" renamed ");

	assert.equal(result, true);
	assert.equal(layer.name, "renamed");
	assert.deepEqual(emissions, [{ render: "selection", includeLayerList: true }]);
	assert.equal(HistoryManager.shared.canUndo, true);

	HistoryManager.shared.undo();
	assert.equal(layer.name, "");
	assert.equal(HistoryManager.shared.canRedo, true);

	HistoryManager.shared.redo();
	assert.equal(layer.name, "renamed");
});

test("setSelectedLayerPosition skips history when the selected value is unchanged", () => {
	const { layer, emissions, useCase } = createTextLayerMutationFixture();

	const result = useCase.setSelectedLayerPosition(layer.x, layer.y);

	assert.equal(result, true);
	assert.equal(HistoryManager.shared.canUndo, false);
	assert.deepEqual(emissions, []);
});

test("image-only mutation rejects a selected text layer", () => {
	const { emissions, useCase } = createTextLayerMutationFixture();

	const result = useCase.toggleSelectedLayerIsText();

	assert.equal(result, false);
	assert.equal(HistoryManager.shared.canUndo, false);
	assert.deepEqual(emissions, []);
});

test("moveSelectedLayerToIndex records undoable layer order mutation", () => {
	const { emissions, firstLayer, layers, secondLayer, useCase } = createSlideLayerMutationFixture();

	const result = useCase.moveSelectedLayerToIndex(1);

	assert.equal(result, true);
	assert.deepEqual(layers, [secondLayer, firstLayer]);
	assert.deepEqual(emissions, [{ render: "current", includeLayerList: false }]);
	assert.equal(HistoryManager.shared.canUndo, true);

	HistoryManager.shared.undo();
	assert.deepEqual(layers, [firstLayer, secondLayer]);

	HistoryManager.shared.redo();
	assert.deepEqual(layers, [secondLayer, firstLayer]);
});

test("removeSelectedLayer records undoable slide removal", () => {
	const { emissions, firstLayer, layers, secondLayer, useCase } = createSlideLayerMutationFixture();

	const result = useCase.removeSelectedLayer();

	assert.equal(result, true);
	assert.deepEqual(layers, [secondLayer]);
	assert.deepEqual(emissions, [{ render: "current", includeLayerList: false }]);

	HistoryManager.shared.undo();
	assert.deepEqual(layers, [firstLayer, secondLayer]);
});

test("copy and paste layer use an undoable cloned layer", () => {
	const { emissions, firstLayer, layers } = createSlideLayerMutationFixture();
	let selectedLayer: Layer | null = firstLayer;
	const pastedSelections: Layer[] = [];
	const useCase = createEditLayerMutationUseCase({
		getSelectedLayer: () => selectedLayer,
		getCurrentSlide: () => ({
			centerX: 320,
			centerY: 240,
			layers,
			indexOf: (layer) => layers.indexOf(layer as MutableTextLayer),
			addLayer: (layer) => {
				layers.push(layer as MutableTextLayer);
				return layer;
			},
			removeLayer: (layer) => {
				const index = layers.indexOf(layer as MutableTextLayer);
				if (index !== -1) layers.splice(index, 1);
				return layer;
			},
			fitLayer: (layer) => layer,
			arrangeLayer: (layer) => layer,
			swapLayer: (layer, _offset) => layer,
		}),
		selectLayer: (layer) => {
			selectedLayer = layer;
			pastedSelections.push(layer);
		},
		emitAfterMutation: (render, includeLayerList) => {
			emissions.push({ render, includeLayerList });
		},
	});

	assert.equal(useCase.copySelectedLayer(), true);
	assert.equal(useCase.canPasteLayer(), true);
	assert.equal(useCase.pasteLayer(), true);

	assert.equal(layers.length, 3);
	assert.notEqual(layers[2], firstLayer);
	assert.equal((layers[2] as MutableTextLayer).text, firstLayer.text);
	assert.deepEqual(pastedSelections, [layers[2]]);
	assert.deepEqual(emissions, [{ render: "current", includeLayerList: false }]);

	HistoryManager.shared.undo();
	assert.equal(layers.length, 2);
});

test("copy and paste layer transform record undoable transform mutation", () => {
	const { emissions, firstLayer, secondLayer } = createSlideLayerMutationFixture();
	let selectedLayer: Layer | null = firstLayer;
	const useCase = createEditLayerMutationUseCase({
		getSelectedLayer: () => selectedLayer,
		emitAfterMutation: (render, includeLayerList) => {
			emissions.push({ render, includeLayerList });
		},
	});
	firstLayer.transform = { transX: 10, transY: 20, scaleX: 2, scaleY: 2, rotation: 45 };
	secondLayer.transform = { transX: 0, transY: 0, scaleX: 1, scaleY: 1, rotation: 0 };

	assert.equal(useCase.copySelectedLayerTransform(), true);
	assert.equal(useCase.canPasteLayerTransform(), true);
	selectedLayer = secondLayer;

	assert.equal(useCase.pasteLayerTransform(), true);
	assert.deepEqual(secondLayer.transform, {
		transX: 10,
		transY: 20,
		scaleX: 2,
		scaleY: 2,
		rotation: 45,
	});
	assert.deepEqual(emissions, [{ render: "current", includeLayerList: false }]);

	HistoryManager.shared.undo();
	assert.deepEqual(secondLayer.transform, {
		transX: 0,
		transY: 0,
		scaleX: 1,
		scaleY: 1,
		rotation: 0,
	});
});

test("spreadSelectedLayer records matching layer sharing across neighbor slides", () => {
	const { emissions, firstLayer: selectedLayer } = createSlideLayerMutationFixture();
	const matchingLayer = createFakeTextLayer();
	matchingLayer.text = selectedLayer.text;
	const currentSlide: LayerMutationSlide = {
		centerX: 0,
		centerY: 0,
		layers: [selectedLayer],
		indexOf: (layer) => (layer === selectedLayer ? 0 : -1),
		addLayer: (layer) => layer,
		removeLayer: (layer) => layer,
		fitLayer: (layer) => layer,
		arrangeLayer: (layer) => layer,
		swapLayer: (layer) => layer,
	};
	const nextSlide: LayerMutationSlide = {
		centerX: 0,
		centerY: 0,
		layers: [matchingLayer],
		indexOf: (layer) => (layer === matchingLayer ? 0 : -1),
		addLayer: (layer) => layer,
		removeLayer: (layer) => layer,
		fitLayer: (layer) => layer,
		arrangeLayer: (layer) => layer,
		swapLayer: (layer) => layer,
	};
	const trackedLayers: Layer[] = [];
	const useCase = createEditLayerMutationUseCase({
		getSelectedLayer: () => selectedLayer,
		getCurrentSlide: () => currentSlide,
		getNextSlide: (slide) => (slide === currentSlide ? nextSlide : null),
		getPrevSlide: () => null,
		trackSharedLayer: (layer) => {
			trackedLayers.push(layer);
		},
		emitAfterMutation: (render, includeLayerList) => {
			emissions.push({ render, includeLayerList });
		},
	});

	const result = useCase.spreadSelectedLayer();

	assert.equal(result, true);
	assert.equal(selectedLayer.shared, true);
	assert.equal(matchingLayer.shared, true);
	assert.deepEqual(trackedLayers, [selectedLayer]);
	assert.deepEqual(emissions, [{ render: "current", includeLayerList: true }]);

	HistoryManager.shared.undo();
	assert.equal(matchingLayer.shared, false);
});

test("addTextLayer creates centered undoable layer", () => {
	const { emissions, layers } = createSlideLayerMutationFixture();
	const createdLayers: MutableTextLayer[] = [];
	const textUseCase = createEditLayerMutationUseCase({
		getCurrentSlide: () => ({
			centerX: 320,
			centerY: 240,
			layers,
			indexOf: (layer) => layers.indexOf(layer as MutableTextLayer),
			addLayer: (layer) => {
				layers.push(layer as MutableTextLayer);
				return layer;
			},
			removeLayer: (layer) => {
				const index = layers.indexOf(layer as MutableTextLayer);
				if (index !== -1) layers.splice(index, 1);
				return layer;
			},
			fitLayer: (layer) => layer,
			arrangeLayer: (layer) => layer,
			swapLayer: (layer, _offset) => layer,
		}),
		getSelectedLayer: () => null,
		createTextLayer: (text) => {
			const layer = createFakeTextLayer();
			layer.text = text;
			createdLayers.push(layer);
			return layer;
		},
		emitAfterMutation: (render, includeLayerList) => {
			emissions.push({ render, includeLayerList });
		},
	});

	const result = textUseCase.addTextLayer(" hello ");

	assert.equal(result, true);
	assert.equal(createdLayers[0].text, "hello");
	assert.equal(createdLayers[0].x, 320);
	assert.equal(createdLayers[0].y, 240);
	assert.equal(layers.includes(createdLayers[0]), true);

	HistoryManager.shared.undo();
	assert.equal(layers.includes(createdLayers[0]), false);
});

test("replaceSelectedImage updates matching references in one transaction", async () => {
	const { emissions, linkedLayer, selectedLayer, unrelatedLayer, useCase } =
		createImageReplacementFixture();

	const result = await useCase.replaceSelectedImage({} as File, true);

	assert.equal(result, true);
	assert.equal(selectedLayer.imageId, "image-next");
	assert.equal(linkedLayer.imageId, "image-next");
	assert.equal(unrelatedLayer.imageId, "image-b");
	assert.deepEqual(emissions, [{ render: "selection", includeLayerList: false }]);

	HistoryManager.shared.undo();
	assert.equal(selectedLayer.imageId, "image-a");
	assert.equal(linkedLayer.imageId, "image-a");
	assert.equal(unrelatedLayer.imageId, "image-b");
});
