import { Slide } from "../model/Slide";
import { type SlideShowRuntimeHandle } from "../runtime/SlideshowShell";
import { ViewerMode } from "../runtime/viewerMode";
import { uiStore } from "../state/uiStore";
import { viewerDocumentStore } from "../state/viewerDocumentStore";

/**
 * Dependencies the slideshow use case needs from the surrounding viewer.
 * Kept narrow so the use case can be tested or relocated independently of Viewer.
 */
export type SlideshowUseCaseDeps = {
	runtime: SlideShowRuntimeHandle;
	getSlides: () => readonly Slide[];
	getSelectedSlideIndex: () => number;
	getMode: () => ViewerMode;
	setMode: (mode: ViewerMode) => void;
};

export type SlideshowUseCase = {
	setDuration(duration: number): void;
	setInterval(interval: number): void;
	setBgColor(color: string): void;
	setFullscreen(enabled: boolean): void;
	setMirrorH(enabled: boolean): void;
	setMirrorV(enabled: boolean): void;
	/** Push current uiStore slideshowSettings into the runtime (used after document load). */
	syncRuntimeFlags(): void;
	start(): void;
	stop(): void;
	togglePause(): void;
	showPrevious(): void;
	showNext(): void;
	/** Wired as `onPlaybackChanged` of the slideshow runtime. */
	handlePlaybackChanged(isRun: boolean, isPause: boolean): void;
};

export function createSlideshowUseCase(deps: SlideshowUseCaseDeps): SlideshowUseCase {
	const { runtime, getSlides, getSelectedSlideIndex, getMode, setMode } = deps;

	let modeBeforeSlideshow: ViewerMode | null = null;

	const updateSettings = (patch: Partial<{
		duration: number;
		interval: number;
		bgColor: string;
		fullscreen: boolean;
		mirrorH: boolean;
		mirrorV: boolean;
	}>): void => {
		const current = uiStore.getState().slideshowSettings;
		uiStore.getState().setSlideshowSettings({ ...current, ...patch });
	};

	const buildSlides = (): { slides: Slide[]; startIndex: number } => {
		const sourceSlides = getSlides();
		const selectedIndex = getSelectedSlideIndex();
		const slides: Slide[] = [];
		let startIndex = 0;
		for (let i = 0; i < sourceSlides.length; i++) {
			const slide = sourceSlides[i];
			if (slide.disabled) continue;
			slides.push(slide.clone());
			if (i === selectedIndex) startIndex = slides.length - 1;
		}
		return { slides, startIndex };
	};

	const useCase: SlideshowUseCase = {
		setDuration(duration) {
			updateSettings({ duration });
		},
		setInterval(interval) {
			updateSettings({ interval });
		},
		setBgColor(color) {
			updateSettings({ bgColor: color });
			viewerDocumentStore.getState().setDocumentMeta({ bgColor: color });
		},
		setFullscreen(enabled) {
			updateSettings({ fullscreen: enabled });
			runtime.fullscreen = enabled;
		},
		setMirrorH(enabled) {
			updateSettings({ mirrorH: enabled });
			runtime.mirrorH = enabled;
		},
		setMirrorV(enabled) {
			updateSettings({ mirrorV: enabled });
			runtime.mirrorV = enabled;
		},
		syncRuntimeFlags() {
			const { fullscreen, mirrorH, mirrorV } = uiStore.getState().slideshowSettings;
			runtime.fullscreen = fullscreen;
			runtime.mirrorH = mirrorH;
			runtime.mirrorV = mirrorV;
		},
		start() {
			const { slides, startIndex } = buildSlides();
			if (slides.length === 0) return;
			const { duration, interval } = uiStore.getState().slideshowSettings;
			runtime.setUp(slides, { duration, interval });
			runtime.run(startIndex);
		},
		stop() {
			runtime.close();
		},
		togglePause() {
			runtime.togglePause();
		},
		showPrevious() {
			runtime.showPrevious();
		},
		showNext() {
			runtime.showNext();
		},
		handlePlaybackChanged(isRun, isPause) {
			uiStore.getState().setSlideshowPlayback({ isRun, isPause });
			if (isRun) {
				if (getMode() !== ViewerMode.SLIDESHOW) {
					modeBeforeSlideshow = getMode() ?? ViewerMode.SELECT;
					setMode(ViewerMode.SLIDESHOW);
				}
				return;
			}
			if (getMode() === ViewerMode.SLIDESHOW) {
				setMode(modeBeforeSlideshow ?? ViewerMode.SELECT);
			}
			modeBeforeSlideshow = null;
		},
	};

	return useCase;
}
