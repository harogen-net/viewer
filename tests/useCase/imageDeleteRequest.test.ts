import assert from "node:assert/strict";
import test from "node:test";
import type { ImageDeleteRequest } from "../../src/react/dialogState";
import { getImageDeleteRequestState } from "../../src/react/dialogState";

test("image delete request is hidden outside editable images panel", () => {
	const request: ImageDeleteRequest = { imageId: "img-1", name: "sample.png" };

	assert.equal(getImageDeleteRequestState(request, false, true), null);
	assert.equal(getImageDeleteRequestState(request, true, false), null);
});

test("image delete request is shown for editable images panel", () => {
	const request: ImageDeleteRequest = { imageId: "img-1", name: "sample.png" };

	assert.deepEqual(getImageDeleteRequestState(request, true, true), request);
});

test("image delete request rejects empty ids", () => {
	assert.equal(getImageDeleteRequestState({ imageId: "", name: "sample.png" }, true, true), null);
	assert.equal(getImageDeleteRequestState(null, true, true), null);
});
