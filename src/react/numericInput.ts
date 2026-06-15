import type { KeyboardEvent, WheelEvent } from "react";

export type NumericInputOptions = {
	min?: number;
	max?: number;
};

export type ClipSide = "top" | "right" | "bottom" | "left";
export type ClipInputValues = Record<ClipSide, string>;
export type ClipValues = Record<ClipSide, number>;

type NumericInputStepEvent = Pick<
	KeyboardEvent<HTMLInputElement> | WheelEvent<HTMLInputElement>,
	"altKey" | "shiftKey"
>;

type NumericInputWheelEvent = NumericInputStepEvent & Pick<WheelEvent<HTMLInputElement>, "deltaY">;

export function clampNumericValue(value: number, options: NumericInputOptions = {}): number {
	const min = options.min ?? -Infinity;
	const max = options.max ?? Infinity;
	return Math.min(max, Math.max(min, value));
}

export function getAdjustedNumericValue(
	value: string,
	fallback: number,
	delta: number,
	options?: NumericInputOptions
): number {
	const trimmedValue = value.trim();
	const currentValue = trimmedValue === "" ? NaN : Number(trimmedValue);
	const baseValue = Number.isFinite(currentValue) ? currentValue : fallback;
	return clampNumericValue(baseValue + delta, options);
}

export function getInputStep(baseStep: number, event: NumericInputStepEvent): number {
	if (event.shiftKey) return baseStep * 10;
	if (event.altKey) return baseStep / 10;
	return baseStep;
}

export function getWheelInputDelta(baseStep: number, event: NumericInputWheelEvent): number {
	const direction = event.deltaY < 0 ? 1 : -1;
	return getInputStep(baseStep, event) * direction;
}

function getNumericInputValue(value: string): number | null {
	const currentValue = Number(value);
	return Number.isFinite(currentValue) ? currentValue : null;
}

function getNumericInputBase(value: string, fallback: number): number {
	const trimmedValue = value.trim();
	const currentValue = trimmedValue === "" ? NaN : Number(trimmedValue);
	return Number.isFinite(currentValue) ? currentValue : fallback;
}

export function getClipValuesFromInputs(inputs: ClipInputValues): ClipValues | null {
	const top = getNumericInputValue(inputs.top);
	const right = getNumericInputValue(inputs.right);
	const bottom = getNumericInputValue(inputs.bottom);
	const left = getNumericInputValue(inputs.left);
	if (top == null || right == null || bottom == null || left == null) return null;
	return { top, right, bottom, left };
}

export function getAdjustedClipValues(
	inputs: ClipInputValues,
	fallbacks: ClipValues,
	side: ClipSide,
	delta: number
): ClipValues {
	const next = {
		top: getNumericInputBase(inputs.top, fallbacks.top),
		right: getNumericInputBase(inputs.right, fallbacks.right),
		bottom: getNumericInputBase(inputs.bottom, fallbacks.bottom),
		left: getNumericInputBase(inputs.left, fallbacks.left),
	};
	next[side] = getAdjustedNumericValue(inputs[side], fallbacks[side], delta, { min: 0 });
	return next;
}