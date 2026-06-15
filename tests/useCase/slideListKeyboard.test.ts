import assert from "node:assert/strict";
import test from "node:test";

import { getSlideListDropAction, getSlideListKeyboardAction } from "../../src/react/slideListKeyboard";

test("getSlideListKeyboardAction selects the focused slide with enter or space", () => {
	assert.deepEqual(
		getSlideListKeyboardAction({ key: "Enter", canEdit: true, slideIndex: 2, slideCount: 5 }),
		{ type: "select", index: 2, preventDefault: true }
	);
	assert.deepEqual(
		getSlideListKeyboardAction({ key: " ", canEdit: true, slideIndex: 1, slideCount: 5 }),
		{ type: "select", index: 1, preventDefault: true }
	);
});

test("getSlideListKeyboardAction moves selection with arrow keys and clamps boundaries", () => {
	assert.deepEqual(
		getSlideListKeyboardAction({ key: "ArrowUp", canEdit: true, slideIndex: 0, slideCount: 5 }),
		{ type: "select", index: 0, preventDefault: true }
	);
	assert.deepEqual(
		getSlideListKeyboardAction({ key: "ArrowDown", canEdit: true, slideIndex: 4, slideCount: 5 }),
		{ type: "select", index: 4, preventDefault: true }
	);
	assert.deepEqual(
		getSlideListKeyboardAction({ key: "ArrowRight", canEdit: true, slideIndex: 2, slideCount: 5 }),
		{ type: "select", index: 3, preventDefault: true }
	);
});

test("getSlideListKeyboardAction selects first and last slides with home and end", () => {
	assert.deepEqual(
		getSlideListKeyboardAction({ key: "Home", canEdit: true, slideIndex: 3, slideCount: 5 }),
		{ type: "select", index: 0, preventDefault: true }
	);
	assert.deepEqual(
		getSlideListKeyboardAction({ key: "End", canEdit: true, slideIndex: 1, slideCount: 5 }),
		{ type: "select", index: 4, preventDefault: true }
	);
});

test("getSlideListKeyboardAction maps modified arrows to move actions when editable", () => {
	assert.deepEqual(
		getSlideListKeyboardAction({
			key: "ArrowLeft",
			metaKey: true,
			canEdit: true,
			slideIndex: 2,
			slideCount: 5,
		}),
		{ type: "move", direction: -1, index: 2, preventDefault: true }
	);
	assert.deepEqual(
		getSlideListKeyboardAction({
			key: "ArrowRight",
			ctrlKey: true,
			canEdit: true,
			slideIndex: 2,
			slideCount: 5,
		}),
		{ type: "move", direction: 1, index: 2, preventDefault: true }
	);
});

test("getSlideListKeyboardAction rejects destructive shortcuts in readonly mode", () => {
	assert.deepEqual(
		getSlideListKeyboardAction({ key: "Delete", canEdit: false, slideIndex: 2, slideCount: 5 }),
		{ type: "none", preventDefault: false }
	);
	assert.deepEqual(
		getSlideListKeyboardAction({
			key: "ArrowRight",
			ctrlKey: true,
			canEdit: false,
			slideIndex: 2,
			slideCount: 5,
		}),
		{ type: "select", index: 3, preventDefault: true }
	);
});

test("getSlideListKeyboardAction ignores unknown keys and empty lists", () => {
	assert.deepEqual(
		getSlideListKeyboardAction({ key: "Escape", canEdit: true, slideIndex: 2, slideCount: 5 }),
		{ type: "none", preventDefault: false }
	);
	assert.deepEqual(
		getSlideListKeyboardAction({ key: "Enter", canEdit: true, slideIndex: 0, slideCount: 0 }),
		{ type: "none", preventDefault: false }
	);
});

test("getSlideListDropAction maps editable drag drop to move action", () => {
	assert.deepEqual(
		getSlideListDropAction({ canEdit: true, fromIndex: 0, toIndex: 3, slideCount: 5 }),
		{ type: "move", fromIndex: 0, toIndex: 3, preventDefault: true }
	);
	assert.deepEqual(
		getSlideListDropAction({ canEdit: true, fromIndex: 4, toIndex: 1, slideCount: 5 }),
		{ type: "move", fromIndex: 4, toIndex: 1, preventDefault: true }
	);
});

test("getSlideListDropAction rejects readonly invalid and same-index drops", () => {
	assert.deepEqual(
		getSlideListDropAction({ canEdit: false, fromIndex: 0, toIndex: 3, slideCount: 5 }),
		{ type: "none", preventDefault: false }
	);
	assert.deepEqual(
		getSlideListDropAction({ canEdit: true, fromIndex: null, toIndex: 3, slideCount: 5 }),
		{ type: "none", preventDefault: false }
	);
	assert.deepEqual(
		getSlideListDropAction({ canEdit: true, fromIndex: 2, toIndex: 2, slideCount: 5 }),
		{ type: "none", preventDefault: false }
	);
	assert.deepEqual(
		getSlideListDropAction({ canEdit: true, fromIndex: 1, toIndex: 2, slideCount: 0 }),
		{ type: "none", preventDefault: false }
	);
});