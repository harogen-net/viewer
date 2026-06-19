import {
	createElement,
	createRef,
	type FunctionComponent,
	type Ref,
	type RefObject,
	useEffect,
	useImperativeHandle,
	useLayoutEffect,
	useRef,
	useState,
} from "react";
import { flushSync } from "react-dom";

import { Layer, LayerType } from "../model/Layer";
import { ImageLayer } from "../model/layer/ImageLayer";
import { TextLayer } from "../model/layer/TextLayer";
import { Slide } from "../model/Slide";
import { viewerDocumentStore } from "../state/viewerDocumentStore";
import { DOMSlideView, type DOMSlideViewHandle } from "../view/slide";
import { createCursorAutoHide, type CursorAutoHide } from "./cursorAutoHide";
import {
	exitFullscreenIfActive,
	forceExitFullscreen,
	requestFullscreenOn,
} from "./fullscreen";

/**
 * R4 (bullet 4): `SlideShowRuntime` クラスを React FC へ全面置換した実装。
 *
 * - スライド view は JSX 子要素として宣言的にマウントする（旧 `createSlideView` の
 *   per-slide `createRoot + flushSync` パターンを撤去）。
 * - `webkitfullscreenchange` / `resize` / コンテナ `mousedown` / cursor mousemove の
 *   すべての global listener を `useEffect` 配下に移送。
 * - `slideShow` / `pause` クラスや mirror transform は JSX `className` / `style` で
 *   宣言的に駆動。
 * - 旧クラスの public API（`setUp` / `run` / `stop` / ...）は `useImperativeHandle`
 *   でそのまま露出するため、`SlideshowUseCase` 側は無改修で動作する。
 */

export type SlideShowPlaybackSettings = {
	interval: number;
	duration: number;
};

export type SlideShowRuntimeHandle = {
	readonly isRun: boolean;
	fullscreen: boolean;
	mirrorH: boolean;
	mirrorV: boolean;
	setUp(targetSlides: Slide[], settings: SlideShowPlaybackSettings): void;
	run(initIndex?: number): void;
	stop(): void;
	pause(): void;
	resume(): void;
	close(): void;
	togglePause(): void;
	showPrevious(): void;
	showNext(): void;
};

export type SlideshowShellProps = {
	ref?: Ref<SlideShowRuntimeHandle>;
	onPlaybackChanged?: (detail: { isRun: boolean; isPause: boolean }) => void;
};

type SlideEntry = {
	key: number;
	slide: Slide;
	handleRef: RefObject<DOMSlideViewHandle | null>;
};

type SlideShowDatum = {
	keep?: boolean;
	index: number;
	transforms: any[];
	durationRatio: number;
};

const DOMSlideViewForRender = DOMSlideView as unknown as FunctionComponent<{
	ref: Ref<DOMSlideViewHandle>;
	slide: Slide;
}>;

// ------------------------------ pure helpers ------------------------------

/** 旧 `SlideShowRuntime#checkSlidesSame` を class 外で純粋関数として再実装。 */
function checkSlidesSame(slide1: Slide, slide2: Slide): boolean {
	if (!slide2.joining) return false;
	if (slide1.layers.length === 0) return false;
	if (slide2.layers.length === 0) return false;

	const visibleLayers1 = slide1.layers.filter((layer) => layer.visible);
	const visibleLayers2 = slide2.layers.filter((layer) => layer.visible);

	if (visibleLayers1.length !== visibleLayers2.length) return false;

	for (let i = 0; i < visibleLayers1.length; i++) {
		const layer1: Layer = visibleLayers1[i];
		const layer2: Layer = visibleLayers2[i];

		// 旧実装の typo を踏襲（`layer1.type != layer1.type` は常に false）。
		// 互換のためこのまま残す。
		if (layer1.type != layer1.type) return false;

		switch (layer1.type) {
			case LayerType.IMAGE:
				if ((layer1 as ImageLayer).imageId !== (layer2 as ImageLayer).imageId) return false;
				if ((layer1 as ImageLayer).isText !== (layer2 as ImageLayer).isText) return false;
				break;
			case LayerType.TEXT:
				if ((layer1 as TextLayer).text !== (layer2 as TextLayer).text) return false;
				break;
			default:
				if (layer1.id !== layer2.id) return false;
				break;
		}
	}

	return true;
}

