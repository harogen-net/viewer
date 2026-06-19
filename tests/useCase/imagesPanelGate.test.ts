import assert from "node:assert/strict";
import test from "node:test";
import { canToggleImagesPanel, getImagesPanelOpenState } from "../../src/react/dialogState";

test("images panel stays closed when editing is disabled", () => {
	assert.equal(getImagesPanelOpenState(true, false), false);
	assert.equal(getImagesPanelOpenState(false, false), false);
});

test("images panel follows requested state when editing is enabled", () => {
	assert.equal(getImagesPanelOpenState(true, true), true);
	assert.equal(getImagesPanelOpenState(false, true), false);
});

test("images panel toggle follows edit gate", () => {
	assert.equal(canToggleImagesPanel(false), false);
	assert.equal(canToggleImagesPanel(true), true);
});
