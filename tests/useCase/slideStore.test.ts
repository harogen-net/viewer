import assert from "node:assert/strict";
import test from "node:test";

import type { Slide } from "../../src/model/Slide";
import { slideStore } from "../../src/state/slideStore";

type StubSlide = Slide & { label: string };

function createStubSlide(label: string): StubSlide {
	return {
		label,
		layers: [],
		removeAllLayers() {},
		clearEventListener() {},
	} as StubSlide;
}

test.beforeEach(() => {
	slideStore.getState().reset();
});

test.afterEach(() => {
	slideStore.getState().reset();
});

test("slideStore keeps selection when removing an unselected slide", () => {
	const [firstSlide, secondSlide, thirdSlide] = [
		createStubSlide("first"),
		createStubSlide("second"),
		createStubSlide("third"),
	];
	slideStore.getState().setSlides([firstSlide, secondSlide, thirdSlide], 1);

	slideStore.getState().removeSlide(firstSlide);

	assert.equal(slideStore.getState().selectedSlide, secondSlide);
	assert.equal(slideStore.getState().selectedIndex, 0);
	assert.deepEqual(slideStore.getState().slides, [secondSlide, thirdSlide]);
});

test("slideStore selects a neighbor when removing the selected slide", () => {
	const [firstSlide, secondSlide, thirdSlide] = [
		createStubSlide("first"),
		createStubSlide("second"),
		createStubSlide("third"),
	];
	slideStore.getState().setSlides([firstSlide, secondSlide, thirdSlide], 1);

	slideStore.getState().removeSlide(secondSlide);

	assert.equal(slideStore.getState().selectedSlide, thirdSlide);
	assert.equal(slideStore.getState().selectedIndex, 1);
	assert.deepEqual(slideStore.getState().slides, [firstSlide, thirdSlide]);
});

test("slideStore clears selection when the selected last slide is removed", () => {
	const slide = createStubSlide("only");
	slideStore.getState().setSlides([slide], 0);

	slideStore.getState().removeSlide(slide);

	assert.equal(slideStore.getState().selectedSlide, null);
	assert.equal(slideStore.getState().selectedIndex, -1);
	assert.deepEqual(slideStore.getState().slides, []);
});
