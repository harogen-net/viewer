import {EventDispatcher} from "../events/EventDispatcher";
import { ImageLayer } from "../__core__/model/ImageLayer";
import { resolve } from "dns";

declare var $:any;

export class ImageManager extends EventDispatcher {

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
	
	// public static initialize(){
	// 	if(!this._instance) this._instance = new ImageManager();
	// 	this._instance.initialize();
	// }


	// public static getImageById(id:string):{width:number, height:number, imgObj:any} {
	// 	if(!this._instance) this._instance = new ImageManager();
	// 	return ;
	// 	//return this._instance.getImageById(id);
	// }

	// public static registImage(image:Image) {
	// 	if(!this._instance) this._instance = new ImageManager();
	// 	this._instance.registImage(image);
	// }

	// public static deleteImage(image:Image) {
	// 	if(!this._instance) this._instance = new ImageManager();
	// 	this._instance.deleteImage(image);
	// }

	// public static swapImageAll(id:string, imgObj:any) {
	// 	if(!this._instance) this._instance = new ImageManager();
	// 	this._instance.swapImageAll(id, imgObj);
	// }

	// public static addEventListener(type:string, callback:Function, priolity?:number) {
	// 	if(!this._instance) this._instance = new ImageManager();
	// 	this._instance.addEventListener(type,callback,priolity);
	// }

	//

	private allImages:ImageLayer[];
	private _imageById:{[key:string]:{width:number, height:number, name:string, imgObj:any}};

	private constructor(private container:any){
		super();

		console.log("ImageManager constructor");
		this._imageById = {};
		this.allImages = [];
	}

	public initialize(){
		console.log("initialize called" );
		// while(this.allImages.length > 0){
		// 	this.deleteImage(this.allImages.pop());
		// }
		// this.allImages = [];
	}

	public registImageData(id:string, src:string, name:string = "") {
		return new Promise((resolve)=>{
			if(this._imageById[id] != undefined) {
				resolve();
			}else{
				var imgDom = new Image();
				var imgObj = $(imgDom);
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
			name:"",
			imgObj:imgObjData.imgObj.clone()
		}
	}
	public getImagePropsById(id:string):{width:number, height:number, name:string} {
		var imgObjData = this._imageById[id];
		if(imgObjData == undefined) return null;

		return {
			width:imgObjData.width,
			height:imgObjData.height,
			name:""
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










	// public registImage(image:Image) {
	// 	console.log("registImage called" );
	// //	console.log(this.allImages.length);
	// 	if(this.allImages.indexOf(image) == -1){
	// 		this.allImages.push(image);
	// 		console.log("ImageManager : registed : total " + this.allImages.length);
	// 	}

	// 	$.each(this.allImages, (i, image2:Image)=>{
	// 		if(image2.imageId){
	// 			console.log(image2.imageId.substr(0,10) + "...");
	// 		}
	// 	});
	// }

// 	public deleteImage(image:Image) {
// 		if(this.allImages.indexOf(image) != -1){
// 			this.allImages.splice(this.allImages.indexOf(image), 1);
// 			console.log("ImageManager : deleted : total " + this.allImages.length);
// 		}
// /*		$.each(this.allImages, (i, image2:Image)=>{
// 			console.log(image2.imageId.substr(0,10) + "...");
// 		});*/
// 	}

	// public swapImageAll(id:string, imgObj:any) {
	// 	this.allImages.forEach((image:Image)=>{
	// 		if(image.imageId == id){
	// 			var imgObj2 = imgObj.clone();
	// 			imgObj2.data("imageId", imgObj.data("imageId"));
	// 			image.swap(imgObj2);
	// 		}
	// 	});

	// 	imgObj.remove();
	// }

}