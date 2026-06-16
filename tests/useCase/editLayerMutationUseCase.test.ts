import assert from "node:assert/strict";
import test from "node:test";

import type { Layer } from "../../src/model/Layer";
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

function createFakeTextLayer(): MutableTextLayer {
	return {
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
		text: "hello",
	} as MutableTextLayer;
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
