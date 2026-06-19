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

/** R4 (bullet 4): `SlideShowRuntime` クラスを置換した React FC。public API は無改修で維持。 */

export type SlideShowPlaybackSettings = { interval: number; duration: number };

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

type SlideEntry = { key: number; slide: Slide; handleRef: RefObject<DOMSlideViewHandle | null> };
type SlideShowDatum = { keep?: boolean; index: number; transforms: any[]; durationRatio: number };

const DOMSlideViewForRender = DOMSlideView as unknown as FunctionComponent<{
	ref: Ref<DOMSlideViewHandle>;
	slide: Slide;
}>;

function checkSlidesSame(slide1: Slide, slide2: Slide): boolean {
	if (!slide2.joining) return false;
	if (slide1.layers.length === 0 || slide2.layers.length === 0) return false;
	const visible1 = slide1.layers.filter((l) => l.visible);
	const visible2 = slide2.layers.filter((l) => l.visible);
	if (visible1.length !== visible2.length) return false;
	for (let i = 0; i < visible1.length; i++) {
		const l1 = visible1[i];
		const l2 = visible2[i];
		// 旧 typo（`l1.type != l1.type` で常に false）を踏襲。
		if (l1.type != l1.type) return false;
		switch (l1.type) {
			case LayerType.IMAGE:
				if ((l1 as ImageLayer).imageId !== (l2 as ImageLayer).imageId) return false;
				if ((l1 as ImageLayer).isText !== (l2 as ImageLayer).isText) return false;
				break;
			case LayerType.TEXT:
				if ((l1 as TextLayer).text !== (l2 as TextLayer).text) return false;
				break;
			default:
				if (l1.id !== l2.id) return false;
		}
	}
	return true;
}

function avoidMirror(layer: Layer, defH: boolean, defV: boolean, mH: boolean, mV: boolean): void {
	const sideways =
		(layer.rotation > 45 && layer.rotation < 135) ||
		(layer.rotation < -45 && layer.rotation > -135);
	if (mH) {
		if (sideways) layer.mirrorV = !defV;
		else layer.mirrorH = !defH;
	}
	if (mV) {
		if (sideways) layer.mirrorH = !defH;
		else layer.mirrorV = !defV;
	}
}

