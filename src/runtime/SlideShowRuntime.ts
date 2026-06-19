import { Layer, LayerType } from "../model/Layer";
import { ImageLayer } from "../model/layer/ImageLayer";
import { TextLayer } from "../model/layer/TextLayer";
import { Slide } from "../model/Slide";
import { viewerDocumentStore } from "../state/viewerDocumentStore";
import { type DOMSlideViewHandle } from "../view/slide";
import { createCursorAutoHide, type CursorAutoHide } from "./cursorAutoHide";
import {
    exitFullscreenIfActive,
    forceExitFullscreen,
    requestFullscreenOn,
} from "./fullscreen";
import { mountDOMSlideViewInto } from "./mountReactView";

export type SlideShowPlaybackSettings = {
	interval: number;
	duration: number;
};

export type SlideShowRuntimeOptions = {
	onPlaybackChanged?: (detail: { isRun: boolean; isPause: boolean }) => void;
};

type SlideShowSlideView = DOMSlideViewHandle & {
	unmount: () => void;
};

export class SlideShowRuntime {
	private _isRun: boolean;
	private _isPause: boolean;
	private _fullscreen: boolean;
	private _mirrorH: boolean;
	private _mirrorV: boolean;

	private slideContainer: HTMLDivElement;

	private slides: SlideShowSlideView[] = [];
	private data: any[];
	private index: number;
	private isInit: boolean;
	private timer: any;
	private history: SlideShowSlideView[];
	private readonly cursorAutoHide: CursorAutoHide;

	private interval: number;
	private duration: number;
	private bgColor: string;

	private started: number;
	private elapsed: number;
	private slideDuration: number;

	//private readonly RUN_IN_WINDOW:boolean = true;

	constructor(
		public obj: HTMLElement,
		private readonly options: SlideShowRuntimeOptions = {}
	) {
		obj.classList.add("slideShow");
		document.addEventListener("webkitfullscreenchange", () => {
			if (document["webkitFullscreenElement"]) {
			} else {
				// this.stop();
			}
		});

		window.addEventListener("resize", () => {
			setTimeout(() => {
				this.updateSlideSize();
			}, 50);
		});

		const container = document.createElement("div");
		container.className = "slideContainer";
		obj.appendChild(container);
		this.slideContainer = container;
		this.slideContainer.addEventListener("mousedown", (event) => {
			this.togglePause();
			event.preventDefault();
			event.stopPropagation();
		});

		this.cursorAutoHide = createCursorAutoHide({
			target: this.obj,
			isActive: () => this._isRun && !this._isPause,
		});
	}

	setUp(targetSlides: Slide[], settings: SlideShowPlaybackSettings): void {
		console.log("setup at slideshow", targetSlides.length);
		this.intialize();

		this.interval = settings.interval;
		this.duration = settings.duration;
		//		this.bgColor = $("#bgColor").val();

		targetSlides = targetSlides.filter((value: Slide) => {
			return !value.disabled;
		});

		for (var i: number = 0; i < targetSlides.length; i++) {
			var slide: Slide = targetSlides[i];
			var lastSlide: Slide = i == 0 ? targetSlides[targetSlides.length - 1] : targetSlides[i - 1];

			var slideForSS: Slide = slide.clone();
			slideForSS.id = slide.id;
			slideForSS.durationRatio = slide.durationRatio;
			slideForSS.joining = slide.joining;
			slideForSS.disabled = slide.disabled;

			var datum: any = {};

			if (this.checkSlidesSame(slide, lastSlide)) {
				datum.keep = true;
				datum.index = this.slides.length - 1;
			} else {
				var slideViewForSS = this.createSlideView(slideForSS);
				slideViewForSS.hide();
				datum.index = this.slides.length;
				this.slides.push(slideViewForSS);
			}
			datum.transforms = [];
			for (var j: number = 0; j < slide.layers.length; j++) {
				var transform: any = slide.layers[j].transform;
				transform.opacity = slide.layers[j].opacity;
				if (slide.layers[j].type == LayerType.IMAGE) {
					transform.clipRect = (slide.layers[j] as ImageLayer).clipRect;
				}
				datum.transforms.push(transform);
			}
			datum.durationRatio = slide.durationRatio;
			this.data.push(datum);
		}

		//すべてkeepだった場合を解決
		if (this.slides.length == 0) {
			//var slideForSS:SlideView = slides[0].clone();

			var slideForSS: Slide = slide.clone();
			slideForSS.id = targetSlides[0].id;
			slideForSS.durationRatio = targetSlides[0].durationRatio;
			slideForSS.joining = targetSlides[0].joining;
			slideForSS.disabled = targetSlides[0].disabled;
			var slideViewForSS = this.createSlideView(slideForSS);

			this.slides.push(slideViewForSS);
		}

		//index:-1を解決
		this.data.forEach((datum: any) => {
			if (datum.index < 0) {
				datum.index += this.slides.length;
			}
		});
		// $.each(this.data, (number, datum:any)=>{
		// 	if(datum.index < 0){
		// 		datum.index += this.slides.length;
		// 	}
		// });
		//console.log(this.data);
	}

