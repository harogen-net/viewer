import { useMemo } from "react";
import {
    useViewerSlideshowPlayback,
    useViewerSlideshowSettings,
} from "../bridge/useViewerBridge";
import { useViewerDocument } from "./useViewerDocument";

/**
 * R3.12: `useSlideshow` hook — スライドショーの設定・再生状態・操作を集約した束ね hook。
 *
 * 内部では `viewerDocumentStore` の slideshow 系 action と `uiStore.slideshowSettings` /
 * `uiStore.slideshowPlayback` 購読を結び付け、React コンポーネントから命令的な
 * `SlideShowRuntime` インスタンスへ直接触れずに済むよう中継する。
 */

export type SlideshowHookSettings = {
	duration: number;
	interval: number;
	bgColor: string;
	fullscreen: boolean;
	mirrorH: boolean;
	mirrorV: boolean;
};

export type SlideshowHookPlayback = {
	isRun: boolean;
	isPause: boolean;
};

export type SlideshowHookActions = {
	start: () => void;
	stop: () => void;
	togglePause: () => void;
	showPrevious: () => void;
	showNext: () => void;
	setFullscreen: (value: boolean) => void;
	setMirrorH: (value: boolean) => void;
	setMirrorV: (value: boolean) => void;
	setDuration: (value: number) => void;
	setInterval: (value: number) => void;
	setBackgroundColor: (value: string) => void;
};

export type SlideshowHook = {
	settings: SlideshowHookSettings;
	playback: SlideshowHookPlayback;
	actions: SlideshowHookActions;
};

export function useSlideshow(): SlideshowHook {
	const settings = useViewerSlideshowSettings();
	const playback = useViewerSlideshowPlayback();
	const { actions: docActions } = useViewerDocument();

	const actions = useMemo<SlideshowHookActions>(
		() => ({
			start: () => docActions.startSlideshow(),
			stop: () => docActions.stopSlideshow(),
			togglePause: () => docActions.toggleSlideshowPause(),
			showPrevious: () => docActions.showPreviousSlide(),
			showNext: () => docActions.showNextSlide(),
			setFullscreen: (value) => docActions.setFullscreen(value),
			setMirrorH: (value) => docActions.setMirrorH(value),
			setMirrorV: (value) => docActions.setMirrorV(value),
			setDuration: (value) => docActions.setSlideShowDuration(value),
			setInterval: (value) => docActions.setSlideShowInterval(value),
			setBackgroundColor: (value) => docActions.setBackgroundColor(value),
		}),
		[docActions]
	);

	return { settings, playback, actions };
}
