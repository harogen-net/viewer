import { EventDispatcher } from "../../events/EventDispatcher";
import { Slide } from "./Slide";

declare var $: any;
declare var Matrix4: any;

export enum LayerType {
	LAYER = "layer",
	IMAGE = "image",
	TEXT = "text",
	SHAPE = "shape"
}


export class Layer extends EventDispatcher{

	public static copyAttributes(toLayer:Layer, fromLayer:Layer):void {
		toLayer.transform = fromLayer.transform;
		toLayer.locked = fromLayer.locked;
		toLayer.visible = fromLayer.visible;
		toLayer.opacity = fromLayer.opacity;
		toLayer.shared = fromLayer.shared;
		toLayer.name = fromLayer.name;
	}


	//

	protected _type:LayerType = LayerType.LAYER;

	protected _id:number;
	protected _name:string = "";

	protected _originWidth:number = 0;
	protected _originHeight:number = 0;

	protected _transX:number = 0;
	protected _transY:number = 0;
	protected _scaleX:number = 1;
	protected _scaleY:number = 1;
	protected _rotation:number = 0;
	protected _mirrorH:boolean = false;
	protected _mirrorV:boolean = false;

	protected _scaleX_min:number = 0.1;
	protected _scaleY_min:number = 0.1;
	

	private readonly LOCKED:boolean = false;
	private readonly VISIBLE:boolean = true;
	private readonly OPACITY:number = 1;
	private readonly SHARED:boolean = false;

	protected _locked:boolean = this.LOCKED;
	protected _visible:boolean = this.VISIBLE;
	protected _opacity:number = this.OPACITY;
	protected _shared:boolean = this.SHARED;

	protected _parent:Slide;

	//

	constructor(transform:any = null, id:number = -1){
		super();

		if(id == -1){
			this._id = Math.floor(Math.random() * 10000000);
		}else{
			this._id = id;
		}

		if(transform){
			this.transform = transform;
		}
	}


	//
	//methods
	//
	public moveTo(x:number, y:number):void{
		this._transX = x - (this._originWidth / 2);
		this._transY = y - (this._originHeight / 2);
		this.dispatchEvent(new Event("update"));
	}
	public moveBy(x:number,y:number):void{
		this._transX += x;
		this._transY += y;
		this.dispatchEvent(new Event("update"));
	}
 	public scaleBy(scaleX:number, scaleY:number = NaN):void{
		this._scaleX *= scaleX;
		if(isNaN(scaleY)){
			this._scaleY *= scaleX;
		}else{
			this._scaleY *= scaleY;
		}
	}
	public rotateBy(theta:number):void{
		this._rotation += theta * 180 / Math.PI;
	}

	public clone(id:number = -1):this {
		var ret:this = new (this.constructor as any)(this.transform, this._id);
		ret.visible = this._visible;
		ret.locked = this._locked;
		ret.opacity = this._opacity;
		ret.shared = this._shared;
		return ret;
	}

	public getData():any {
		var ret:any = this.transform;
		ret.type = this._type.toString();
		if (this._visible != this.VISIBLE) ret.visible = this._visible;
		if (this._locked != this.LOCKED) ret.locked = this._locked;
		if (this._opacity != this.OPACITY) ret.opacity = this._opacity;
		if (this._shared != this.SHARED) ret.shared = this._shared;
		return ret;
	}

	//
	// getter / setter
	//
	public get type():LayerType {
		return this._type;
	}
	public get id():number {
		return this._id;
	}

	public get name():string{return this._name;}
	public set name(value:string){
		this._name = value;
		this.dispatchEvent(new Event("update"));
	}

	public get visible():boolean{ return this._visible;}
	public set visible(value:boolean){
		this._visible = value;
		this.dispatchEvent(new Event("update"));
	}

	public get mirrorH(){return this._mirrorH;}
	public set mirrorH(value){
		this._mirrorH = value;
		this.dispatchEvent(new Event("update"));
	}
	public get mirrorV(){return this._mirrorV;}
	public set mirrorV(value){
		this._mirrorV = value;
		this.dispatchEvent(new Event("update"));
	}
	public get shared(){return this._shared;}
	public set shared(value){
		this._shared = value;
		this.dispatchEvent(new Event("update"));
	}
	public get locked(){return this._locked;}
	public set locked(value){
		this._locked = value;
		this.dispatchEvent(new Event("update"));
	}
	

