import { LayerView } from "./LayerView";
//import { ILayer } from "../model/ILayer";
import { ImageLayer } from "../model/ImageLayer";
import { ImageManager } from "../../utils/ImageManager";
//import { Layer } from "../layerModel/Layer";

declare var $:any;

export class ImageView extends LayerView {

	private imgObj:any;

	constructor(protected _imageData:ImageLayer, public obj:any) {
		super(_imageData, obj);
		this.setImgObj();

		//console.log(imgObj, this._id, this._type);

		//

/*		this.setOriginalSize(imgObj);
		this.obj.append(imgObj);

		this._imageId = imgObj.data("imageId");
		if(imgObj.data("name") != undefined){
			this._name = imgObj.data("name");
		}
		this.opacityObj = imgObj;*/
	}


	//public swap(imgObj:any) {
	/*public swap(newImageId:string) {
		console.log("swap at image id:" + this._id);
		this._imageId = newImageId;

		if(this.imgObj){
			this.imgObj.remove();
			this.setImgObj();
		}
	}*/

	private setImgObj() {
		var imageData:{width:number, height:number, imgObj:any} = ImageManager.instance.getImageById(this._imageData.imageId);
		this._data.originWidth = imageData.width;
		this._data.originHeight = imageData.height;
		this.imgObj = imageData.imgObj;
		this.obj.append(this.imgObj);

		//NOTE : opacityのみimgObjへの指定なので再設定
		this.opacityObj = this.imgObj;
		this._data.opacity = this._data.opacity;
	}

	//
	
	//
	// override
	//

	// public clone():LayerView {
	// 	var retImg:ImageView = new ImageView(this._data.clone(), $('<div />'));
	// 	retImg.clipRect = this.clipRect;
		
	// 	return retImg;
	// }


	
	//
	// getset
	//
	public get imageId():string {return this._imageData.imageId;}
	public set imageId(value:string) {
		this._imageData.imageId = this.imageId;
	}	
	public set clipRect(value:number[]){
		this._imageData.clipRect = value.slice(0,4);
	}
	public get clipRect():number[]{
		return this._imageData.clipRect;
	}
	public set clipT(value:number){
		this._imageData.clipRect[0] = value;
	}
	public get clipT():number {
		return this._imageData.clipRect[0];
	}
	public set clipR(value:number){
		this._imageData.clipRect[1] = value;
	}
	public get clipR():number {
		return this._imageData.clipRect[1];
	}
	public set clipB(value:number){
		this._imageData.clipRect[2] = value;
	}
	public get clipB():number {
		return this._imageData.clipRect[2];
	}
	public set clipL(value:number){
		this._imageData.clipRect[3] = value;
	}
	public get clipL():number {
		return this._imageData.clipRect[3];
	}
	public get clipedWidth(){
		return this._imageData.originWidth - (this._imageData.clipRect[1] + this._imageData.clipRect[3]);
	}
	public get clipedHeight(){
		return this._imageData.originHeight - (this._imageData.clipRect[0] + this._imageData.clipRect[2]);
	}


	//

	public get width(){
		if(this.obj.width() == 0){
			return this._data.scaleX * this._data.originWidth;
		}else{
			return this.obj.width();
		}
	}
	public get height(){
		if(this.obj.height() == 0){
			return this._data.scaleY * this._data.originHeight;
		}else{
			return this.obj.height();
		}
	}
}