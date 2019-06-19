import { LayerView } from "./LayerView";
//import { ILayer } from "../model/ILayer";
import { ImageLayer } from "../model/ImageLayer";
import { ImageManager } from "../../utils/ImageManager";
//import { Layer } from "../layerModel/Layer";

declare var $:any;

export class ImageView extends LayerView {

	private imgObj:any;

	constructor(protected _data:ImageLayer, public obj:any) {
		super(_data, obj);
		this._data.addEventListener("imageUpdate", this.onImageUpdate);
		this.updateImage();

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

	public destroy(){
		this._data.removeEventListener("imageUpdate", this.onImageUpdate);
		this.imgObj.remove();
		this.imgObj = null;
		super.destroy();
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

	private updateImage() {
		if(this.imgObj){
			this.imgObj.remove();
			this.imgObj = null;		
		}
		var imageData:{width:number, height:number, imgObj:any} = ImageManager.instance.getImageById(this._data.imageId);
		this.imgObj = imageData.imgObj;
		this.obj.append(this.imgObj);

		this.opacityObj = this.imgObj;
		this.opacityObj.css("opacity",this._data.opacity);
	}

	protected updateView():void {
		super.updateView();

		if(this.imageData.isClipped){
			var clipStr:string = "inset(" + this._data.clipRect.map(value=>{return value + "px"}).join(" ") + ")";
			this.imgObj.css({
				"-webkit-clip-path":clipStr,
				"clip-path":clipStr
			});
		}else{
			if(this.imgObj.css("clip-path")){
				this.imgObj.css({
					"-webkit-clip-path":"",
					"clip-path":""
				});
			}
		}
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
	/*public get imageId():string {return this._imageData.imageId;}
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
	}*/


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

	private get imageData():ImageLayer{
		return this._data as ImageLayer;
	}


	//
	// event handlers
	//
	private onImageUpdate = ()=>{
		this.updateImage();
	};
}