import type { KeyboardEvent, WheelEvent } from "react";

export type NumericInputOptions = {
	min?: number;
	max?: number;
};

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

export function getInputStep(
	baseStep: number,
	event: KeyboardEvent<HTMLInputElement> | WheelEvent<HTMLInputElement>
): number {
	if (event.shiftKey) return baseStep * 10;
	if (event.altKey) return baseStep / 10;
	return baseStep;
}