import assert from "node:assert/strict";
import test from "node:test";
import type { SpreadLayerRequest } from "../../src/react/spreadLayerRequest";
import { getSpreadLayerRequestState } from "../../src/react/spreadLayerRequest";

test("spread layer request is hidden without edit permission or selection", () => {
	const request: SpreadLayerRequest = { layerName: "Title" };

	assert.equal(getSpreadLayerRequestState(request, false, true), null);
	assert.equal(getSpreadLayerRequestState(request, true, false), null);
});

test("spread layer request is shown when editable layer is selected", () => {
	const request: SpreadLayerRequest = { layerName: "Title" };

	assert.deepEqual(getSpreadLayerRequestState(request, true, true), request);
});

test("spread layer request falls back to generic layer name", () => {
	assert.deepEqual(getSpreadLayerRequestState({ layerName: "   " }, true, true), {
		layerName: "selected layer",
	});
	assert.equal(getSpreadLayerRequestState(null, true, true), null);
});
