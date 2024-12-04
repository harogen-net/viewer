import { DateUtil } from "../utils/DateUtil";
import { Viewer } from "../Viewer";
import { Slide } from "./Slide";
import { Layer } from "./Layer";
import { SlideToPNGConverter } from "../utils/SlideToPNGConverter";
import { DataUtil } from "../utils/DataUtil";
import JSZip from "jszip";
import $ from "jquery";

export class ViewerDocument {

	public static shared: ViewerDocument;

	private readonly BG_COLOR_INIT: string = "#FFFFFF";

	public slides: Slide[];

	public duration: number;
	public interval: number;

	public width: number;
	public height: number;

	public title: string;
	public createTime: number;
	public editTime: number;
	public isSensitive: boolean = false;

	private _bgColor: string = this.BG_COLOR_INIT;


	constructor(slides?: Slide[], options?: any) {
		console.log("const at vdoc", slides, options);
		this.slides = slides || [];

		var bgColor: string = this.BG_COLOR_INIT;
		var createTime: number = new Date().getTime();
		var editTime: number = createTime;
		var title: string = DateUtil.getDateString();
		var width: number = Viewer.SCREEN_WIDTH;
		var height: number = Viewer.SCREEN_HEIGHT;

		if (options) {
			if (options.bgColor) bgColor = options.bgColor;
			if (options.createTime) createTime = options.createTime;
			if (options.editTime) editTime = options.editTime;
			if (options.title) title = options.title;
			if (options.width) width = options.width;
			if (options.height) height = options = options.height;
		}
		this.bgColor = bgColor;
		this.createTime = createTime;
		this.editTime = editTime;
		this.title = title;
		this.width = width;
		this.height = height;

		this.duration = 0;
		this.interval = 0;

		ViewerDocument.shared = this;
	}

	//
	// public methods
	//
	public getSlideByOffset(slide: Slide, offset: number): Slide | null {
		var index = this.slides.indexOf(slide);
		if (index == -1) return null;
		var index2 = index + offset;
		if (index2 < 0 || index2 > this.slides.length - 1) return null;
		return this.slides[index2];
	}
	public getPrevSlide(slide: Slide): Slide | null {
		return this.getSlideByOffset(slide, -1);
	}
	public getNextSlide(slide: Slide): Slide | null {
		return this.getSlideByOffset(slide, 1);
	}

	public downloadImage(slideIndex: number = -1, isTransparent?: boolean) {
		if (slideIndex != -1) {
			if (this.slides[slideIndex] != undefined) {
				var slide = this.slides[slideIndex];
				var canvas: HTMLCanvasElement = new SlideToPNGConverter().slide2canvas(slide, slide.width, slide.height, 1, isTransparent ? undefined : this.bgColor);
				DataUtil.downloadBlob(DataUtil.dataURItoBlob(canvas.toDataURL()), this.title + "_" + (slideIndex + 1) + ".png");
			} else {
				throw new Error("invalid index.");
			}
		} else {
			if (this.disabled) {
				alert("activate at least 1 slide.");
				return;
			}

			var zip = new JSZip();
			var converter = new SlideToPNGConverter();
			this.slides.forEach((slide, index) => {
				if (slide.disabled) return;
				var canvas: HTMLCanvasElement = converter.slide2canvas(slide, slide.width, slide.height, 1, isTransparent ? undefined : this.bgColor);
				zip.file(this.title + "_" + (index + 1) + ".png", DataUtil.dataURItoBlob(canvas.toDataURL()));
			});
			zip.generateAsync({ type: "blob", compression: "DEFLATE" })
				.then((blob) => {
					DataUtil.downloadBlob(blob, this.title + ".zip");
				});
		}
	}

	//
	// get set
	//
	public set bgColor(value: string) {
		this._bgColor = value;

		document.documentElement.style.setProperty("--slideBackgroundColor", this._bgColor);
		$("#bgColor").val(this._bgColor);
	}
	public get bgColor(): string { return this._bgColor; }

	public get allLayers(): Layer[] {
		return this.slides.map(slide => slide.layers).flat();
	}

	public get disabled(): boolean {
		return this.slides.every(slide => slide.disabled);
	}
}
