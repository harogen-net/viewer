import type { KeyboardEvent, WheelEvent } from "react";

export type NumericInputOptions = {
	min?: number;
	max?: number;
};

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