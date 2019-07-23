import { Layer, LayerType } from "../model/Layer";
import { setTimeout } from "timers";
import { EventDispatcher } from "../../events/EventDispatcher";
import { PropertyEvent } from "../../events/PropertyEvent";
import { PropFlags } from "../model/PropFlags";


declare var $: any;
declare var Matrix4: any;

export class LayerView extends EventDispatcher {

//	protected _data:Layer;

	protected _selected:boolean = false;
	protected opacityObj:any;


	constructor(protected _data:Layer, public obj:any) {
		super();
		if(_data == null || obj == null || obj.length != 1) throw new Error("");
		this.constructMain();
		this.updateView();
	}
	protected constructMain() {
		//override me
		this._data.addEventListener(PropertyEvent.UPDATE, this.onLayerUpdate);
	}

	// public clone():this {
	// 	var ret:this = new (this.constructor as any)(this._data, this.obj.clone());
	// 	return ret;
	// }

	public destroy(){
		this.clearEventListener();
		this._data.removeEventListener(PropertyEvent.UPDATE, this.onLayerUpdate);
		this.obj.remove();
		this.obj = null;
	}

	//
	//methods
	//
	protected updateMatrix() {
		var matrix:number[] = this._data.matrix;
		var cssMat:string = "matrix(" + matrix.join(",") + ")";
		this.obj.css("transform", cssMat);
	}

	protected updateView(flag:number = PropFlags.ALL) {
		if(flag & PropFlags.VISIBLE){
			if(!this._data.visible){
				this.obj.addClass("invisible");
			}else{
				this.obj.removeClass("invisible");
			}
		}
		if(flag & PropFlags.LOCKED){
			if(this._data.locked){
				this.obj.addClass("locked");
			}else{
				this.obj.removeClass("locked");
			}
		}
		if(this.opacityObj && (flag & PropFlags.OPACITY)){
			if(this._data.opacity == 1){
				this.opacityObj.css("opacity","");
			}else{
				this.opacityObj.css("opacity",this._data.opacity);
			}
		}

		if(flag & (PropFlags.X|PropFlags.Y|PropFlags.SCALE_X|PropFlags.SCALE_Y|PropFlags.ROTATION|PropFlags.MIRROR_H|PropFlags.MIRROR_V)){
			this.updateMatrix();
		}
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

	//


	public get selected():boolean{ return this._selected;}
	public set selected(value:boolean){
		if(this._selected == value) return;
		this._selected = value;
		this.dispatchEvent(new PropertyEvent(PropertyEvent.UPDATE, this, PropFlags.LV_SELECT));
//		if(this._selected){
//			this.dispatchEvent(new CustomEvent("select", {detail:this}));
//		}else{
			//this.dispatchEvent(new CustomEvent("unselect", {detail:this}));
//		}
	}



	//
	// event handlers
	//
	protected onLayerUpdate = (pe:PropertyEvent)=>{
		this.updateView(pe.propFlags);
	};

}