/** 旧 `SlideShowRuntime#avoidMirror`。鏡面再生時に文字レイヤーの読み方向を補正する。 */
function avoidMirror(
	layer: Layer,
	defaultMirrorH: boolean,
	defaultMirrorV: boolean,
	mirrorH: boolean,
	mirrorV: boolean
): void {
	if (mirrorH) {
		if (
			(layer.rotation > 45 && layer.rotation < 135) ||
			(layer.rotation < -45 && layer.rotation > -135)
		) {
			layer.mirrorV = !defaultMirrorV;
		} else {
			layer.mirrorH = !defaultMirrorH;
		}
	}
	if (mirrorV) {
		if (
			(layer.rotation > 45 && layer.rotation < 135) ||
			(layer.rotation < -45 && layer.rotation > -135)
		) {
			layer.mirrorH = !defaultMirrorH;
		} else {
			layer.mirrorV = !defaultMirrorV;
		}
	}
}

// ------------------------------ component ------------------------------

export const SlideshowShell = ({ ref, onPlaybackChanged }: SlideshowShellProps) => {
	const objRef = useRef<HTMLDivElement | null>(null);
	const containerRef = useRef<HTMLDivElement | null>(null);

	// React-managed visual state
	const [isRun, setIsRun] = useState(false);
	const [isPause, setIsPause] = useState(false);
	const [mirrorH, setMirrorHState] = useState(false);
	const [mirrorV, setMirrorVState] = useState(false);
	const [entries, setEntries] = useState<SlideEntry[]>([]);

	// Imperative (non-rendering) control state, mutated freely.
	const stateRef = useRef({
		isRun: false,
		isPause: false,
		fullscreen: false,
		mirrorH: false,
		mirrorV: false,
		data: [] as SlideShowDatum[],
		slidesOrder: [] as DOMSlideViewHandle[],
		index: 0,
		timer: null as ReturnType<typeof setTimeout> | null,
		history: [] as DOMSlideViewHandle[],
		isInit: false,
		started: 0,
		elapsed: 0,
		slideDuration: 0,
		interval: 0,
		duration: 0,
		nextKey: 1,
	});

	const onPlaybackChangedRef = useRef(onPlaybackChanged);
	useEffect(() => {
		onPlaybackChangedRef.current = onPlaybackChanged;
	}, [onPlaybackChanged]);

	const cursorAutoHideRef = useRef<CursorAutoHide | null>(null);

	const dispatchPlaybackChanged = (): void => {
		onPlaybackChangedRef.current?.({
			isRun: stateRef.current.isRun,
			isPause: stateRef.current.isPause,
		});
	};

	const setRun = (next: boolean): void => {
		stateRef.current.isRun = next;
		flushSync(() => setIsRun(next));
	};
	const setPause = (next: boolean): void => {
		stateRef.current.isPause = next;
		flushSync(() => setIsPause(next));
	};

	const updateSlideSize = (): void => {
		const obj = objRef.current;
		if (!obj) return;
		const dispWidth = obj.clientWidth;
		const dispHeight = obj.clientHeight;
		const { width, height } = viewerDocumentStore.getState();
		const dispScale = Math.min(dispWidth / width, dispHeight / height);
		const offsetX = (dispWidth - width) / 2;
		const offsetY = (dispHeight - height) / 2;
		stateRef.current.slidesOrder.forEach((slide) => {
			slide.setDisplayTransform(
				"translate(" + offsetX + "px, " + offsetY + "px) scale(" + dispScale + ")",
				width,
				height
			);
		});
	};

	const slideShowFunc = (): void => {
		const s = stateRef.current;
		if (s.data.length <= 1) {
			return;
		}

		s.started = new Date().getTime();
		s.elapsed = 0;

		const datum = s.data[s.index % s.data.length];
		const slideHandle = s.slidesOrder[datum.index];
		if (!slideHandle) return;

		s.slideDuration = s.interval * datum.durationRatio;

		if (datum.keep && !s.isInit) {
			slideHandle.stopAnimation();
			slideHandle.setOpacity(1);
			const keepDurationOffset = Math.min(s.slideDuration * 0.2, s.interval - s.duration);
			const transitionDuration = (s.slideDuration - keepDurationOffset) / 1000;
			const bezierStr = "cubic-bezier(.4,0,.7,1)";
			slideHandle.setLayerWrapperTransition(
				"transform " + transitionDuration + "s " + bezierStr
			);
			const imgTransitions: string[] = [];
			imgTransitions.push("opacity " + transitionDuration + "s linear");
			imgTransitions.push("clip-path " + transitionDuration + "s " + bezierStr);
			imgTransitions.push("-webkit-clip-path " + transitionDuration + "s " + bezierStr);
			slideHandle.setImageTransition(imgTransitions.join(", "));
		} else {
			slideHandle.setLayerWrapperTransition("");
			slideHandle.setImageTransition("");
			slideHandle.show();
			slideHandle.setZIndex(s.index + 100);
			slideHandle.setOpacity(0);
			slideHandle.animateOpacity(1, Math.min(s.duration, s.slideDuration));

			const histIdx = s.history.indexOf(slideHandle);
			if (histIdx !== -1) {
				s.history.splice(histIdx, 1);
			}
			s.history.push(slideHandle);
		}

		const slideForLayers = slideHandle.slide;
		for (let i = 0; i < slideForLayers.layers.length; i++) {
			const layer = slideForLayers.layers[i];
			const trans = datum.transforms[i];
			layer.transform = trans;
			if (
				layer.type === LayerType.TEXT ||
				(layer.type === LayerType.IMAGE && (layer as ImageLayer).isText)
			) {
				avoidMirror(layer, trans.mirrorH, trans.mirrorV, s.mirrorH, s.mirrorV);
			}
			layer.opacity = datum.transforms[i].opacity;
			if (layer.type === LayerType.IMAGE) {
				(layer as ImageLayer).clipRect = datum.transforms[i].clipRect;
			}
		}

		if (s.timer !== null) clearTimeout(s.timer);
		s.timer = setTimeout(() => {
			slideShowFunc();
		}, s.slideDuration);
		s.index++;

		if (s.history.length > 2) {
			const popped = s.history.shift();
			popped?.hide();
		}
		s.isInit = false;
	};

	const initialize = (): void => {
		const s = stateRef.current;
		if (s.timer !== null) {
			clearTimeout(s.timer);
			s.timer = null;
		}
		s.started = 0;
		s.elapsed = 0;
		s.isInit = false;
		setPause(false);
		setRun(false);

		document.body.classList.remove("slideShow");
		if (s.fullscreen) {
			forceExitFullscreen();
		}

		// Detach + unmount all slide views via React state.
		s.slidesOrder.forEach((handle) => handle.destroy());
		s.slidesOrder = [];
		s.data = [];
		s.history = [];
		flushSync(() => setEntries([]));

		cursorAutoHideRef.current?.stop();
		dispatchPlaybackChanged();
	};

	const setUp = (
		targetSlides: Slide[],
		settings: SlideShowPlaybackSettings
	): void => {
		console.log("setup at slideshow", targetSlides.length);
		initialize();

		const s = stateRef.current;
		s.interval = settings.interval;
		s.duration = settings.duration;

		const filtered = targetSlides.filter((value) => !value.disabled);
		if (filtered.length === 0) return;

		// Build entries (physical view set) + data (playback sequence).
		const newEntries: SlideEntry[] = [];
		const newData: SlideShowDatum[] = [];
		for (let i = 0; i < filtered.length; i++) {
			const slide = filtered[i];
			const lastSlide = i === 0 ? filtered[filtered.length - 1] : filtered[i - 1];

			const slideForSS = slide.clone();
			slideForSS.id = slide.id;
			slideForSS.durationRatio = slide.durationRatio;
			slideForSS.joining = slide.joining;
			slideForSS.disabled = slide.disabled;

			const datum: SlideShowDatum = {
				index: 0,
				transforms: [],
				durationRatio: slide.durationRatio,
			};

			if (checkSlidesSame(slide, lastSlide)) {
				datum.keep = true;
				datum.index = newEntries.length - 1;
			} else {
				datum.index = newEntries.length;
				newEntries.push({
					key: s.nextKey++,
					slide: slideForSS,
					handleRef: createRef<DOMSlideViewHandle>(),
				});
			}

			for (let j = 0; j < slide.layers.length; j++) {
				const transform: any = slide.layers[j].transform;
				transform.opacity = slide.layers[j].opacity;
				if (slide.layers[j].type === LayerType.IMAGE) {
					transform.clipRect = (slide.layers[j] as ImageLayer).clipRect;
				}
				datum.transforms.push(transform);
			}
			newData.push(datum);
		}

		// Edge case: all slides were "kept" (0 unique) — clone the first to get one.
		if (newEntries.length === 0) {
			const head = filtered[0];
			const slideForSS = head.clone();
			slideForSS.id = head.id;
			slideForSS.durationRatio = head.durationRatio;
			slideForSS.joining = head.joining;
			slideForSS.disabled = head.disabled;
			newEntries.push({
				key: s.nextKey++,
				slide: slideForSS,
				handleRef: createRef<DOMSlideViewHandle>(),
			});
		}

		// Resolve negative indices.
		newData.forEach((datum) => {
			if (datum.index < 0) datum.index += newEntries.length;
		});

		// Mount the slide views synchronously so handles are available before we return.
		flushSync(() => setEntries(newEntries));

		const slidesOrder: DOMSlideViewHandle[] = [];
		for (const entry of newEntries) {
			const handle = entry.handleRef.current;
			if (handle) {
				slidesOrder.push(handle);
				handle.hide();
			}
		}
		s.slidesOrder = slidesOrder;
		s.data = newData;
	};

	const run = (initIndex: number = 0): void => {
		const s = stateRef.current;
		if (s.isRun) return;
		if (s.slidesOrder.length === 0) return;
		s.isInit = true;
		setRun(true);

		document.body.classList.add("slideShow");
		if (s.fullscreen) {
			const obj = objRef.current;
			if (obj) requestFullscreenOn(obj);
		}
		updateSlideSize();

		if (s.data.length === 1) {
			s.slidesOrder.forEach((slideHandle) => {
				slideHandle.setOpacity(0);
				slideHandle.show();
				slideHandle.animateOpacity(1, 1000);
				const slideModel = slideHandle.slide;
				for (let i = 0; i < slideModel.layers.length; i++) {
					const layer = slideModel.layers[i];
					const trans = layer.transform;
					if (
						layer.type === LayerType.TEXT ||
						(layer.type === LayerType.IMAGE && (layer as ImageLayer).isText)
					) {
						avoidMirror(layer, trans.mirrorH, trans.mirrorV, s.mirrorH, s.mirrorV);
					}
				}
			});
			cursorAutoHideRef.current?.start();
			dispatchPlaybackChanged();
			return;
		}

		s.slidesOrder.forEach((slideHandle) => slideHandle.setOpacity(0));
		s.index = initIndex;
		if (s.timer !== null) clearTimeout(s.timer);
		s.timer = setTimeout(() => {
			slideShowFunc();
		}, 1000);

		cursorAutoHideRef.current?.start();
		dispatchPlaybackChanged();
	};

	const stop = (): void => {
		const s = stateRef.current;
		if (!s.isRun) return;
		setRun(false);
		setPause(false);

		document.body.classList.remove("slideShow");
		if (s.fullscreen) {
			forceExitFullscreen();
		}

		if (s.timer !== null) {
			clearTimeout(s.timer);
			s.timer = null;
		}
		s.slidesOrder.forEach((slideHandle) => {
			slideHandle.stopAnimation();
			slideHandle.setZIndex(0);
			slideHandle.setOpacity(1);
			slideHandle.setLayerWrapperTransition("");
		});

		cursorAutoHideRef.current?.stop();
		dispatchPlaybackChanged();
	};

	const pause = (): void => {
		const s = stateRef.current;
		if (!s.isRun) return;
		if (s.isPause) return;
		setPause(true);
		s.elapsed = new Date().getTime() - s.started;
		if (s.timer !== null) {
			clearTimeout(s.timer);
			s.timer = null;
		}
		cursorAutoHideRef.current?.stop();
		dispatchPlaybackChanged();
	};

	const resume = (): void => {
		const s = stateRef.current;
		if (!s.isRun) return;
		if (!s.isPause) return;
		setPause(false);

		const restDuration = s.slideDuration - s.elapsed;
		if (restDuration < 0) {
			slideShowFunc();
		} else {
			if (s.timer !== null) clearTimeout(s.timer);
			s.timer = setTimeout(() => {
				slideShowFunc();
			}, restDuration);
		}
		cursorAutoHideRef.current?.start();
		dispatchPlaybackChanged();
	};

	const close = (): void => {
		initialize();
	};

	const togglePause = (): void => {
		const s = stateRef.current;
		if (!s.isRun) return;
		if (s.isPause) {
			resume();
			return;
		}
		pause();
	};

	const showPrevious = (): void => {
		const s = stateRef.current;
		if (!s.isRun || s.data.length <= 1) return;
		if (s.timer !== null) clearTimeout(s.timer);
		s.index -= 2;
		if (s.index < 0) s.index += s.data.length;
		slideShowFunc();
	};

	const showNext = (): void => {
		const s = stateRef.current;
		if (!s.isRun || s.data.length <= 1) return;
		if (s.timer !== null) clearTimeout(s.timer);
		slideShowFunc();
	};

	// Set up cursor auto-hide once obj is mounted.
	useLayoutEffect(() => {
		const obj = objRef.current;
		if (!obj) return;
		cursorAutoHideRef.current = createCursorAutoHide({
			target: obj,
			isActive: () => stateRef.current.isRun && !stateRef.current.isPause,
		});
		return () => {
			cursorAutoHideRef.current?.stop();
			cursorAutoHideRef.current = null;
		};
	}, []);

	// Global window/document listeners — equivalent of class constructor side effects.
	useEffect(() => {
		const onFullscreenChange = (): void => {
			// Original implementation kept the branch empty (only logging stripped).
		};
		document.addEventListener("webkitfullscreenchange", onFullscreenChange);

		let resizeRetimer: ReturnType<typeof setTimeout> | null = null;
		const onResize = (): void => {
			if (resizeRetimer !== null) clearTimeout(resizeRetimer);
			resizeRetimer = setTimeout(() => {
				updateSlideSize();
			}, 50);
		};
		window.addEventListener("resize", onResize);

		return () => {
			document.removeEventListener("webkitfullscreenchange", onFullscreenChange);
			window.removeEventListener("resize", onResize);
			if (resizeRetimer !== null) clearTimeout(resizeRetimer);
		};
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, []);

	// Cleanup on unmount: stop timer + global classes.
	useEffect(() => {
		return () => {
			const s = stateRef.current;
			if (s.timer !== null) {
				clearTimeout(s.timer);
				s.timer = null;
			}
			document.body.classList.remove("slideShow");
		};
	}, []);

	useImperativeHandle(
		ref,
		() => ({
			get isRun() {
				return stateRef.current.isRun;
			},
			get fullscreen() {
				return stateRef.current.fullscreen;
			},
			set fullscreen(value: boolean) {
				stateRef.current.fullscreen = value;
				if (!stateRef.current.isRun) return;
				const obj = objRef.current;
				if (value) {
					if (obj) requestFullscreenOn(obj);
					return;
				}
				exitFullscreenIfActive();
			},
			get mirrorH() {
				return stateRef.current.mirrorH;
			},
			set mirrorH(value: boolean) {
				stateRef.current.mirrorH = value;
				setMirrorHState(value);
			},
			get mirrorV() {
				return stateRef.current.mirrorV;
			},
			set mirrorV(value: boolean) {
				stateRef.current.mirrorV = value;
				setMirrorVState(value);
			},
			setUp,
			run,
			stop,
			pause,
			resume,
			close,
			togglePause,
			showPrevious,
			showNext,
		}),
		// eslint-disable-next-line react-hooks/exhaustive-deps
		[]
	);

	const containerStyle: React.CSSProperties = {};
	const transforms: string[] = [];
	if (mirrorH) transforms.push("scaleX(-1)");
	if (mirrorV) transforms.push("scaleY(-1)");
	if (transforms.length > 0) {
		containerStyle.transform = transforms.join(" ");
	}

	const onContainerMouseDown = (event: React.MouseEvent): void => {
		togglePause();
		event.preventDefault();
		event.stopPropagation();
	};

	const className = "slideShow" + (isRun && isPause ? " pause" : "");

	return (
		<div ref={objRef} className={className} style={{opacity:0.2, backgroundColor:"red"}}>
			<div
				ref={containerRef}
				className="slideContainer"
				style={containerStyle}
				onMouseDown={onContainerMouseDown}
			>
				{entries.map((entry) =>
					createElement(DOMSlideViewForRender, {
						key: entry.key,
						ref: entry.handleRef,
						slide: entry.slide,
					})
				)}
			</div>
		</div>
	);
};