	public intialize(): void {
		this._isRun = false;
		this._isPause = false;
		clearInterval(this.timer);
		this.started = 0;
		this.elapsed = 0;
		this.obj.classList.remove("pause");
		this.isInit = false;

		document.body.classList.remove("slideShow");
		if (this._fullscreen) {
			forceExitFullscreen();
		}

		if (this.slides) {
			while (this.slides.length > 0) {
				this.slides.pop().unmount();
			}
		}

		this.data = [];
		this.history = [];

		this.cursorAutoHide.stop();
		this.dispatchPlaybackChanged();
	}

	public run(initIndex: number = 0): void {
		//console.log("run at slideshow", this._isRun);
		if (this._isRun) return;
		if (this.slides.length == 0) return;
		this._isRun = true;
		this.isInit = true;

		document.body.classList.add("slideShow");
		if (this._fullscreen) {
			requestFullscreenOn(this.obj);
		}
		this.updateSlideSize();

		if (this.data.length == 1) {
			this.slides.forEach((slide) => {
				slide.setOpacity(0);
				//				slide.updateSize();
				slide.show();
				slide.animateOpacity(1, 1000);

				for (var i: number = 0; i < slide.slide.layers.length; i++) {
					var layer = slide.slide.layers[i];
					var trans = layer.transform;
					//文字要素を反転から救う
					if (
						layer.type == LayerType.TEXT ||
						(layer.type == LayerType.IMAGE && (layer as ImageLayer).isText)
					) {
						this.avoidMirror(layer, trans.mirrorH, trans.mirrorV);
					}
				}
			});
			this.cursorAutoHide.start();
			this.dispatchPlaybackChanged();
			return;
		}

		this.slides.forEach((slide) => {
			slide.setOpacity(0);
			//slide.updateSize();
		});

		this.index = initIndex;
		this.timer = setTimeout(() => {
			this.slideShowFunc();
		}, 1000);

		this.cursorAutoHide.start();
		this.dispatchPlaybackChanged();
	}

	public stop(): void {
		// console.log("stop at slideshow", this.timer);
		if (!this._isRun) return;
		this._isRun = false;
		this._isPause = false;

		document.body.classList.remove("slideShow");
		if (this._fullscreen) {
			forceExitFullscreen();
		}

		clearInterval(this.timer);
		this.slides.forEach((slide) => {
			slide.stopAnimation();
			slide.setZIndex(0);
			slide.setOpacity(1);
			slide.setLayerWrapperTransition("");
		});

		this.cursorAutoHide.stop();
		this.dispatchPlaybackChanged();
	}

	public pause(): void {
		if (!this._isRun) return;
		if (this._isPause) return;
		this._isPause = true;
		this.obj.classList.add("pause");

		this.elapsed = new Date().getTime() - this.started;
		clearInterval(this.timer);

		//console.log("[paused]");
		//console.log("slideDuration : " + this.slideDuration + "ms");
		//console.log("elasped : " + this.elapsed + "ms");
		this.cursorAutoHide.stop();
		this.dispatchPlaybackChanged();
	}

