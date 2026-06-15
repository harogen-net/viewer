import assert from "node:assert/strict";
import test from "node:test";

import { getLayerListKeyboardAction } from "../../src/react/layerListKeyboard";

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