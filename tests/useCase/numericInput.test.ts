import assert from "node:assert/strict";
import test from "node:test";

import {
    clampNumericValue,
    getAdjustedClipValues,
    getAdjustedNumericValue,
    getClipValuesFromInputs,
    getInputStep,
    getWheelInputDelta,
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

test("getClipValuesFromInputs parses all four clip sides", () => {
	assert.deepEqual(
		getClipValuesFromInputs({ top: "1", right: "2.5", bottom: "", left: " 4 " }),
		{ top: 1, right: 2.5, bottom: 0, left: 4 }
	);
});

test("getClipValuesFromInputs rejects invalid clip sides", () => {
	assert.equal(
		getClipValuesFromInputs({ top: "1", right: "nope", bottom: "3", left: "4" }),
		null
	);
});

test("getAdjustedClipValues adjusts one side and preserves parsed inputs", () => {
	assert.deepEqual(
		getAdjustedClipValues(
			{ top: "1", right: "2", bottom: "3", left: "4" },
			{ top: 10, right: 20, bottom: 30, left: 40 },
			"right",
			5
		),
		{ top: 1, right: 7, bottom: 3, left: 4 }
	);
});

test("getAdjustedClipValues falls back for invalid inputs and clamps adjusted side", () => {
	assert.deepEqual(
		getAdjustedClipValues(
			{ top: "", right: "abc", bottom: "6", left: " " },
			{ top: 10, right: 20, bottom: 30, left: 40 },
			"left",
			-50
		),
		{ top: 10, right: 20, bottom: 6, left: 0 }
	);
});

test("getInputStep supports shift and alt modifiers", () => {
	assert.equal(getInputStep(2, { shiftKey: false, altKey: false } as never), 2);
	assert.equal(getInputStep(2, { shiftKey: true, altKey: false } as never), 20);
	assert.equal(getInputStep(2, { shiftKey: false, altKey: true } as never), 0.2);
});

test("getWheelInputDelta maps wheel direction and modifiers to numeric deltas", () => {
	assert.equal(
		getWheelInputDelta(2, { deltaY: -1, shiftKey: false, altKey: false } as never),
		2
	);
	assert.equal(
		getWheelInputDelta(2, { deltaY: 1, shiftKey: false, altKey: false } as never),
		-2
	);
	assert.equal(
		getWheelInputDelta(2, { deltaY: -1, shiftKey: true, altKey: false } as never),
		20
	);
	assert.equal(
		getWheelInputDelta(2, { deltaY: 1, shiftKey: false, altKey: true } as never),
		-0.2
	);
});
