import assert from "node:assert/strict";
import test from "node:test";

import type { Layer } from "../../src/model/Layer";
import type { ImageLayer } from "../../src/model/layer/ImageLayer";
import type { Slide } from "../../src/model/Slide";
import {
    toDocumentSnapshot,
    toLayerSnapshot,
    toSlideSnapshot,
    type ImageLayerSnapshot,
    type TextLayerSnapshot,
} from "../../src/model/snapshot";
import type { ViewerDocument } from "../../src/model/ViewerDocument";

function createBaseLayer(overrides: Partial<Record<string, unknown>> = {}): Layer {
	return {
		type: "layer",
		id: 7,
		uuid: "base-uuid",
		name: "base",
		visible: false,
		locked: true,
		shared: true,
		opacity: 0.5,
		x: 5,
		y: 6,
		transX: 12,
		transY: 34,
		scaleX: 2,
		scaleY: 3,
		scale: 2,
		rotation: 45,
		mirrorH: false,
		mirrorV: false,
		originWidth: 100,
		originHeight: 80,
		width: 200,
		height: 240,
		...overrides,
	} as unknown as Layer;
}

test("toLayerSnapshot maps a base layer to plain data", () => {
	const snapshot = toLayerSnapshot(createBaseLayer());

	assert.equal(snapshot.type, "layer");
	assert.equal(snapshot.id, 7);
	assert.equal(snapshot.uuid, "base-uuid");
	assert.equal(snapshot.name, "base");
	assert.equal(snapshot.visible, false);
	assert.equal(snapshot.locked, true);
	assert.equal(snapshot.shared, true);
	assert.equal(snapshot.opacity, 0.5);
	assert.equal(snapshot.transX, 12);
	assert.equal(snapshot.transY, 34);
	assert.equal(snapshot.scaleX, 2);
	assert.equal(snapshot.scaleY, 3);
	assert.equal(snapshot.rotation, 45);
});

test("toLayerSnapshot computes a CSS affine matrix from the transform", () => {
	const snapshot = toLayerSnapshot(createBaseLayer());

	const radian = (45 * Math.PI) / 180;
	const cos = Math.cos(radian);
	const sin = Math.sin(radian);
	const expected = [2 * cos, 2 * sin, -3 * sin, 3 * cos, 12, 34];

	snapshot.matrix.forEach((value, index) => {
		assert.ok(Math.abs(value - expected[index]) < 1e-9);
	});
});

test("toLayerSnapshot applies mirror flags to the matrix", () => {
	const snapshot = toLayerSnapshot(
		createBaseLayer({ rotation: 0, mirrorH: true, mirrorV: true })
	);

	const expected = [-2, 0, 0, -3, 12, 34];
	snapshot.matrix.forEach((value, index) => {
		assert.ok(Math.abs(value - expected[index]) < 1e-9);
	});
});

test("toLayerSnapshot maps a text layer with its text content", () => {
	const layer = createBaseLayer({ type: "text", id: 9, text: "hello\nworld" });

	const snapshot = toLayerSnapshot(layer) as TextLayerSnapshot;

	assert.equal(snapshot.type, "text");
	assert.equal(snapshot.id, 9);
	assert.equal(snapshot.text, "hello\nworld");
});

test("toLayerSnapshot maps image-specific fields", () => {
	const layer = createBaseLayer({
		type: "image",
		id: 3,
		imageId: "img-1",
		clipT: 1,
		clipR: 2,
		clipB: 3,
		clipL: 4,
		isText: true,
	}) as unknown as ImageLayer;

	const snapshot = toLayerSnapshot(layer) as ImageLayerSnapshot;

	assert.equal(snapshot.type, "image");
	assert.equal(snapshot.imageId, "img-1");
	assert.equal(snapshot.clipTop, 1);
	assert.equal(snapshot.clipRight, 2);
	assert.equal(snapshot.clipBottom, 3);
	assert.equal(snapshot.clipLeft, 4);
	assert.equal(snapshot.isText, true);
});

test("toSlideSnapshot maps slide metadata and its layers", () => {
	const text = createBaseLayer({ type: "text", id: 1, text: "a" });
	const base = createBaseLayer({ type: "layer", id: 2 });
	const slide = {
		id: 11,
		uuid: "slide-uuid",
		width: 640,
		height: 480,
		centerX: 320,
		centerY: 240,
		durationRatio: 1,
		joining: false,
		disabled: false,
		layers: [text, base],
	} as unknown as Slide;

	const snapshot = toSlideSnapshot(slide);

	assert.equal(snapshot.width, 640);
	assert.equal(snapshot.height, 480);
	assert.equal(snapshot.centerX, 320);
	assert.equal(snapshot.centerY, 240);
	assert.equal(snapshot.layers.length, 2);
	assert.equal(snapshot.layers[0].type, "text");
	assert.equal(snapshot.layers[1].type, "layer");
});

test("toDocumentSnapshot maps document metadata and slides", () => {
	const slide = {
		id: 11,
		uuid: "slide-uuid",
		width: 640,
		height: 480,
		centerX: 320,
		centerY: 240,
		durationRatio: 1,
		joining: false,
		disabled: false,
		layers: [createBaseLayer({ type: "text", id: 1, text: "x" })],
	} as unknown as Slide;
	const doc: ViewerDocument = {
		slides: [slide],
		title: "title",
		createTime: 100,
		editTime: 200,
		isSensitive: true,
		duration: undefined,
		interval: undefined,
		width: 1920,
		height: 1080,
		bgColor: "#123456",
	};

	const snapshot = toDocumentSnapshot(doc);

	assert.equal(snapshot.title, "title");
	assert.equal(snapshot.createTime, 100);
	assert.equal(snapshot.editTime, 200);
	assert.equal(snapshot.isSensitive, true);
	assert.equal(snapshot.width, 1920);
	assert.equal(snapshot.height, 1080);
	assert.equal(snapshot.bgColor, "#123456");
	assert.equal(snapshot.slides.length, 1);
	assert.equal(snapshot.slides[0].layers[0].type, "text");
});

test("mappers are pure and do not mutate the source model", () => {
	const layer = createBaseLayer({ type: "text", id: 5, text: "immutable" }) as unknown as {
		text: string;
	};
	const before = layer.text;

	toLayerSnapshot(layer as unknown as Layer);

	assert.equal(layer.text, before);
});
