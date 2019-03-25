declare var $: any;
declare var Matrix4: any;

export enum LayerType {
	LAYER = "layer",
	IMAGE = "image",
	TEXT = "text",
	SHAPE = "shape"
}

export class Layer {

	public obj:any;	//<div class="wrapper" />

	protected _type:LayerType = LayerType.LAYER;

	protected _id:number;

	protected _originWidth:number;
	protected _originHeight:number;

	protected _name:string = "";
	
	protected _transX:number = 0;
	protected _transY:number = 0;
	protected _scaleX:number = 1;
	protected _scaleY:number = 1;
	protected _rotation:number = 0;
	protected _mirrorH:boolean = false;
	protected _mirrorV:boolean = false;

	protected _scaleX_min:number = 1;
	protected _scaleY_min:number = 1;
	
	protected _selected:boolean = false;

	protected _locked:boolean = false;
	protected _visible:boolean = true;
	protected _opacity:number = 1;
	protected _shared:boolean = false;

	protected opacityObj:any;

	//

	constructor(transform:any = null, id:number = -1){
		if(id == -1){
			this._id = Math.floor(Math.random() * 10000000);
		}else{
			this._id = id;
		}

		this.obj = $('<div class="layerWrapper" />');

		if(transform){
			this.transform = transform;
		}else{
			this.updateMatrix();
		}
	}


	//
	//methods
	//
	public moveTo(x:number, y:number):void{
		this._transX = x - (this._originWidth / 2);
		this._transY = y - (this._originHeight / 2);

		this.updateMatrix();
	}
	public moveBy(x:number,y:number):void{
		this._transX += x;
		this._transY += y;
		
		this.updateMatrix();
	}
 	public scaleBy(scaleX:number, scaleY:number = NaN):void{
		this._scaleX *= scaleX;
		if(isNaN(scaleY)){
			this._scaleY *= scaleX;
		}else{
			this._scaleY *= scaleY;
		}
		
		this.updateMatrix();
	}
	public rotateBy(theta:number):void{
		this._rotation += theta * 180 / Math.PI;
		
		this.updateMatrix();
	}

	protected updateMatrix():void{
		//var matrix = Matrix4.identity().translate(this._transX, this._transY,0).rotateZ(this._rotation * Math.PI / 180).scale(this._scaleX * (this._mirrorH ? -1 : 1),this._scaleY * (this._mirrorV ? -1 : 1),1);
/* 		var cssMat = "matrix("
			+ matrix.values[0] + ","
			+ matrix.values[1] + ","
			+ matrix.values[4] + ","
			+ matrix.values[5] + ","
			+ matrix.values[12] + ","
			+ matrix.values[13]
			+ ")"; */
		var matrix:number[] = this.matrix;
		var cssMat:string = "matrix(" + matrix.join(",") + ")";
		this.obj.css("transform", cssMat);
	}

	protected makeData():any {
		var ret:any = {
			class:this,
			type:this._type,
			id:this._id,
			name:this._name,
			transX:this._transX,
			transY:this._transY,
			scaleX:this._scaleX,
			scaleY:this._scaleY,
			rotation:this._rotation,
			mirrorH:this._mirrorH,
			mirrorV:this._mirrorV,
			opacity:this._opacity,
			visible:this._visible,
		};
		if(this._locked) ret.locked = this._locked;
		if(this._shared) ret.shared = this._shared;
		return ret;
	}

