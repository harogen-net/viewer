import assert from "node:assert/strict";
import test from "node:test";
import type { SharedLayerRemovalRequest } from "../../src/react/sharedLayerRemovalRequest";
import { getSharedLayerRemovalRequestState } from "../../src/react/sharedLayerRemovalRequest";

test("shared layer removal request is hidden without edit permission or selection", () => {
	const request: SharedLayerRemovalRequest = { layerName: "Title" };

	assert.equal(getSharedLayerRemovalRequestState(request, false, true), null);
	assert.equal(getSharedLayerRemovalRequestState(request, true, false), null);
});

test("shared layer removal request is shown when editable layer is selected", () => {
	const request: SharedLayerRemovalRequest = { layerName: "Title" };

	assert.deepEqual(getSharedLayerRemovalRequestState(request, true, true), request);
});

test("shared layer removal request falls back to generic layer name", () => {
	assert.deepEqual(getSharedLayerRemovalRequestState({ layerName: "   " }, true, true), {
		layerName: "selected layer",
	});
	assert.equal(getSharedLayerRemovalRequestState(null, true, true), null);
});
