import { useMemo } from "react";
import type { Slide } from "../model/Slide";
import type { SlideSnapshot } from "../model/snapshot";
import { useSlideStore, type SlideCommandsUseCase } from "../state/slideStore";

/**
 * R3.9: `useSlide` hook — public API for slide-domain state + actions.
 *
 * 設計方針：
 * - 状態は `slideStore` selector で購読し、React の再レンダリングを駆動。
 * - 操作は `slideStore.commands`（R3.9a で注入された `SlideCommandsUseCase`）の
 *   メソッドへ委譲する。
 *
 * 利用例：
 *   const { state, actions } = useSlide();
 *   state.slides; state.selectedIndex; state.selectedSlide;
 *   actions.newSlide(); actions.deleteSelected();
 */

export type SlideHookState = {
	slides: readonly Slide[];
	slideSnapshots: readonly SlideSnapshot[];
	selectedIndex: number;
	selectedSlide: Slide | null;
};

export type SlideHookActions = SlideCommandsUseCase;

export type SlideHook = {
	state: SlideHookState;
	actions: SlideHookActions;
};

const noopActions: SlideHookActions = {
	newSlide: () => {},
	cloneSelected: () => {},
	addImageSlide: () => {},
	deleteSelected: () => {},
	moveSelectedBackward: () => {},
	moveSelectedForward: () => {},
	moveSelectedToIndex: () => {},
	toggleSelectedJoining: () => {},
	toggleAllJoining: () => {},
	unjoinAll: () => {},
	toggleSelectedDisabled: () => {},
	enableAll: () => {},
	disableAll: () => {},
	enableOnlySelected: () => {},
	deleteDisabled: () => {},
	setSelectedDurationRatio: () => {},
	selectPrevious: () => {},
	selectNext: () => {},
	selectByIndex: () => {},
	enterSelectMode: () => {},
	enterEditMode: () => {},
	closeEditMode: () => {},
};

/** React hook to access slide-domain state and actions. */
export function useSlide(): SlideHook {
	const slides = useSlideStore((s) => s.slides);
	const slideSnapshots = useSlideStore((s) => s.slideSnapshots);
	const selectedIndex = useSlideStore((s) => s.selectedIndex);
	const selectedSlide = useSlideStore((s) => s.selectedSlide);
	const commands = useSlideStore((s) => s.commands);

	const actions = useMemo<SlideHookActions>(() => {
		if (!commands) return noopActions;
		return {
			newSlide: () => commands.newSlide(),
			cloneSelected: () => commands.cloneSelected(),
			addImageSlide: (imageId, toIndex) => commands.addImageSlide(imageId, toIndex),
			deleteSelected: () => commands.deleteSelected(),
			moveSelectedBackward: () => commands.moveSelectedBackward(),
			moveSelectedForward: () => commands.moveSelectedForward(),
			moveSelectedToIndex: (toIndex) => commands.moveSelectedToIndex(toIndex),
			toggleSelectedJoining: () => commands.toggleSelectedJoining(),
			toggleAllJoining: () => commands.toggleAllJoining(),
			unjoinAll: () => commands.unjoinAll(),
			toggleSelectedDisabled: () => commands.toggleSelectedDisabled(),
			enableAll: () => commands.enableAll(),
			disableAll: () => commands.disableAll(),
			enableOnlySelected: () => commands.enableOnlySelected(),
			deleteDisabled: () => commands.deleteDisabled(),
			setSelectedDurationRatio: (ratio) => commands.setSelectedDurationRatio(ratio),
			selectPrevious: () => commands.selectPrevious(),
			selectNext: () => commands.selectNext(),
			selectByIndex: (index) => commands.selectByIndex(index),
			enterSelectMode: () => commands.enterSelectMode(),
			enterEditMode: () => commands.enterEditMode(),
			closeEditMode: () => commands.closeEditMode(),
		};
	}, [commands]);

	return {
		state: { slides, slideSnapshots, selectedIndex, selectedSlide },
		actions,
	};
}

/**
 * React 外文脈（keydown ハンドラ・bridge 互換層など）から slide action を呼ぶ用の helper。
 * `slideStore.getState().commands` の short-hand。バインド前は `null` を返す。
 */
export function getSlideActions(): SlideCommandsUseCase | null {
	return useSlideStore.getState().commands;
}
