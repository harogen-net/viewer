import { Layer, LayerType } from "./Layer";
//import { IImage } from "./ILayer";
import { ImageManager } from "../../utils/ImageManager";

declare var $: any;
declare var Matrix4: any;

export class ImageLayer extends Layer {

	private _clipRect:number[] = [0,0,0,0];
	
	constructor(private _imageId:string, transform:any = null, id:number = -1){
		super(transform, id);
		console.log("Image const:" , _imageId);
		this._type = LayerType.IMAGE;

		this._originWidth = ImageManager.shared.getImageById(_imageId).width;
		this._originHeight = ImageManager.shared.getImageById(_imageId).height;
	}

	//
	// override
	//
	public clone(id:number = -1):this {
		var ret:this = new (this.constructor as any)(this._imageId, this.transform, this._id);
		ret.visible = this._visible;
		ret.locked = this._locked;
		ret.opacity = this._opacity;
		ret.shared = this._shared;
		ret.clipRect = this._clipRect;
		return ret;
	}

	//
	// getset
	//
	public get imageId():string {return this._imageId;}
	public set imageId(value:string) {
		this._imageId = this.imageId;
	}	
	public set clipRect(value:number[]){
		this._clipRect = value.slice(0,4);
	}
	public get clipRect():number[]{
		return this._clipRect;
	}
	public set clipT(value:number){
		this._clipRect[0] = value;
	}
	public get clipT():number {
		return this._clipRect[0];
	}
	public set clipR(value:number){
		this._clipRect[1] = value;
	}
	public get clipR():number {
		return this._clipRect[1];
	}
	public set clipB(value:number){
		this._clipRect[2] = value;
	}
	public get clipB():number {
		return this._clipRect[2];
	}
	public set clipL(value:number){
		this._clipRect[3] = value;
	}
	public get clipL():number {
		return this._clipRect[3];
	}
	public get clipedWidth(){
		return this._originWidth - (this._clipRect[1] + this._clipRect[3]);
	}
	public get clipedHeight(){
		return this._originHeight - (this._clipRect[0] + this._clipRect[2]);
	}

	//

	public get width(){
		return this._scaleX * this.originWidth;
	}
	public get height(){
		return this._scaleY * this.originHeight;
	}
	
}
