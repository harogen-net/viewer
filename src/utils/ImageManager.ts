import CryptoJS from "crypto-js";
import { ViewerBridge } from "../bridge/ViewerBridge";
import { Layer, LayerType } from "../model/Layer";
import { ImageLayer } from "../model/layer/ImageLayer";
import { Slide } from "../model/Slide";
import { ViewerDocument } from "../model/ViewerDocument";
import { HistoryManager } from "./HistoryManager";

type ImageRecord = {
	width: number;
	height: number;
	name: string;
	element: HTMLImageElement;
};

export class ImageManager {
	private static _instance: ImageManager;
	public static get instance(): ImageManager {
		return this._instance;
	}
	public static get shared(): ImageManager {
		return this._instance;
	}

	public static init() {
		this._instance = new ImageManager();
	}

	//

	private _imageById: Record<string, ImageRecord | undefined>;

	private constructor() {
		console.log("ImageManager constructor");
		this._imageById = {};
	}

	public initialize() {
		for (let id in this._imageById) {
			var imgObjData = this._imageById[id];
			if (imgObjData == undefined) continue;

			delete this._imageById[id];
		}
		this.emitImageLibraryChanged();
	}

	public registImageData(id: string, src: string, name: string = "") {
		return new Promise<void>((resolve) => {
			if (this._imageById[id] != undefined) {
				resolve();
			} else {
				var imgDom = new Image();

				var onImageLoad = (e: Event) => {
					var imgDom = e.target as HTMLImageElement;
					imgDom.removeEventListener("load", onImageLoad);
					this._imageById[id].width = Math.round(imgDom.naturalWidth);
					this._imageById[id].height = Math.round(imgDom.naturalHeight);
					this.emitImageLibraryChanged();
					resolve();
				};
				imgDom.addEventListener("load", onImageLoad);
				this._imageById[id] = {
					width: imgDom.naturalWidth,
					height: imgDom.naturalHeight,
					element: imgDom,
					name: name,
				};
				imgDom.src = src;
			}
		});
	}

	public registImageFromFile(file: File): Promise<string> {
		if (file.type.indexOf("image") == -1) {
			throw new Error("select image file.");
		}

		return new Promise<string>((resolve) => {
			var reader = new FileReader();
			reader.addEventListener("load", async () => {
				var imageId = CryptoJS.SHA256(reader.result).toString();
				await this.registImageData(imageId, reader.result as string, file.name);
				resolve(imageId);
			});
			try {
				reader.readAsDataURL(file);
			} catch (err) {
				throw new Error("load error.");
			}
		});
	}

	public deleteImageById(id: string) {
		var imgObjData = this._imageById[id];
		if (imgObjData == undefined) return;

		var targets: { slide: Slide; layer: Layer; index: number }[] = [];
		ViewerDocument.shared.allLayers.forEach((layer) => {
			if (layer.type == LayerType.IMAGE && (layer as ImageLayer).imageId == id) {
				if (layer.shared) layer.shared = false;
				targets.push({
					slide: layer.parent,
					layer: layer,
					index: layer.parent.indexOf(layer),
				});
			}
		});
		if (targets.length > 0) {
			// HistoryManager.shared.record(new Command(
			// 	()=>{
			targets.forEach((target: { slide: Slide; layer: Layer; index: number }) => {
				target.slide.removeLayer(target.layer);
			});
			delete this._imageById[id];
			// 	},
			// 	()=>{
			// 		targets.forEach((target:{slide:Slide, layer:Layer, index:number})=>{
			// 			target.slide.addLayer(target.layer, target.index);
			// 		});
			// 		this.container.append(imgObjData.imgObj);
			// 		this._imageById[id] = imgObjData;
			// 	}
			// )).do();
			HistoryManager.shared.initialize();
		} else {
			delete this._imageById[id];
		}
		this.emitImageLibraryChanged();
	}

	private emitImageLibraryChanged(): void {
		ViewerBridge.emit("imageLibraryChanged", {
			images: Object.keys(this._imageById).map((id) => {
				const image = this._imageById[id];
				return {
					id,
					name: image?.name ?? "",
					width: image?.width ?? 0,
					height: image?.height ?? 0,
					src: image?.element.src ?? "",
				};
			}),
		});
	}

	public getImagePropsById(id: string): { width: number; height: number; name: string } {
		var imgObjData = this._imageById[id];
		if (imgObjData == undefined) return null;

		return {
			width: imgObjData.width,
			height: imgObjData.height,
			name: imgObjData.name,
		};
	}

	public getSrcById(id: string): string {
		var imgObjData = this._imageById[id];
		if (imgObjData == undefined) return null;
		return imgObjData.element.src;
	}

	public getImageElementById(id: string): HTMLImageElement {
		var imgObjData = this._imageById[id];
		if (imgObjData == undefined) return null;
		return imgObjData.element;
	}

	public getImageCloneElementById(id: string): HTMLImageElement {
		var imgObjData = this._imageById[id];
		if (imgObjData == undefined) return null;
		return imgObjData.element.cloneNode(true) as HTMLImageElement;
	}
}
