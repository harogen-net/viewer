import assert from "node:assert/strict";
import test from "node:test";

import {
    getMainShellKeyboardAction,
    type MainShellKeyboardInput,
} from "../../src/react/mainShellKeyboard";

const baseInput: MainShellKeyboardInput = {
	code: "KeyA",
	metaKey: false,
	ctrlKey: false,
	shiftKey: false,
	mode: "edit",
	hasSelection: true,
	canUndo: true,
	canRedo: true,
	canEdit: true,
	isTypingTarget: false,
};

function action(overrides: Partial<MainShellKeyboardInput>) {
	return getMainShellKeyboardAction({ ...baseInput, ...overrides });
}

test("getMainShellKeyboardAction maps edit clipboard shortcuts", () => {
	assert.deepEqual(action({ code: "KeyC", metaKey: true }), {
		type: "copy",
		preventDefault: true,
	});
	assert.deepEqual(action({ code: "KeyX", ctrlKey: true }), {
		type: "cut",
		preventDefault: true,
	});
	assert.deepEqual(action({ code: "KeyV", metaKey: true, hasSelection: false }), {
		type: "paste",
		preventDefault: true,
	});
});

test("getMainShellKeyboardAction maps undo redo shortcuts and still prevents unavailable browser undo", () => {
	assert.deepEqual(action({ code: "KeyZ", metaKey: true }), {
		type: "undo",
		preventDefault: true,
	});
	assert.deepEqual(action({ code: "KeyZ", metaKey: true, shiftKey: true }), {
		type: "redo",
		preventDefault: true,
	});
	assert.deepEqual(action({ code: "KeyY", ctrlKey: true }), {
		type: "redo",
		preventDefault: true,
	});
	assert.deepEqual(action({ code: "KeyZ", metaKey: true, canUndo: false }), {
		type: "preventOnly",
		preventDefault: true,
	});
});

test("getMainShellKeyboardAction maps edit navigation and destructive shortcuts", () => {
	assert.deepEqual(action({ code: "Escape" }), {
		type: "enterSelectMode",
		preventDefault: true,
	});
	assert.deepEqual(action({ code: "Delete" }), {
		type: "removeSelectedLayer",
		preventDefault: true,
	});
	assert.deepEqual(action({ code: "ArrowLeft" }), {
		type: "nudgeLeft",
		preventDefault: true,
	});
	assert.deepEqual(action({ code: "ArrowDown" }), {
		type: "nudgeDown",
		preventDefault: true,
	});
});

test("getMainShellKeyboardAction ignores typing targets readonly mode and selection-only shortcuts", () => {
	assert.deepEqual(action({ code: "KeyC", metaKey: true, isTypingTarget: true }), {
		type: "none",
		preventDefault: false,
	});
	assert.deepEqual(action({ code: "KeyC", metaKey: true, mode: "select" }), {
		type: "none",
		preventDefault: false,
	});
	assert.deepEqual(action({ code: "KeyC", metaKey: true, canEdit: false }), {
		type: "none",
		preventDefault: false,
	});
	assert.deepEqual(action({ code: "Delete", hasSelection: false }), {
		type: "none",
		preventDefault: false,
	});
	assert.deepEqual(action({ code: "ArrowUp", hasSelection: false }), {
		type: "none",
		preventDefault: false,
	});
});