	public clone(id:number = -1):Layer {
		var retLayer:Layer = new Layer(this.transform, this._id);
		retLayer.visible = this._visible;
		retLayer.locked = this._locked;
		retLayer.opacity = this._opacity;
		retLayer.shared = this._shared;
		return retLayer;
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
	public get width(){
		return this.obj.width()// * this._scaleX;
	}
	public get height(){
		return this.obj.height()// * this._scaleY;
	}

	public get name():string{return this._name;}
	public set name(value:string){
		this._name = value;
	}
	
	public get selected():boolean{ return this._selected;}
	public set selected(value:boolean){
		this._selected = value;
	}
	public get locked():boolean{ return this._locked;}
	public set locked(value:boolean){
		this._locked = value;
		if(this._locked){
			this.obj.addClass("locked");
		}else{
			this.obj.removeClass("locked");
		}
	}
	public get visible():boolean{ return this._visible;}
	public set visible(value:boolean){
		this._visible = value;
		if(!this._visible){
			this.obj.addClass("invisible");
		}else{
			this.obj.removeClass("invisible");
		}
	}

	public get mirrorH(){return this._mirrorH;}
	public set mirrorH(value){
		this._mirrorH = value;
		this.updateMatrix();
	}
	public get mirrorV(){return this._mirrorV;}
	public set mirrorV(value){
		this._mirrorV = value;
		this.updateMatrix();
	}
	public get shared(){return this._shared;}
	public set shared(value){
		this._shared = value;
	}
	

 	public get x():number{
		return (this._originWidth / 2) + this._transX;
	}
	public set x(value:number){
		this._transX = value - (this._originWidth / 2);
		this.updateMatrix();
	}
	public get y():number{return (this._originHeight / 2) + this._transY;}
	public set y(value:number){
		this._transY = value  - (this._originHeight / 2);
		this.updateMatrix();
	}
	public get transX():number {return this._transX;}
	public get transY():number {return this._transY;}

	public get scale(){
		if(this._scaleX == this._scaleY) return this._scaleX;
		return NaN;
	}
	public set scale(value){
		if(isNaN(value)) value = 1;
		this._scaleX = value;
		this._scaleY = value;
		this.updateMatrix();
	}
	public get scaleX(){return this._scaleX;}
	public set scaleX(value){
		if(isNaN(value)) value = 1;
		this._scaleX = (value > this._scaleX_min) ? value : this._scaleX_min;
		this.updateMatrix();
	}
	public get scaleY(){return this._scaleY;}
	public set scaleY(value){
		if(isNaN(value)) value = 1;
		this._scaleY = (value > this._scaleY_min) ? value : this._scaleY_min;
		this.updateMatrix();
	}
	public get rotation(){return this._rotation;}
	public set rotation(value){
		if(isNaN(value)) value = 0;
		this._rotation = ((value + 180) % (360)) - 180;
		this.updateMatrix();
	}
	public get angle(){
		return this._rotation * Math.PI / 180;
	}
	get opacity(){return this._opacity;}
	set opacity(value){
		if(isNaN(value)) value = 1;
		if(value > 1) value = 1;
		if(value < 0) value = 0;
		this._opacity = value;

		if(this.opacityObj){
			if(this._opacity == 1){
				this.opacityObj.css("opacity","");
			}else{
				this.opacityObj.css("opacity",this._opacity);
			}
		}
	}


	public get originWidth(){
		return this._originWidth;
	}
	public get originHeight(){
		return this._originHeight;
	}
 	public get diagonalAngle(){
		return Math.atan2(this.height, this.width);
	}

	public get transform(){
/* 		if(this._transX == 0 && this._transY == 0 && this._scaleX == 1 && this._scaleY == 1 && this._rotation == 0 && !this._mirrorH && !this._mirrorV) {
			return null;
			//nullは「初回追加時かどうか」の判別に使われており、それがバグの要因となっている。
		}*/
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
		//if(!value) throw new Error("");
		if(!value) value = {};

		this._transX = value.transX || 0;
		this._transY = value.transY || 0;
		this._scaleX = value.scaleX || 1;
		this._scaleY = value.scaleY || 1;
		this._rotation = value.rotation || 0;
		this._mirrorH = value.mirrorH || false;
		this._mirrorV = value.mirrorV || false;
		
		this.updateMatrix();
	}

	public get matrix():number[]{
		var matrix = Matrix4.identity().translate(this._transX, this._transY,0).rotateZ(this._rotation * Math.PI / 180).scale(this._scaleX * (this._mirrorH ? -1 : 1),this._scaleY * (this._mirrorV ? -1 : 1),1);
		return [matrix.values[0],matrix.values[1],matrix.values[4],matrix.values[5],matrix.values[12],matrix.values[13]];
	}

	public get data():any{
		return this.makeData();
	}

}