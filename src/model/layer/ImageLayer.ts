import { Layer, LayerType } from "../Layer";
import { ImageManager } from "../../utils/ImageManager";
import { PropertyEvent } from "../../events/PropertyEvent";
import { PropFlags } from "../PropFlags";

declare var $: any;
declare var Matrix4: any;

export class ImageLayer extends Layer {

	private _clipRect:number[] = [0,0,0,0];
	private _isText:boolean = false;
	
	constructor(private _imageId:string, transform:any = null, id:number = -1){
		super(transform, id);
		this._type = LayerType.IMAGE;
		var props = ImageManager.shared.getImagePropsById(_imageId);
		this._originWidth = props.width;
		this._originHeight = props.height;
		this._name = props.name;
	//	console.log("Image const:" , _imageId.slice(0,3) + "..", this._originWidth, this._originHeight);
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
		ret.isText = this._isText;
		return ret;
	}

	public getData():any {
		var ret:any = super.getData();
		ret.imageId = this._imageId;
		ret.clipRect = this._clipRect.concat();
		ret.isText = this._isText;
		return ret;
	}

	//
	// getset
	//
	public get imageId():string {return this._imageId;}
	public set imageId(value:string) {
		this._imageId = value;
		var data = ImageManager.shared.getImageById(this._imageId);
		this._originWidth = data.width;
		this._originHeight = data.height;
		this._name = data.name;
		
		//変形も変えてもらいたいためSCALE_Xも同時に投げているがはたして
		this.dispatchEvent(new PropertyEvent(PropertyEvent.UPDATE, this, PropFlags.IMG_IMAGEID|PropFlags.NAME|PropFlags.SCALE_X));	
	}	
	public set clipRect(value:number[]){
		this._clipRect = value.slice(0,4);
		this.dispatchEvent(new PropertyEvent(PropertyEvent.UPDATE, this, PropFlags.IMG_CLIP));
	}
	public get clipRect():number[]{
		return this._clipRect;
	}
	public set clipT(value:number){
		this._clipRect[0] = value;
		this.dispatchEvent(new PropertyEvent(PropertyEvent.UPDATE, this, PropFlags.IMG_CLIP));
	}
	public get clipT():number {
		return this._clipRect[0];
	}
	public set clipR(value:number){
		this._clipRect[1] = value;
		this.dispatchEvent(new PropertyEvent(PropertyEvent.UPDATE, this, PropFlags.IMG_CLIP));
	}
	public get clipR():number {
		return this._clipRect[1];
	}
	public set clipB(value:number){
		this._clipRect[2] = value;
		this.dispatchEvent(new PropertyEvent(PropertyEvent.UPDATE, this, PropFlags.IMG_CLIP));
	}
	public get clipB():number {
		return this._clipRect[2];
	}
	public set clipL(value:number){
		this._clipRect[3] = value;
		this.dispatchEvent(new PropertyEvent(PropertyEvent.UPDATE, this, PropFlags.IMG_CLIP));
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
	public get isClipped():boolean {
		return this._clipRect.some(value=>{
			return value != 0;
		});
	}
	public get clipString():string {
		//クリップ情報を比較する際に使う
		return this._clipRect.join(",");
	}

	public get isText(){
		return this._isText;
	}
	public set isText(value:boolean){
		if(this._isText == value) return;
		this._isText = value;
		this.dispatchEvent(new PropertyEvent(PropertyEvent.UPDATE, this, PropFlags.IMG_TEXT));
	}

	//

	public get width(){
		return this._scaleX * this.originWidth;
	}
	public get height(){
		return this._scaleY * this.originHeight;
	}
	
}
