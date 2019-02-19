// import { EventDispatcher } from "../events/EventDispatcher";

// export class HistoryManager extends EventDispatcher {

//     private static _instance:HistoryManager;
	
// 	public static initialize(){
// 		if(!this._instance) this._instance = new HistoryManager();
// 		this._instance.initialize();
// 	}

// 	public static regist(image:Image) {
// 		if(!this._instance) this._instance = new HistoryManager();
// 		this._instance.regist(image);
// 	}

// 	public static back(image:Image) {
// 		if(!this._instance) this._instance = new HistoryManager();
// 		this._instance.deleteImage(image);
// 	}

// 	public static forward(id:string, imgObj:any) {
// 		if(!this._instance) this._instance = new HistoryManager();
// 		this._instance.swapImageAll(id, imgObj);
// 	}

// 	public static clear() {
// 		if(!this._instance) this._instance = new HistoryManager();
// 		this._instance.clear();
// 	}

// 	public static addEventListener(type:string, callback:Function, priolity?:number) {
// 		if(!this._instance) this._instance = new HistoryManager();
// 		this._instance.addEventListener(type,callback,priolity);
// 	}

// 	//

// 	private allImages:Image[];

// 	private constructor(){
// 		console.log("HistoryManager constructor");
// 		super();
// 		//this._imageById = {};
// 		this.allImages = [];
// 	}

// 	public initialize(){
// 		this.allImages = [];
// 	}

// 	public regist(image:Image) {
// 		console.log("regist called" );
// 		console.log(this.allImages.length);
// 		if(this.allImages.indexOf(image) == -1){
// 			this.allImages.push(image);
// 			console.log("HistoryManager : registed : total " + this.allImages.length);
// 		}
// 	}

// 	public deleteImage(image:Image) {
// 		if(this.allImages.indexOf(image) != -1){
// 			this.allImages.splice(this.allImages.indexOf(image), 1);
// 			console.log("HistoryManager : deleted : total " + this.allImages.length);
// 		}
// 	}

// 	public swapImageAll(id:string, imgObj:any) {
// 		this.allImages.forEach((image:Image)=>{
// 			if(image.imageId == id){
// 				var imgObj2 = imgObj.clone();
// 				imgObj2.data("imageId", imgObj.data("imageId"));
// 				image.swap(imgObj2);
// 			}
// 		});

// 		imgObj.remove();
// 	}

// }