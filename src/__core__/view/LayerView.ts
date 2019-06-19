import { Layer, LayerType } from "../model/Layer";
import { setTimeout } from "timers";
//import { ILayer } from "../layerModel/ILayer";


declare var $: any;
declare var Matrix4: any;

export class LayerView {

//	protected _data:Layer;

	protected _selected:boolean = false;
	protected opacityObj:any;


	constructor(protected _data:Layer, public obj:any) {
		if(_data == null || obj == null || obj.length != 1) throw new Error("");

		this._data.addEventListener("update", this.onLayerUpdate);
		
		//子クラスで初期化が終わった後に処理を行うため別スレッドに
		this.obj.hide();
		setTimeout(()=>{
			this.updateView();
			this.obj.show();
		},1);
	}

	// public clone():this {
	// 	var ret:this = new (this.constructor as any)(this._data, this.obj.clone());
	// 	return ret;
	// }

	public destroy(){
		this._data.removeEventListener("update", this.onLayerUpdate);
		this.obj.remove();
		this.obj = null;
	}

	//
	//methods
	//
/*	public moveTo(x:number, y:number):void{
		this._data.moveTo(x,y);
		this.updateMatrix();
	}
	public moveBy(deltaX:number,deltaY:number):void{
		this._data.moveBy(deltaX,deltaY);
		this.updateMatrix();
	}
 	public scaleBy(scaleX:number, scaleY:number = NaN):void{
		 this._data.scaleBy(scaleX, scaleY);
		this.updateMatrix();
	}
	public rotateBy(theta:number):void{
		this._data.rotateBy(theta);
		this.updateMatrix();
	}*/

	protected updateMatrix() {
		var matrix:number[] = this._data.matrix;
		var cssMat:string = "matrix(" + matrix.join(",") + ")";
		this.obj.css("transform", cssMat);
	}

	protected updateView() {
		if(!this._data.visible){
			this.obj.addClass("invisible");
		}else{
			this.obj.removeClass("invisible");
		}
		if(this._data.locked){
			this.obj.addClass("locked");
		}else{
			this.obj.removeClass("locked");
		}
		if(this.opacityObj){
			if(this._data.opacity == 1){
				this.opacityObj.css("opacity","");
			}else{
				this.opacityObj.css("opacity",this._data.opacity);
			}
		}
		this.updateMatrix();
	}




	//
	// getter / setter
	//
	public get data():Layer {
		return this._data;
	}
	public get type():LayerType {
		return this._data.type;
	}
	public get id():number {
		return this._data.id;
	}
	public get width(){
		return this.obj.width();
	}
	public get height(){
		return this.obj.height();
	}

/*	public get name():string{return this._data.name;}
	public set name(value:string){
		this._data.name = value;
	}
	
	public get locked():boolean{ return this._data.locked;}
	public set locked(value:boolean){
		this._data.locked = value;

		if(this._data.locked){
			this.obj.addClass("locked");
		}else{
			this.obj.removeClass("locked");
		}
	}
	public get visible():boolean{ return this._data.visible;}
	public set visible(value:boolean){
		this._data.visible = value;

		if(!this._data.visible){
			this.obj.addClass("invisible");
		}else{
			this.obj.removeClass("invisible");
		}
	}

	public get mirrorH(){return this._data.mirrorH;}
	public set mirrorH(value){
		this._data.mirrorH = value;
		this.updateMatrix();
	}
	public get mirrorV(){return this._data.mirrorV;}
	public set mirrorV(value){
		this._data.mirrorV = value;
		this.updateMatrix();
	}
	public get shared(){return this._data.shared;}
	public set shared(value){
		this._data.shared = value;
	}
	

	public get x():number{return this._data.x;}
	public set x(value:number){
		this._data.x = value;
		this.updateMatrix();
	}
	public get y():number{return this._data.y;}
	public set y(value:number){
		this._data.y = value;
		this.updateMatrix();
	}
	public get transX():number {return this._data.transX;}
	public get transY():number {return this._data.transY;}

	public get scale(){
		return this._data.scale;
	}
	public set scale(value){
		this._data.scale = value;
		this.updateMatrix();
	}
	public get scaleX(){return this._data.scaleX;}
	public set scaleX(value){
		if(isNaN(value)) value = 1;
		this._data.scaleX = value;
		this.updateMatrix();
	}
	public get scaleY(){return this._data.scaleY;}
	public set scaleY(value){
		this._data.scaleY = value;
		this.updateMatrix();
	}
	public get rotation(){return this._data.rotation;}
	public set rotation(value){
		this._data.rotation = value;
		this.updateMatrix();
	}
	public get angle(){
		return this._data.angle;
	}
	public get opacity(){return this._data.opacity;}
	public set opacity(value){
		this._data.opacity = value;

		if(this.opacityObj){
			if(this._data.opacity == 1){
				this.opacityObj.css("opacity","");
			}else{
				this.opacityObj.css("opacity",this._data.opacity);
			}
		}
	}


	public get originWidth(){
		return this._data.originWidth;
	}
	public get originHeight(){
		return this._data.originHeight;
	}
 	public get diagonalAngle(){
		return Math.atan2(this.height, this.width);
	}

	public get transform(){
		return this._data.transform;
	}
	public set transform(value:any){
		this._data.transform = value;
		this.updateMatrix();
	}*/

	//


	public get selected():boolean{ return this._selected;}
	public set selected(value:boolean){
		this._selected = value;
	}



	//
	// event handlers
	//
	private onLayerUpdate = ()=>{
		this.updateView();
	};

}