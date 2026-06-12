import assert from "node:assert/strict";
import test from "node:test";

import {
    clampNumericValue,
    getAdjustedNumericValue,
    getInputStep,
} from "../../src/react/numericInput";

test("clampNumericValue clamps values to optional min and max", () => {
	assert.equal(clampNumericValue(-1, { min: 0, max: 10 }), 0);
	assert.equal(clampNumericValue(11, { min: 0, max: 10 }), 10);
	assert.equal(clampNumericValue(5, { min: 0, max: 10 }), 5);
});

test("getAdjustedNumericValue uses parsed input when it is numeric", () => {
	assert.equal(getAdjustedNumericValue("10", 3, 2), 12);
});

test("getAdjustedNumericValue falls back when input is not numeric", () => {
	assert.equal(getAdjustedNumericValue("", 3, 2), 5);
	assert.equal(getAdjustedNumericValue("   ", 3, 2), 5);
	assert.equal(getAdjustedNumericValue("abc", 3, 2), 5);
});

test("getAdjustedNumericValue applies clamp options after adjustment", () => {
	assert.equal(getAdjustedNumericValue("0.9", 1, 0.2, { min: 0, max: 1 }), 1);
	assert.equal(getAdjustedNumericValue("0.1", 1, -0.2, { min: 0, max: 1 }), 0);
});

test("getInputStep supports shift and alt modifiers", () => {
	assert.equal(getInputStep(2, { shiftKey: false, altKey: false } as never), 2);
	assert.equal(getInputStep(2, { shiftKey: true, altKey: false } as never), 20);
	assert.equal(getInputStep(2, { shiftKey: false, altKey: true } as never), 0.2);
});
