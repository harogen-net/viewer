import { ImageLayer } from "../model/layer/ImageLayer";
import CryptoJS from "crypto-js";
import { ViewerDocument } from "../model/ViewerDocument";
import { HistoryManager, Transaction, Command } from "./HistoryManager";
import { Layer, LayerType } from "../model/Layer";
import { Slide } from "../model/Slide";
import $ from "jquery";

export class ImageManager {

	private static _instance:ImageManager;
	public static get instance():ImageManager {
		return this._instance;
	}
	public static get shared():ImageManager {
		return this._instance;
	}

	public static init(container:any) {
		this._instance = new ImageManager(container);
	}
	
	//

	private _imageById:{[key:string]:{width:number, height:number, name:string, imgObj:any}};

	private constructor(private container:any){
		console.log("ImageManager constructor");
		this._imageById = {};
	}

	public initialize() {
		for (let id in this._imageById) {
			var imgObjData = this._imageById[id];
			if(imgObjData == undefined) continue;
	
			imgObjData.imgObj.remove();
			delete this._imageById[id];
		}
	}

	public registImageData(id:string, src:string, name:string = "") {
		return new Promise((resolve)=>{
			if(this._imageById[id] != undefined) {
				resolve();
			}else{
				var imgDom = new Image();
				var imgObj = $(imgDom);

				//set data for drop to slide or list.
				imgObj.prop("draggable", true);
				imgObj.on("dragstart.imageManager", (e)=>{
					e.originalEvent.dataTransfer.setData('imageId', id);
				});

				var onImageLoad = (e:Event)=>{
					var imgDom = (e.target as HTMLImageElement);
					imgDom.removeEventListener("load", onImageLoad);
					this._imageById[id].width = Math.round(imgDom.naturalWidth);
					this._imageById[id].height = Math.round(imgDom.naturalHeight);
					resolve();
				};
				imgDom.addEventListener("load", onImageLoad);
				this.container.append(imgObj);
				this._imageById[id] = {
					width:imgDom.naturalWidth,
					height:imgDom.naturalHeight,
					imgObj:imgObj,
					name:name
				};
				imgDom.src = src;

				imgObj.on("dblclick", ()=>{
					if (window.confirm("delete image. are you sure?")) {
						this.deleteImageById(id);
					}
				});
			}
		});
	}

	public registImageFromFile(file:File):Promise<string> {
		if(file.type.indexOf("image") == -1) {
			throw new Error("select image file.");
		}

		return new Promise<string>((resolve)=>{
			var reader = new FileReader();
			reader.addEventListener('load', async () => {
				var imageId = CryptoJS.SHA256(reader.result).toString();
				await this.registImageData(imageId, reader.result as string, file.name);
				resolve(imageId);
			});
			try{
				reader.readAsDataURL(file);
			}
			catch(err){
				throw new Error("load error.");
			}		
		});
	}

	public deleteImageById(id:string) {
		var imgObjData = this._imageById[id];
		if(imgObjData == undefined) return;

		var targets:{slide:Slide, layer:Layer, index:number}[] = [];
		ViewerDocument.shared.allLayers.forEach((layer)=>{
			if (layer.type == LayerType.IMAGE && (layer as ImageLayer).imageId == id) {
				targets.push({
					slide:layer.parent,
					layer:layer,
					index:layer.parent.indexOf(layer)
				});
			}
		});
		if (targets.length > 0){
			// HistoryManager.shared.record(new Command(
			// 	()=>{
					targets.forEach((target:{slide:Slide, layer:Layer, index:number})=>{
						target.slide.removeLayer(target.layer);
					});
					// imgObjData.imgObj.detach();
					imgObjData.imgObj.remove();
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
		}
	}

	public getImageById(id:string):{width:number, height:number, name:string, imgObj:any} {
		var imgObjData = this._imageById[id];
		if(imgObjData == undefined) return null;

		return {
			width:imgObjData.width,
			height:imgObjData.height,
			name:imgObjData.name,
			imgObj:imgObjData.imgObj.clone()
		}
	}
	public getImagePropsById(id:string):{width:number, height:number, name:string} {
		var imgObjData = this._imageById[id];
		if(imgObjData == undefined) return null;

		return {
			width:imgObjData.width,
			height:imgObjData.height,
			name:imgObjData.name
		}
	}

	public getSrcById(id:string):string {
		var imgObjData = this._imageById[id];
		if(imgObjData == undefined) return null;
		return (imgObjData.imgObj[0] as HTMLImageElement).src;
	}

	public getImageElementById(id:string):HTMLImageElement {
		var imgObjData = this._imageById[id];
		if(imgObjData == undefined) return null;
		return imgObjData.imgObj[0] as HTMLImageElement;
	}









}