export const SlideshowShell = ({ ref, onPlaybackChanged }: SlideshowShellProps) => {
	const objRef = useRef<HTMLDivElement | null>(null);

	const [isRun, setIsRun] = useState(false);
	const [isPause, setIsPause] = useState(false);
	const [mirrorH, setMirrorHState] = useState(false);
	const [mirrorV, setMirrorVState] = useState(false);
	const [entries, setEntries] = useState<SlideEntry[]>([]);

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
	onPlaybackChangedRef.current = onPlaybackChanged;

	const cursorAutoHideRef = useRef<CursorAutoHide | null>(null);

	const dispatchPlayback = (): void => {
		onPlaybackChangedRef.current?.({
			isRun: stateRef.current.isRun,
			isPause: stateRef.current.isPause,
		});
	};

	const clearTimer = (): void => {
		const s = stateRef.current;
		if (s.timer !== null) {
			clearTimeout(s.timer);
			s.timer = null;
		}
	};

	const updateSlideSize = (): void => {
		const obj = objRef.current;
		if (!obj) return;
		const { width, height } = viewerDocumentStore.getState();
		const dispScale = Math.min(obj.clientWidth / width, obj.clientHeight / height);
		const offsetX = (obj.clientWidth - width) / 2;
		const offsetY = (obj.clientHeight - height) / 2;
		const transform = `translate(${offsetX}px, ${offsetY}px) scale(${dispScale})`;
		stateRef.current.slidesOrder.forEach((slide) =>
			slide.setDisplayTransform(transform, width, height)
		);
	};

	const slideShowFunc = (): void => {
		const s = stateRef.current;
		if (s.data.length <= 1) return;
		s.started = Date.now();
		s.elapsed = 0;
		const datum = s.data[s.index % s.data.length];
		const handle = s.slidesOrder[datum.index];
		if (!handle) return;
		s.slideDuration = s.interval * datum.durationRatio;

		if (datum.keep && !s.isInit) {
			handle.stopAnimation();
			handle.setOpacity(1);
			const offset = Math.min(s.slideDuration * 0.2, s.interval - s.duration);
			const td = (s.slideDuration - offset) / 1000;
			const bz = "cubic-bezier(.4,0,.7,1)";
			handle.setLayerWrapperTransition(`transform ${td}s ${bz}`);
			handle.setImageTransition(
				`opacity ${td}s linear, clip-path ${td}s ${bz}, -webkit-clip-path ${td}s ${bz}`
			);
		} else {
			handle.setLayerWrapperTransition("");
			handle.setImageTransition("");
			handle.show();
			handle.setZIndex(s.index + 100);
			handle.setOpacity(0);
			handle.animateOpacity(1, Math.min(s.duration, s.slideDuration));
			const idx = s.history.indexOf(handle);
			if (idx !== -1) s.history.splice(idx, 1);
			s.history.push(handle);
		}

		const layers = handle.slide.layers;
		for (let i = 0; i < layers.length; i++) {
			const layer = layers[i];
			const trans = datum.transforms[i];
			layer.transform = trans;
			if (
				layer.type === LayerType.TEXT ||
				(layer.type === LayerType.IMAGE && (layer as ImageLayer).isText)
			) {
				avoidMirror(layer, trans.mirrorH, trans.mirrorV, s.mirrorH, s.mirrorV);
			}
			layer.opacity = trans.opacity;
			if (layer.type === LayerType.IMAGE) (layer as ImageLayer).clipRect = trans.clipRect;
		}

		clearTimer();
		s.timer = setTimeout(slideShowFunc, s.slideDuration);
		s.index++;
		if (s.history.length > 2) s.history.shift()?.hide();
		s.isInit = false;
	};

	const initialize = (): void => {
		const s = stateRef.current;
		clearTimer();
		s.started = 0;
		s.elapsed = 0;
		s.isInit = false;
		s.isRun = false;
		s.isPause = false;
		flushSync(() => {
			setIsRun(false);
			setIsPause(false);
		});
		document.body.classList.remove("slideShow");
		if (s.fullscreen) forceExitFullscreen();
		s.slidesOrder.forEach((h) => h.destroy());
		s.slidesOrder = [];
		s.data = [];
		s.history = [];
		flushSync(() => setEntries([]));
		cursorAutoHideRef.current?.stop();
		dispatchPlayback();
	};

	const setUp = (targetSlides: Slide[], settings: SlideShowPlaybackSettings): void => {
		initialize();
		const s = stateRef.current;
		s.interval = settings.interval;
		s.duration = settings.duration;
		const filtered = targetSlides.filter((v) => !v.disabled);
		if (filtered.length === 0) return;

		const newEntries: SlideEntry[] = [];
		const newData: SlideShowDatum[] = [];
		for (let i = 0; i < filtered.length; i++) {
			const slide = filtered[i];
			const lastSlide = i === 0 ? filtered[filtered.length - 1] : filtered[i - 1];
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
					slide: slide.clone(),
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

		// 全 keep だった場合、先頭をクローンして 1 つ確保。
		if (newEntries.length === 0) {
			newEntries.push({
				key: s.nextKey++,
				slide: filtered[0].clone(),
				handleRef: createRef<DOMSlideViewHandle>(),
			});
		}
		newData.forEach((d) => {
			if (d.index < 0) d.index += newEntries.length;
		});

		flushSync(() => setEntries(newEntries));

		const order: DOMSlideViewHandle[] = [];
		for (const entry of newEntries) {
			const h = entry.handleRef.current;
			if (h) {
				order.push(h);
				h.hide();
			}
		}
		s.slidesOrder = order;
		s.data = newData;
	};

	const run = (initIndex = 0): void => {
		const s = stateRef.current;
		if (s.isRun || s.slidesOrder.length === 0) return;
		s.isInit = true;
		s.isRun = true;
		flushSync(() => setIsRun(true));
		document.body.classList.add("slideShow");
		if (s.fullscreen && objRef.current) requestFullscreenOn(objRef.current);
		updateSlideSize();

		if (s.data.length === 1) {
			s.slidesOrder.forEach((h) => {
				h.setOpacity(0);
				h.show();
				h.animateOpacity(1, 1000);
				for (const layer of h.slide.layers) {
					const t = layer.transform;
					if (
						layer.type === LayerType.TEXT ||
						(layer.type === LayerType.IMAGE && (layer as ImageLayer).isText)
					) {
						avoidMirror(layer, t.mirrorH, t.mirrorV, s.mirrorH, s.mirrorV);
					}
				}
			});
			cursorAutoHideRef.current?.start();
			dispatchPlayback();
			return;
		}

		s.slidesOrder.forEach((h) => h.setOpacity(0));
		s.index = initIndex;
		clearTimer();
		s.timer = setTimeout(slideShowFunc, 1000);
		cursorAutoHideRef.current?.start();
		dispatchPlayback();
	};

	const stop = (): void => {
		const s = stateRef.current;
		if (!s.isRun) return;
		s.isRun = false;
		s.isPause = false;
		flushSync(() => {
			setIsRun(false);
			setIsPause(false);
		});
		document.body.classList.remove("slideShow");
		if (s.fullscreen) forceExitFullscreen();
		clearTimer();
		s.slidesOrder.forEach((h) => {
			h.stopAnimation();
			h.setZIndex(0);
			h.setOpacity(1);
			h.setLayerWrapperTransition("");
		});
		cursorAutoHideRef.current?.stop();
		dispatchPlayback();
	};

	const pause = (): void => {
		const s = stateRef.current;
		if (!s.isRun || s.isPause) return;
		s.isPause = true;
		flushSync(() => setIsPause(true));
		s.elapsed = Date.now() - s.started;
		clearTimer();
		cursorAutoHideRef.current?.stop();
		dispatchPlayback();
	};

	const resume = (): void => {
		const s = stateRef.current;
		if (!s.isRun || !s.isPause) return;
		s.isPause = false;
		flushSync(() => setIsPause(false));
		const rest = s.slideDuration - s.elapsed;
		if (rest < 0) {
			slideShowFunc();
		} else {
			clearTimer();
			s.timer = setTimeout(slideShowFunc, rest);
		}
		cursorAutoHideRef.current?.start();
		dispatchPlayback();
	};

	const close = (): void => initialize();

	const togglePause = (): void => {
		const s = stateRef.current;
		if (!s.isRun) return;
		if (s.isPause) resume();
		else pause();
	};

	const showPrevious = (): void => {
		const s = stateRef.current;
		if (!s.isRun || s.data.length <= 1) return;
		clearTimer();
		s.index -= 2;
		if (s.index < 0) s.index += s.data.length;
		slideShowFunc();
	};

	const showNext = (): void => {
		const s = stateRef.current;
		if (!s.isRun || s.data.length <= 1) return;
		clearTimer();
		slideShowFunc();
	};

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

	useEffect(() => {
		const noop = (): void => {
			/* webkitfullscreenchange listener (旧クラス互換、本体は空) */
		};
		document.addEventListener("webkitfullscreenchange", noop);
		let resizeRetimer: ReturnType<typeof setTimeout> | null = null;
		const onResize = (): void => {
			if (resizeRetimer !== null) clearTimeout(resizeRetimer);
			resizeRetimer = setTimeout(updateSlideSize, 50);
		};
		window.addEventListener("resize", onResize);
		return () => {
			document.removeEventListener("webkitfullscreenchange", noop);
			window.removeEventListener("resize", onResize);
			if (resizeRetimer !== null) clearTimeout(resizeRetimer);
		};
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, []);

	useEffect(
		() => () => {
			clearTimer();
			document.body.classList.remove("slideShow");
		},
		// eslint-disable-next-line react-hooks/exhaustive-deps
		[]
	);

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
				if (value) {
					if (objRef.current) requestFullscreenOn(objRef.current);
				} else {
					exitFullscreenIfActive();
				}
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

	const transforms: string[] = [];
	if (mirrorH) transforms.push("scaleX(-1)");
	if (mirrorV) transforms.push("scaleY(-1)");

	return (
		<div
			ref={objRef}
			className={"slideShow" + (isRun && isPause ? " pause" : "")}
			style={{ opacity: 0.2, backgroundColor: "red" }}
		>
			<div
				className="slideContainer"
				style={transforms.length > 0 ? { transform: transforms.join(" ") } : undefined}
				onMouseDown={(e) => {
					togglePause();
					e.preventDefault();
					e.stopPropagation();
				}}
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
