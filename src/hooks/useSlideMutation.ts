import { EditCapability } from "@/state/viewerModeStore";
import type { NewLayer } from "@/utils/layerOps";
import * as slideOps from "@/utils/slideOps";
import { useMemo } from "react";
import { useDocumentMutation } from "./useDocumentMutation";

// Slide 階層の consumer facade (v4 Group C)。
// useDocumentMutation.applySlideChange に slideOps 純関数を注入するだけの薄 wrapper。
// SlideListPanel などはこの hook 経由で mutation を行う (store を直接 mutate しない)。
//
// 有効/無効・表示尺・結合は SLIDE_PLAYBACK 種別で渡し、VIEW モード (スマホ) でも通す。
// いずれもスライドもレイヤーも消さず、スライドショーの見え方しか変えないため。
// 追加/削除/複製/並び替えと一括操作 (setAll* / enableOnly / deleteAllDisabled) は既定の
// FULL のまま = VIEW では拒否される。一括操作は 1 タップの影響範囲が全スライドに及ぶため。

export interface UseSlideMutation {
	moveSlide: (from: number, to: number) => void;
	addSlide: (width: number, height: number, atIndex?: number) => void;
	/** 画像 1 枚を持つ新規 slide を末尾に追加 (D-12、drop で生成)。 */
	addImageSlide: (width: number, height: number, layer: NewLayer) => void;
	deleteSlide: (index: number) => void;
	duplicateSlide: (index: number) => void;
	setSlideJoining: (index: number, joining: boolean) => void;
	setSlideDisabled: (index: number, disabled: boolean) => void;
	setAllJoining: (joining: boolean) => void;
	setAllDisabled: (disabled: boolean) => void;
	/** 対象 slide のみ有効化し、それ以外を無効化する。 */
	enableOnly: (index: number) => void;
	deleteAllDisabled: () => void;
	setSlideDurationRatio: (index: number, ratio: number) => void;
	incrementSlideDurationRatio: (index: number) => void;
	decrementSlideDurationRatio: (index: number) => void;
}

export const useSlideMutation = (): UseSlideMutation => {
	const { applySlideChange } = useDocumentMutation();
	// applySlideChange は stable (useDocumentMutation 内 useCallback [])。全 method は
	// それに slideOps 純関数を注入するだけの薄 wrapper なので useMemo で 1 度だけ生成する。
	return useMemo<UseSlideMutation>(
		() => ({
			moveSlide: (from, to) =>
				applySlideChange("move slide", (s) => slideOps.moveSlide(s, from, to)),
			addSlide: (width, height, atIndex) =>
				applySlideChange("add slide", (s) => slideOps.addSlide(s, width, height, atIndex)),
			addImageSlide: (width, height, layer) =>
				applySlideChange("add image slide", (s) => slideOps.addImageSlide(s, width, height, layer)),
			deleteSlide: (index) =>
				applySlideChange("delete slide", (s) => slideOps.deleteSlide(s, index)),
			duplicateSlide: (index) =>
				applySlideChange("duplicate slide", (s) => slideOps.duplicateSlide(s, index)),
			setSlideJoining: (index, joining) =>
				applySlideChange(
					joining ? "join slide" : "split slide",
					(s) => slideOps.setSlideJoining(s, index, joining),
					EditCapability.SLIDE_PLAYBACK
				),
			setSlideDisabled: (index, disabled) =>
				applySlideChange(
					disabled ? "disable slide" : "enable slide",
					(s) => slideOps.setSlideDisabled(s, index, disabled),
					EditCapability.SLIDE_PLAYBACK
				),
			setAllJoining: (joining) =>
				applySlideChange(joining ? "join all slides" : "split all slides", (s) =>
					slideOps.setAllJoining(s, joining)
				),
			setAllDisabled: (disabled) =>
				applySlideChange(disabled ? "disable all slides" : "enable all slides", (s) =>
					slideOps.setAllDisabled(s, disabled)
				),
			enableOnly: (index) =>
				applySlideChange("enable only slide", (s) => slideOps.enableOnly(s, index)),
			deleteAllDisabled: () =>
				applySlideChange("delete disabled slides", (s) => slideOps.deleteAllDisabled(s)),
			setSlideDurationRatio: (index, ratio) =>
				applySlideChange(
					"set duration ratio",
					(s) => slideOps.setSlideDurationRatio(s, index, ratio),
					EditCapability.SLIDE_PLAYBACK
				),
			incrementSlideDurationRatio: (index) =>
				applySlideChange(
					"duration up",
					(s) => slideOps.incrementSlideDurationRatio(s, index),
					EditCapability.SLIDE_PLAYBACK
				),
			decrementSlideDurationRatio: (index) =>
				applySlideChange(
					"duration down",
					(s) => slideOps.decrementSlideDurationRatio(s, index),
					EditCapability.SLIDE_PLAYBACK
				),
		}),
		[applySlideChange]
	);
};