 	public get x():number{
		return (this._originWidth / 2) + this._transX;
	}
	public set x(value:number){
		this._transX = value - (this._originWidth / 2);
		this.dispatchEvent(new Event("update"));
	}
	public get y():number{return (this._originHeight / 2) + this._transY;}
	public set y(value:number){
		this._transY = value  - (this._originHeight / 2);
		this.dispatchEvent(new Event("update"));
	}

	public set transX(value:number) {
		this._transX = value;		
		this.dispatchEvent(new Event("update"));
	}
	public get transX():number {return this._transX;}
	public set transY(value:number) {
		this._transY = value;		
		this.dispatchEvent(new Event("update"));
	}
	public get transY():number {return this._transY;}

	public get scale(){
		if(this._scaleX == this._scaleY) return this._scaleX;
		return NaN;
	}
	public set scale(value){
		if(isNaN(value)) value = 1;
		value = Math.max(Math.max(value, this._scaleX_min), this._scaleY_min);
		this._scaleX = value;
		this._scaleY = value;
		this.dispatchEvent(new Event("update"));
	}
	public get scaleX(){return this._scaleX;}
	public set scaleX(value){
		if(isNaN(value)) value = 1;
		this._scaleX = (value > this._scaleX_min) ? value : this._scaleX_min;
		this.dispatchEvent(new Event("update"));
	}
	public get scaleY(){return this._scaleY;}
	public set scaleY(value){
		if(isNaN(value)) value = 1;
		this._scaleY = (value > this._scaleY_min) ? value : this._scaleY_min;
		this.dispatchEvent(new Event("update"));
	}
	public get rotation(){return this._rotation;}
	public set rotation(value){
		if(isNaN(value)) value = 0;
		this._rotation = ((value + 180) % (360)) - 180;
		this.dispatchEvent(new Event("update"));
	}
	public get angle(){
		return this._rotation * Math.PI / 180;
	}
	public get opacity(){return this._opacity;}
	public set opacity(value){
		if(isNaN(value)) value = 1;
		if(value > 1) value = 1;
		if(value < 0) value = 0;
		this._opacity = value;
		this.dispatchEvent(new Event("update"));
	}


	public get width(){ return this._originWidth * this._scaleX; }
	public get height(){ return this._originHeight * this._scaleY; }

	public get originWidth(){return this._originWidth;}
	public set originWidth(value:number){
		this._originWidth = value;
		this.dispatchEvent(new Event("update"));
	}
	public get originHeight(){return this._originHeight;}
	public set originHeight(value:number){
		this._originHeight = value;
		this.dispatchEvent(new Event("update"));
	}
 	// public get diagonalAngle(){
	// 	return Math.atan2(this.height, this.width);
	// }

	public get transform(){
		return {
			transX:this._transX,
			transY:this._transY,
			scaleX:this._scaleX,
			scaleY:this._scaleY,
			rotation:this._rotation,
			mirrorH:this._mirrorH,
			mirrorV:this._mirrorV,
		};
	}
	public set transform(value:any){
		if(!value) value = {};

		this._transX = value.transX || 0;
		this._transY = value.transY || 0;
		this._scaleX = value.scaleX || 1;
		this._scaleY = value.scaleY || 1;
		this._rotation = value.rotation || 0;
		this._mirrorH = value.mirrorH || false;
		this._mirrorV = value.mirrorV || false;
		this.dispatchEvent(new Event("update"));
	}

	public get matrix():number[]{
		var matrix = Matrix4.identity().translate(this._transX, this._transY,0).rotateZ(this._rotation * Math.PI / 180).scale(this._scaleX * (this._mirrorH ? -1 : 1),this._scaleY * (this._mirrorV ? -1 : 1),1);
		return [matrix.values[0],matrix.values[1],matrix.values[4],matrix.values[5],matrix.values[12],matrix.values[13]];
	}

	public set parent(value:Slide) {
	//	if(value != null && this._parent != null) throw new Error("");
		this._parent = value;
	}
	public get parent():Slide {return this._parent;}

}