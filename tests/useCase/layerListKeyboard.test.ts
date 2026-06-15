import assert from "node:assert/strict";
import test from "node:test";

import { getLayerListDropAction, getLayerListKeyboardAction } from "../../src/react/layerListKeyboard";

test("getLayerListKeyboardAction selects the focused layer with enter or space", () => {
	assert.deepEqual(
		getLayerListKeyboardAction({ key: "Enter", canEdit: true, layerPosition: 2, layerCount: 5 }),
		{ type: "select", position: 2, preventDefault: true }
	);
	assert.deepEqual(
		getLayerListKeyboardAction({ key: " ", canEdit: true, layerPosition: 1, layerCount: 5 }),
		{ type: "select", position: 1, preventDefault: true }
	);
});

test("getLayerListKeyboardAction moves selection with arrows and clamps boundaries", () => {
	assert.deepEqual(
		getLayerListKeyboardAction({ key: "ArrowUp", canEdit: true, layerPosition: 0, layerCount: 5 }),
		{ type: "select", position: 0, preventDefault: true }
	);
	assert.deepEqual(
		getLayerListKeyboardAction({ key: "ArrowDown", canEdit: true, layerPosition: 4, layerCount: 5 }),
		{ type: "select", position: 4, preventDefault: true }
	);
	assert.deepEqual(
		getLayerListKeyboardAction({ key: "ArrowDown", canEdit: true, layerPosition: 2, layerCount: 5 }),
		{ type: "select", position: 3, preventDefault: true }
	);
});

test("getLayerListKeyboardAction supports home end rename and delete", () => {
	assert.deepEqual(
		getLayerListKeyboardAction({ key: "Home", canEdit: true, layerPosition: 3, layerCount: 5 }),
		{ type: "select", position: 0, preventDefault: true }
	);
	assert.deepEqual(
		getLayerListKeyboardAction({ key: "End", canEdit: true, layerPosition: 1, layerCount: 5 }),
		{ type: "select", position: 4, preventDefault: true }
	);
	assert.deepEqual(
		getLayerListKeyboardAction({ key: "F2", canEdit: true, layerPosition: 1, layerCount: 5 }),
		{ type: "rename", position: 1, preventDefault: true }
	);
	assert.deepEqual(
		getLayerListKeyboardAction({ key: "Delete", canEdit: true, layerPosition: 1, layerCount: 5 }),
		{ type: "delete", position: 1, preventDefault: true }
	);
});

test("getLayerListKeyboardAction maps modified arrows to move actions", () => {
	assert.deepEqual(
		getLayerListKeyboardAction({
			key: "ArrowUp",
			metaKey: true,
			canEdit: true,
			layerPosition: 2,
			layerCount: 5,
		}),
		{ type: "move", direction: -1, position: 2, preventDefault: true }
	);
	assert.deepEqual(
		getLayerListKeyboardAction({
			key: "ArrowDown",
			ctrlKey: true,
			canEdit: true,
			layerPosition: 2,
			layerCount: 5,
		}),
		{ type: "move", direction: 1, position: 2, preventDefault: true }
	);
});

test("getLayerListKeyboardAction rejects modified arrow moves in readonly mode", () => {
	assert.deepEqual(
		getLayerListKeyboardAction({
			key: "ArrowDown",
			ctrlKey: true,
			canEdit: false,
			layerPosition: 2,
			layerCount: 5,
		}),
		{ type: "none", preventDefault: false }
	);
});

test("getLayerListKeyboardAction rejects edits in readonly mode", () => {
	assert.deepEqual(
		getLayerListKeyboardAction({ key: "Enter", canEdit: false, layerPosition: 2, layerCount: 5 }),
		{ type: "none", preventDefault: false }
	);
	assert.deepEqual(
		getLayerListKeyboardAction({ key: "Delete", canEdit: false, layerPosition: 2, layerCount: 5 }),
		{ type: "none", preventDefault: false }
	);
});

test("getLayerListKeyboardAction ignores unknown keys and empty lists", () => {
	assert.deepEqual(
		getLayerListKeyboardAction({ key: "Escape", canEdit: true, layerPosition: 2, layerCount: 5 }),
		{ type: "none", preventDefault: false }
	);
	assert.deepEqual(
		getLayerListKeyboardAction({ key: "Enter", canEdit: true, layerPosition: 0, layerCount: 0 }),
		{ type: "none", preventDefault: false }
	);
});

test("getLayerListDropAction maps editable drag drop to move action", () => {
	assert.deepEqual(
		getLayerListDropAction({ canEdit: true, fromPosition: 0, toPosition: 3, layerCount: 5 }),
		{ type: "move", fromPosition: 0, toPosition: 3, preventDefault: true }
	);
	assert.deepEqual(
		getLayerListDropAction({ canEdit: true, fromPosition: 4, toPosition: 1, layerCount: 5 }),
		{ type: "move", fromPosition: 4, toPosition: 1, preventDefault: true }
	);
});

test("getLayerListDropAction rejects readonly invalid and same-position drops", () => {
	assert.deepEqual(
		getLayerListDropAction({ canEdit: false, fromPosition: 0, toPosition: 3, layerCount: 5 }),
		{ type: "none", preventDefault: false }
	);
	assert.deepEqual(
		getLayerListDropAction({ canEdit: true, fromPosition: null, toPosition: 3, layerCount: 5 }),
		{ type: "none", preventDefault: false }
	);
	assert.deepEqual(
		getLayerListDropAction({ canEdit: true, fromPosition: 2, toPosition: 2, layerCount: 5 }),
		{ type: "none", preventDefault: false }
	);
	assert.deepEqual(
		getLayerListDropAction({ canEdit: true, fromPosition: 1, toPosition: 2, layerCount: 0 }),
		{ type: "none", preventDefault: false }
	);
});