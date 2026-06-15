import assert from "node:assert/strict";
import test from "node:test";
import { canRequestSaveChoice, getSaveChoiceOpenState } from "../../src/react/saveDocumentChoice";

test("save choice requires save permission and at least one slide", () => {
	assert.equal(canRequestSaveChoice(false, 1), false);
	assert.equal(canRequestSaveChoice(true, 0), false);
	assert.equal(canRequestSaveChoice(true, 1), true);
});

test("save choice closes when permission or slides are unavailable", () => {
	assert.equal(getSaveChoiceOpenState(true, false, 1), false);
	assert.equal(getSaveChoiceOpenState(true, true, 0), false);
	assert.equal(getSaveChoiceOpenState(false, true, 1), false);
});

test("save choice stays open for valid save request", () => {
	assert.equal(getSaveChoiceOpenState(true, true, 2), true);
});
