import { DateUtil } from "../utils/DateUtil";
import { Viewer } from "../Viewer";
import { RSlide, Slide } from "./Slide";
import { Layer, LayerType } from "./Layer";
import { SlideToPNGConverter } from "../utils/SlideToPNGConverter";
import { DataUtil } from "../utils/DataUtil";
import JSZip from "jszip";
import $ from "jquery";
import { RImageLayer } from "./layer/ImageLayer";


export type RViewerDocument = {
	slides: RSlide[];
	duration: number;
	interval: number;
	width: number;
	height: number;
	title: string;
	createTime: number;
	editTime: number;
	isSensitive: boolean;
	bgColor: string;
	allLayers: Layer[];
	disabled: boolean;
}

export namespace RViewerDocument {

	const VERSION: number = 3;

	export const create = (slides?: RSlide[], options?: any): RViewerDocument => {
		let vdoc = { slides: slides || [] } as RViewerDocument;

		if (options?.bgColor) vdoc.bgColor = options.bgColor;
		if (options?.createTime) vdoc.createTime = options.createTime;
		if (options?.editTime) vdoc.editTime = options.editTime;
		if (options?.title) vdoc.title = options.title;
		if (options?.width) vdoc.width = options.width;
		if (options?.height) vdoc.height = options.height;
		return vdoc;

	};

	export const stringify = (vdoc: RViewerDocument): string => {
		let json: any = {};
		json.version = VERSION;
		json.screen = { width: vdoc.width, height: vdoc.height };

		if (vdoc.bgColor) json.bgColor = vdoc.bgColor;
		if (vdoc.createTime) json.createTime = vdoc.createTime;
		if (vdoc.editTime) json.editTime = vdoc.editTime;

		let slideData: any[] = [];
		let imageData: any = {};

		vdoc.slides.forEach(slide => {
			let slideDatum: any = {};
			slideDatum.id = slide.id;
			slideDatum.durationRatio = slide.durationRatio;
			slideDatum.joining = slide.joining;
			slideDatum.disabled = slide.disabled;

			slideDatum.layers = [];
			slide.layers.forEach(layer => {
				slideDatum.layers.push(layer.getData());
				if (layer.type == LayerType.IMAGE) {
					let imageLayer: ImageLayer = layer as ImageLayer;
					if (imageData[imageLayer.imageId] == undefined) {
						imageData[imageLayer.imageId] = ImageManager.shared.getSrcById(imageLayer.imageId);
					}
				}
			});
			slideData.push(slideDatum);

			json.slideData = slideData;
			json.imageData = imageData;
		});

		let jsonStr: string = JSON.stringify(json);

		//MARK: - debug用トレース
		delete json.imageData;

		return jsonStr;
	}

	export const parse = async (jsonStr: string, options?: any): Promise<RViewerDocument> => {
		let slides: RSlide[] = [];
		options = options || {};

		let json: any = JSON.parse(jsonStr);

		//ver1
		if (json.version == 1 || json.version == undefined) {
			throw new Error("too old version.");
		}

		//ver2
		if (json.version >= 2) {
			let width: number = Viewer.SCREEN_WIDTH;
			let height: number = Viewer.SCREEN_HEIGHT;
			if (json.screen) {
				width = parseInt(json.screen.width) || width;
				height = parseInt(json.screen.height) || height;
			}
			options.width = width;
			options.height = height;

			//step calcurate
			let totalSteps = 0;
			let currentStep = 0;

			let imageIds = Object.keys(json.imageData);
			let totalImages = imageIds.length;
			totalSteps += totalImages;

			let totalLayers = json.slideData.reduce((sum: number, slideDatum: any) => {
				if (json.version >= 2.1) {
					return sum + slideDatum.layers.length;
				} else {
					return sum + slideDatum.images.length;
				}
			}, 0)
			totalSteps += totalLayers;

			//load images
			// for (let i = 0; i < totalImages; i++) {
			// 	let percentage = currentStep++ / totalSteps;
			// 	this.dispatchEvent(new CustomEvent("loading", { detail: percentage }));

			// 	let imageId = imageIds[i];
			// 	await ImageManager.shared.registImageData(imageId, json.imageData[imageId]);
			// }


			//construct slides
			json.slideData.forEach((slideDatum: any) => {
				let slide: RSlide = RSlide.create(width, height, []);
				slide.durationRatio = slideDatum.durationRatio || 1;
				slide.joining = Boolean(slideDatum.joining);
				slide.disabled = Boolean(slideDatum.disabled);

				let layers: any[];
				if (json.version >= 2.1) {
					layers = slideDatum.layers;
				} else {
					layers = slideDatum.images;
				}

				layers.forEach(layerDatum => {
					// let percentage = currentStep++ / totalSteps;

					switch (layerDatum.type) {
						case LayerType.TEXT:
							let textLayer = {
								text: layerDatum.text,
								transX: layerDatum.transX,
								transY: layerDatum.transY,
								scaleX: layerDatum.scaleX,
								scaleY: layerDatum.scaleY,
								rotation: layerDatum.rotation,
								mirrorH: layerDatum.mirrorH,
								mirrorV: layerDatum.mirrorV,
								opacity: layerDatum.opacity,
								locked: layerDatum.locked,
								shared: layerDatum.shared,
								visible: layerDatum.visible,
							} as RTextLayer;
							slide.layers.push(textLayer);
							break;
						case undefined:	//version < 2.1
						case LayerType.IMAGE:
							let img: RImageLayer = {
								id: layerDatum.id,
								transX: layerDatum.transX,
								transY: layerDatum.transY,
								scaleX: layerDatum.scaleX,
								scaleY: layerDatum.scaleY,
								rotation: layerDatum.rotation,
								mirrorH: layerDatum.mirrorH,
								mirrorV: layerDatum.mirrorV,
								opacity: layerDatum.opacity,
								locked: layerDatum.locked,
								shared: layerDatum.shared,
								visible: layerDatum.visible,
								clipRect: layerDatum.clipRect,
								isText: layerDatum.isText,
								name: layerDatum.name,
							} as RImageLayer;
							slide.layers.push(img);
							break;
					}
				});
				slides.push(slide);
			});

			// this.dispatchEvent(new CustomEvent("loading", { detail: 1 }));

			if (json.bgColor) options.bgColor = json.bgColor;
			if (json.createTime) options.createTime = json.createTime;
			if (json.editTime) options.editTime = json.editTime;
		}
		return RViewerDocument.create(slides, options);
	}

}



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
