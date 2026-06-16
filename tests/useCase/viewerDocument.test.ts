import assert from "node:assert/strict";
import test from "node:test";

import type { Slide } from "../../src/model/Slide";
import { createViewerDocument } from "../../src/model/ViewerDocument";
import { slideStore } from "../../src/state/slideStore";

function createStubSlide(label: string): Slide & { label: string } {
	return { label, layers: [] } as Slide & { label: string };
}

test.beforeEach(() => {
	slideStore.getState().reset();
});

test.afterEach(() => {
	slideStore.getState().reset();
});

test("createViewerDocument returns plain data and does not mutate slideStore", () => {
	const slides = [createStubSlide("first"), createStubSlide("second")];
	const document = createViewerDocument(slides, {
		title: "loaded",
		createTime: 10,
		editTime: 20,
		width: 300,
		height: 200,
		bgColor: "#123456",
	});

	assert.equal(document.title, "loaded");
	assert.equal(document.createTime, 10);
	assert.equal(document.editTime, 20);
	assert.equal(document.width, 300);
	assert.equal(document.height, 200);
	assert.equal(document.bgColor, "#123456");
	assert.deepEqual(document.slides, slides);
	assert.deepEqual(slideStore.getState().slides, []);
});
