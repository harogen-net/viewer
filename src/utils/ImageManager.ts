import {EventDispatcher} from "../events/EventDispatcher";
import { Image } from "../__core__/Image";

declare var $:any;

export class ImageManager extends EventDispatcher {

    private static _instance:ImageManager;

/*    public static get instance():ImageManager {
        if (!this._instance) {
            this._instance = new ImageManager();
        }
        return this._instance;
	}*/
	
	public static initialize(){
		if(!this._instance) this._instance = new ImageManager();
		this._instance.initialize();
	}

	public static registImage(image:Image) {
		if(!this._instance) this._instance = new ImageManager();
		this._instance.registImage(image);
	}

	public static deleteImage(image:Image) {
		if(!this._instance) this._instance = new ImageManager();
		this._instance.deleteImage(image);
	}

	public static swapImageAll(id:string, imgObj:any) {
		if(!this._instance) this._instance = new ImageManager();
		this._instance.swapImageAll(id, imgObj);
	}

	public static addEventListener(type:string, callback:Function, priolity?:number) {
		if(!this._instance) this._instance = new ImageManager();
		this._instance.addEventListener(type,callback,priolity);
	}

	//

	private allImages:Image[];

	private constructor(){
		super();
		//this._imageById = {};
		this.allImages = [];
	}

	public initialize(){
		this.allImages = [];
	}

	public registImage(image:Image) {
		if(this.allImages.indexOf(image) == -1){
			this.allImages.push(image);
			//console.log("ImageManager : registed : total " + this.allImages.length);
		}
	}

	public deleteImage(image:Image) {
		if(this.allImages.indexOf(image) != -1){
			this.allImages.splice(this.allImages.indexOf(image), 1);
			//console.log("ImageManager : deleted : total " + this.allImages.length);
		}
	}

	public swapImageAll(id:string, imgObj:any) {
		this.allImages.forEach((image:Image)=>{
			if(image.imageId == id){
				var imgObj2 = imgObj.clone();
				imgObj2.data("imageId", imgObj.data("imageId"));
				image.swap(imgObj2);
			}
		});

		imgObj.remove();
	}

}