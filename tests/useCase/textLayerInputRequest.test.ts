import assert from "node:assert/strict";
import test from "node:test";
import type { TextLayerInputRequest } from "../../src/react/textLayerInputRequest";
import { getTextLayerInputRequestState } from "../../src/react/textLayerInputRequest";

test("text layer input request is hidden outside editable edit mode", () => {
	const request: TextLayerInputRequest = { open: true };

	assert.equal(getTextLayerInputRequestState(request, false, true), null);
	assert.equal(getTextLayerInputRequestState(request, true, false), null);
});

test("text layer input request opens in editable edit mode", () => {
	assert.deepEqual(getTextLayerInputRequestState({ open: true }, true, true), { open: true });
});

test("text layer input request rejects empty requests", () => {
	assert.equal(getTextLayerInputRequestState({ open: false }, true, true), null);
	assert.equal(getTextLayerInputRequestState(null, true, true), null);
});
