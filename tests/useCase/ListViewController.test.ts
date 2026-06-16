import assert from "node:assert/strict";
import test from "node:test";

import type { Slide } from "../../src/model/Slide";

type StubSlide = Slide & { label: string };

function createStubSlide(label: string): StubSlide {
	return {
		label,
		removeAllLayers() {},
		clearEventListener() {},
	} as StubSlide;
}

async function createListViewFixture() {
	const { ListViewController } = await import("../../src/viewController/ListViewController");
	return {
		controller: new ListViewController(true),
		slides: [createStubSlide("first"), createStubSlide("second"), createStubSlide("third")],
	};
}

test("ListViewController keeps selection when removing an unselected slide", async () => {
	const { controller, slides } = await createListViewFixture();
	const [firstSlide, secondSlide, thirdSlide] = slides;
	controller.slides = slides;
	controller.selectSlideInstance(secondSlide);

	let closeCount = 0;
	controller.addEventListener("close", () => {
		closeCount += 1;
	});

	controller.removeSlide(firstSlide, false, false);

	assert.equal(controller.selectedSlide, secondSlide);
	assert.equal(controller.selectedSlideIndex, 0);
	assert.deepEqual(controller.slides, [secondSlide, thirdSlide]);
	assert.equal(closeCount, 0);
});

test("ListViewController selects a neighbor when removing the selected slide", async () => {
	const { controller, slides } = await createListViewFixture();
	const [firstSlide, secondSlide, thirdSlide] = slides;
	controller.slides = slides;
	controller.selectSlideInstance(secondSlide);

	let closeCount = 0;
	controller.addEventListener("close", () => {
		closeCount += 1;
	});

	controller.removeSlide(secondSlide, false, false);

	assert.equal(controller.selectedSlide, thirdSlide);
	assert.equal(controller.selectedSlideIndex, 1);
	assert.deepEqual(controller.slides, [firstSlide, thirdSlide]);
	assert.equal(closeCount, 0);
});

test("ListViewController emits close only when the selected last slide is removed", async () => {
	const { controller, slides } = await createListViewFixture();
	controller.slides = [slides[0]];
	controller.selectSlideInstance(slides[0]);

	let closeCount = 0;
	controller.addEventListener("close", () => {
		closeCount += 1;
	});

	controller.removeSlide(slides[0], false, false);

	assert.equal(controller.selectedSlide, null);
	assert.equal(controller.selectedSlideIndex, -1);
	assert.deepEqual(controller.slides, []);
	assert.equal(closeCount, 1);
});
