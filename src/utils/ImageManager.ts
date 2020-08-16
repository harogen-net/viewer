import { ImageLayer } from "../model/layer/ImageLayer";
import CryptoJS from "crypto-js";

declare var $:any;

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

	private allImages:ImageLayer[];
	private _imageById:{[key:string]:{width:number, height:number, name:string, imgObj:any}};

	private constructor(private container:any){
		console.log("ImageManager constructor");
		this._imageById = {};
		this.allImages = [];
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

	public deleteImageData(id:string) {
		var imgObjData = this._imageById[id];
		if(imgObjData == undefined) return;

		imgObjData.imgObj.remove();
		delete this._imageById[id];
	}

	public deleteAllImageData() {
		for (let id in this._imageById) {
			this.deleteImageData(id);
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