	public resume(): void {
		if (!this._isRun) return;
		if (!this._isPause) return;
		this._isPause = false;
		this.obj.classList.remove("pause");

		var restDuration: number = this.slideDuration - this.elapsed;
		if (restDuration < 0) {
			this.slideShowFunc();
		} else {
			this.timer = setTimeout(() => {
				this.slideShowFunc();
			}, restDuration);
		}
		//console.log("[resume]");
		//console.log("restDuration : " + restDuration + "ms");
		//note : 同一スライド上で2回以上ポーズをすると、経過時刻がおかしくなりリジュームが正常に動作しない。
		//		とはいえリジューム後すぐに次のスライドが始まるだけなので現状実害はない
		this.cursorAutoHide.start();
		this.dispatchPlaybackChanged();
	}

	public close(): void {
		this.intialize();
	}

	public togglePause(): void {
		if (!this._isRun) return;
		if (this._isPause) {
			this.resume();
			return;
		}
		this.pause();
	}

	public showPrevious(): void {
		if (!this._isRun || this.data.length <= 1) return;
		clearInterval(this.timer);
		this.index -= 2;
		if (this.index < 0) this.index += this.data.length;
		this.slideShowFunc();
	}

	public showNext(): void {
		if (!this._isRun || this.data.length <= 1) return;
		clearInterval(this.timer);
		this.slideShowFunc();
	}

	//

	private slideShowFunc() {
		if (this.data.length <= 1) {
			return;
		}

		this.started = new Date().getTime();
		this.elapsed = 0;

		var datum: any = this.data[this.index % this.data.length];
		var slide: SlideShowSlideView = this.slides[datum.index];

		this.slideDuration = this.interval * datum.durationRatio;

		if (datum.keep && !this.isInit) {
			slide.stopAnimation();
			slide.setOpacity(1);
			var keepDurationOffset: number = Math.min(
				this.slideDuration * 0.2,
				this.interval - this.duration
			);
			var transitionDuration = (this.slideDuration - keepDurationOffset) / 1000;
			var bezierStr = "cubic-bezier(.4,0,.7,1)";
			slide.setLayerWrapperTransition("transform " + transitionDuration + "s " + bezierStr);

			var imgTransitions: string[] = [];
			imgTransitions.push("opacity " + transitionDuration + "s linear");
			imgTransitions.push("clip-path " + transitionDuration + "s " + bezierStr);
			imgTransitions.push("-webkit-clip-path " + transitionDuration + "s " + bezierStr);
			slide.setImageTransition(imgTransitions.join(", "));
		} else {
			slide.setLayerWrapperTransition("");
			slide.setImageTransition("");
			slide.show();
			slide.setZIndex(this.index + 100);
			slide.setOpacity(0);
			slide.animateOpacity(1, Math.min(this.duration, this.slideDuration));

			if (this.history.indexOf(slide) != -1) {
				this.history.splice(this.history.indexOf(slide), 1);
			}
			this.history.push(slide);
		}
		for (var i: number = 0; i < slide.slide.layers.length; i++) {
			var layer = slide.slide.layers[i];
			var trans = datum.transforms[i];
			layer.transform = trans;

			//文字要素を反転から救う
			if (
				layer.type == LayerType.TEXT ||
				(layer.type == LayerType.IMAGE && (layer as ImageLayer).isText)
			) {
				this.avoidMirror(layer, trans.mirrorH, trans.mirrorV);
			}
			layer.opacity = datum.transforms[i].opacity;

			if (layer.type == LayerType.IMAGE) {
				(layer as ImageLayer).clipRect = datum.transforms[i].clipRect;
			}
		}

		this.timer = setTimeout(() => {
			this.slideShowFunc();
		}, this.slideDuration);
		this.index++;

		if (this.history.length > 2) {
			this.history.shift().hide();
		}
		this.isInit = false;
	}

