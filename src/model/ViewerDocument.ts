import JSZip from "jszip";
import { slideStore } from "../state/slideStore";
import { viewerDocumentStore } from "../state/viewerDocumentStore";
import { DataUtil } from "../utils/DataUtil";
import { DateUtil } from "../utils/DateUtil";
import { SlideToPNGConverter } from "../utils/SlideToPNGConverter";
import { Viewer } from "../Viewer";
import { Layer } from "./Layer";
import { Slide } from "./Slide";

export class ViewerDocument {
	public static shared: ViewerDocument = null;

	private readonly BG_COLOR_INIT: string = "#000000";

	constructor(slides?: Slide[], options?: any) {
		console.log("const at vdoc", slides, options);

		var bgColor: string | undefined = this.BG_COLOR_INIT;
		var createTime: number | undefined = new Date().getTime();
		var editTime: number | undefined = createTime;
		var title: string | undefined = DateUtil.getDateString();
		var width: number | undefined = Viewer.SCREEN_WIDTH;
		var height: number | undefined = Viewer.SCREEN_HEIGHT;
		var isSensitive: boolean = false;

		if (options) {
			if (options.bgColor) bgColor = options.bgColor;
			if (options.createTime) createTime = options.createTime;
			if (options.editTime) editTime = options.editTime;
			if (options.title) title = options.title;
			if (options.width) width = options.width;
			if (options.height) height = options.height;
			if (options.isSensitive) isSensitive = options.isSensitive;
		}

		ViewerDocument.shared = this;
		viewerDocumentStore.getState().setDocument({
			document: this,
			title,
			createTime,
			editTime,
			isSensitive,
			duration: options?.duration,
			interval: options?.interval,
			width,
			height,
			bgColor,
			slides: slides || [],
		});
	}

	//
	// public methods
	//
	public getSlideByOffset(slide: Slide, offset: number): Slide | null {
		return slideStore.getState().getSlideByOffset(slide, offset);
	}
	public getPrevSlide(slide: Slide): Slide | null {
		return slideStore.getState().getPrevSlide(slide);
	}
	public getNextSlide(slide: Slide): Slide | null {
		return slideStore.getState().getNextSlide(slide);
	}
	//FileIO
	public downloadImage(targetIndex: number = -1) {
		const isTransparent = false;
		if (targetIndex != -1) {
			if (this.slides[targetIndex] != undefined) {
				var slide = this.slides[targetIndex];
				var canvas: HTMLCanvasElement = new SlideToPNGConverter().slide2canvas(
					slide,
					slide.width,
					slide.height,
					1,
					isTransparent ? undefined : this.bgColor
				);
				DataUtil.downloadBlob(
					DataUtil.dataURItoBlob(canvas.toDataURL()),
					this.title + "_" + (targetIndex + 1) + ".png"
				);
			} else {
				throw new Error("invalid index.");
			}
		} else {
			if (this.disabled) {
				return;
			}

			var zip = new JSZip();
			var converter = new SlideToPNGConverter();
			this.slides.forEach((slide, index) => {
				if (slide.disabled) return;
				var canvas: HTMLCanvasElement = converter.slide2canvas(
					slide,
					slide.width,
					slide.height,
					1,
					isTransparent ? undefined : this.bgColor
				);
				zip.file(
					this.title + "_" + (index + 1) + ".png",
					DataUtil.dataURItoBlob(canvas.toDataURL())
				);
			});
			zip.generateAsync({ type: "blob", compression: "DEFLATE" }).then((blob) => {
				DataUtil.downloadBlob(blob, this.title + ".zip");
			});
		}
	}

	//
	// get set
	//
	public get slides(): Slide[] {
		return slideStore.getState().slides as Slide[];
	}
	public set slides(value: Slide[]) {
		slideStore.getState().setSlides(value || []);
	}

	public get duration(): number | undefined {
		return viewerDocumentStore.getState().duration;
	}
	public set duration(value: number | undefined) {
		viewerDocumentStore.getState().setDocumentMeta({ duration: value });
	}

	public get interval(): number | undefined {
		return viewerDocumentStore.getState().interval;
	}
	public set interval(value: number | undefined) {
		viewerDocumentStore.getState().setDocumentMeta({ interval: value });
	}

	public get width(): number {
		return viewerDocumentStore.getState().width;
	}
	public set width(value: number | undefined) {
		viewerDocumentStore.getState().setDocumentMeta({ width: value || Viewer.SCREEN_WIDTH });
	}

	public get height(): number {
		return viewerDocumentStore.getState().height;
	}
	public set height(value: number | undefined) {
		viewerDocumentStore.getState().setDocumentMeta({ height: value || Viewer.SCREEN_HEIGHT });
	}

	public get title(): string {
		return viewerDocumentStore.getState().title;
	}
	public set title(value: string) {
		viewerDocumentStore.getState().setDocumentMeta({ title: value });
	}

	public get createTime(): number {
		return viewerDocumentStore.getState().createTime;
	}
	public set createTime(value: number) {
		viewerDocumentStore.getState().setDocumentMeta({ createTime: value });
	}

	public get editTime(): number {
		return viewerDocumentStore.getState().editTime;
	}
	public set editTime(value: number) {
		viewerDocumentStore.getState().setDocumentMeta({ editTime: value });
	}

	public get isSensitive(): boolean {
		return viewerDocumentStore.getState().isSensitive;
	}
	public set isSensitive(value: boolean) {
		viewerDocumentStore.getState().setDocumentMeta({ isSensitive: value });
	}

	public set bgColor(value: string | undefined) {
		viewerDocumentStore.getState().setDocumentMeta({ bgColor: value || this.BG_COLOR_INIT });
	}
	public get bgColor(): string {
		return viewerDocumentStore.getState().bgColor || this.BG_COLOR_INIT;
	}

	public get allLayers(): Layer[] {
		return this.slides.map((slide) => slide.layers).flat();
	}

	public get disabled(): boolean {
		return this.slides.every((slide) => slide.disabled);
	}
}
