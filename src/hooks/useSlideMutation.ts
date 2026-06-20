import { useCallback } from "react";
import * as slideOps from "../utils/slideOps";
import { useDocumentMutation } from "./useDocumentMutation";

// Slide 階層の consumer facade (v4 Group C)。
// useDocumentMutation.applySlideChange に slideOps 純関数を注入するだけの薄 wrapper。
// SlideListPanel などはこの hook 経由で mutation を行う (store を直接 mutate しない)。

export interface UseSlideMutation {
	moveSlide: (from: number, to: number) => void;
	addSlide: (width: number, height: number, atIndex?: number) => void;
	deleteSlide: (index: number) => void;
	duplicateSlide: (index: number) => void;
	setSlideJoining: (index: number, joining: boolean) => void;
	setSlideDisabled: (index: number, disabled: boolean) => void;
	setAllJoining: (joining: boolean) => void;
	setAllDisabled: (disabled: boolean) => void;
	deleteAllDisabled: () => void;
}

export const useSlideMutation = (): UseSlideMutation => {
	const { applySlideChange } = useDocumentMutation();

	const moveSlide = useCallback(
		(from: number, to: number) =>
			applySlideChange("move slide", (s) => slideOps.moveSlide(s, from, to)),
		[applySlideChange],
	);
	const addSlide = useCallback(
		(width: number, height: number, atIndex?: number) =>
			applySlideChange("add slide", (s) => slideOps.addSlide(s, width, height, atIndex)),
		[applySlideChange],
	);
	const deleteSlide = useCallback(
		(index: number) =>
			applySlideChange("delete slide", (s) => slideOps.deleteSlide(s, index)),
		[applySlideChange],
	);
	const duplicateSlide = useCallback(
		(index: number) =>
			applySlideChange("duplicate slide", (s) => slideOps.duplicateSlide(s, index)),
		[applySlideChange],
	);
	const setSlideJoining = useCallback(
		(index: number, joining: boolean) =>
			applySlideChange(
				joining ? "join slide" : "split slide",
				(s) => slideOps.setSlideJoining(s, index, joining),
			),
		[applySlideChange],
	);
	const setSlideDisabled = useCallback(
		(index: number, disabled: boolean) =>
			applySlideChange(
				disabled ? "disable slide" : "enable slide",
				(s) => slideOps.setSlideDisabled(s, index, disabled),
			),
		[applySlideChange],
	);
	const setAllJoining = useCallback(
		(joining: boolean) =>
			applySlideChange(
				joining ? "join all slides" : "split all slides",
				(s) => slideOps.setAllJoining(s, joining),
			),
		[applySlideChange],
	);
	const setAllDisabled = useCallback(
		(disabled: boolean) =>
			applySlideChange(
				disabled ? "disable all slides" : "enable all slides",
				(s) => slideOps.setAllDisabled(s, disabled),
			),
		[applySlideChange],
	);
	const deleteAllDisabled = useCallback(
		() => applySlideChange("delete disabled slides", (s) => slideOps.deleteAllDisabled(s)),
		[applySlideChange],
	);

	return {
		moveSlide,
		addSlide,
		deleteSlide,
		duplicateSlide,
		setSlideJoining,
		setSlideDisabled,
		setAllJoining,
		setAllDisabled,
		deleteAllDisabled,
	};
};