	private dispatchPlaybackChanged() {
		this.options.onPlaybackChanged?.({ isRun: this._isRun, isPause: this._isPause });
	}

	private updateMirror() {
		var cssTxts: string[] = [];
		if (this._mirrorH) cssTxts.push("scaleX(-1)");
		if (this._mirrorV) cssTxts.push("scaleY(-1)");
		this.slideContainer.style.transform = cssTxts.join(" ");
	}

	//

	private updateSlideSize() {
		//		console.log("updateSlideSize");
		let dispWidth = this.obj.clientWidth;
		let dispHeight = this.obj.clientHeight;
		const { width, height } = viewerDocumentStore.getState();
		let dispScale = Math.min(dispWidth / width, dispHeight / height);
		let offsetX = (dispWidth - width) / 2;
		let offsetY = (dispHeight - height) / 2;

		this.slides.forEach((slide) => {
			slide.setDisplayTransform(
				"translate(" + offsetX + "px, " + offsetY + "px) scale(" + dispScale + ")",
				width,
				height
			);
		});
	}

	private createSlideView(slide: Slide): SlideShowSlideView {
		const mount = mountDOMSlideViewInto(this.slideContainer, slide);
		const handle = mount.handle as SlideShowSlideView;
		handle.unmount = () => {
			handle.destroy();
			mount.unmount();
		};
		return handle;
	}

	//スライドの構造が同じかどうかを調べる
	private checkSlidesSame(slide1: Slide, slide2: Slide): boolean {
		if (!slide2.joining) return false;
		if (slide1.layers.length == 0) return false;
		if (slide2.layers.length == 0) return false;

		var visibleLayers1 = slide1.layers.filter((layer) => layer.visible);
		var visibleLayers2 = slide2.layers.filter((layer) => layer.visible);

		if (visibleLayers1.length != visibleLayers2.length) return false;

		for (var i = 0; i < visibleLayers1.length; i++) {
			var layer1: Layer = visibleLayers1[i];
			var layer2: Layer = visibleLayers2[i];

			if (layer1.type != layer1.type) return false;

			switch (layer1.type) {
				case LayerType.IMAGE:
					if ((layer1 as ImageLayer).imageId != (layer2 as ImageLayer).imageId) return false;
					//					if((layer1 as ImageLayer).clipString != (layer2 as ImageLayer).clipString) return false;
					if ((layer1 as ImageLayer).isText != (layer2 as ImageLayer).isText) return false;
					break;
				case LayerType.TEXT:
					//					if(layer1.id != layer2.id) return false;
					if ((layer1 as TextLayer).text != (layer2 as TextLayer).text) return false;
					break;
				default:
					if (layer1.id != layer2.id) return false;
					break;
			}
		}

		return true;
	}

	//textLayerを鏡面再生でも読めるようにする
	//ついでに文字を含む画像も鏡面で読めるように改修
	//回転角が±90度あたりならば鏡面の縦横を逆にして判定
	private avoidMirror(layer: Layer, defaultMirrorH: boolean, defaultMirrorV: boolean) {
		if (this._mirrorH) {
			if (
				(layer.rotation > 45 && layer.rotation < 135) ||
				(layer.rotation < -45 && layer.rotation > -135)
			) {
				layer.mirrorV = !defaultMirrorV;
			} else {
				layer.mirrorH = !defaultMirrorH;
			}
		}
		if (this._mirrorV) {
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

	//

	get isRun(): boolean {
		return this._isRun;
	}

	public set fullscreen(value: boolean) {
		this._fullscreen = value;
		if (!this._isRun) return;
		if (value) {
			requestFullscreenOn(this.obj);
			return;
		}
		exitFullscreenIfActive();
	}

	public set mirrorH(value: boolean) {
		this._mirrorH = value;
		this.updateMirror();
	}
	public set mirrorV(value: boolean) {
		this._mirrorV = value;
		this.updateMirror();
	}
}
