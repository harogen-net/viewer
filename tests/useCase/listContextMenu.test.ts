import assert from "node:assert/strict";
import test from "node:test";
import type { ListContextMenuState } from "../../src/react/listContextMenu";
import {
	canRunListContextMenuCommand,
	getListContextMenuState,
} from "../../src/react/listContextMenu";

test("list context menu is hidden when editing is disabled", () => {
	const requestedMenu: ListContextMenuState = { kind: "slide", top: 12, left: 34 };

	assert.equal(getListContextMenuState(requestedMenu, false), null);
});

test("list context menu uses requested position when editing is enabled", () => {
	const requestedMenu: ListContextMenuState = { kind: "list", top: 56, left: 78 };

	assert.deepEqual(getListContextMenuState(requestedMenu, true), requestedMenu);
});

test("list context menu commands follow edit gate", () => {
	assert.equal(canRunListContextMenuCommand(false), false);
	assert.equal(canRunListContextMenuCommand(true), true);
});
