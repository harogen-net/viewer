import { EventDispatcher } from "../../events/EventDispatcher";
import { Layer } from "./Layer";
import { VDoc } from "./VDoc";
import { Viewer } from "../../Viewer";
import { PropertyEvent } from "../../events/LayerEvent";


export class Slide extends EventDispatcher {

	// static slideFromImage(img:Layer):SlideView {
	// 	var slide = new SlideView($('<div />'));
	// 	slide.addLayer(img);
	// 	return slide;
	// }

	static readonly LAYER_NUM_MAX:number = 20;

	//

//	protected _layers:Layer[];
	
//	public container:any;

	
	private _id:number;
	private _width:number = 0;
	private _height:number = 0;
	// private scale_min:number = 0.2;
	// private scale_max:number = 5;
	// protected scale_base:number = 1;
	// protected _scale:number = 1;
	// protected _selected:boolean = false;

//	private _isLock:boolean = false;
	private _durationRatio:number = 1;
	private _joining:boolean = false;
	private _disabled:boolean = false;

	
	constructor(width:number = 0, height:number = 0, protected _layers:Layer[] = []){
		super();

		this._width = width || (VDoc.shared ? VDoc.shared.width : Viewer.SCREEN_WIDTH);
		this._height = height || (VDoc.shared ? VDoc.shared.height : Viewer.SCREEN_HEIGHT);
		
		this._layers.forEach(layer=>{
			layer.addEventListener(PropertyEvent.UPDATE, this.onLayerUpdate);
			layer.parent = this;
		});
		
		this._id = Math.floor(Math.random() * 90000) + 10000;
	}

	public clone():this {
		console.log("clone at slide : " + this.id, this._layers.length);
		var slide:this = new (this.constructor as any)(this._width, this._height, this._layers.map(layer=>{
			return layer.clone();
		}));

		slide.durationRatio = this.durationRatio;
		slide.joining = this.joining;
		slide.disabled = this.disabled;

		return slide;
	}

	//
	// public methods
	//
	public addLayer(layer:Layer, index:number = -1):Layer {
		if(!layer) return layer;
		if(index > this._layers.length - (this._layers.indexOf(layer) != -1 ? 1 : 0)) {
			throw new Error("invalid index.");
		}
		if(this._layers.length >= Slide.LAYER_NUM_MAX - (this._layers.indexOf(layer) != -1 ? 1 : 0)){
			throw new Error("exceeds max layer num.");
		}

		var isAdd = (this._layers.indexOf(layer) == -1);
		//console.log("addLayer at slide", layer, index, isAdd);
		// console.log(layer);

		if(!isAdd){
			this._layers.splice(this._layers.indexOf(layer), 1);
		}
		if(index == -1){
			this._layers.push(layer);
		}else{
			this._layers.splice(index, 0, layer);
		}

		if(isAdd){
			//note:layer自身に設定する重要な部分
			{
				layer.addEventListener("update", this.onLayerUpdate);
				layer.parent = this;
			}

			this.dispatchEvent(new CustomEvent("layerAdd", {detail:{slide:this, layer:layer}}));
		}else{
			this.dispatchEvent(new CustomEvent("layerUpdate", {detail:{slide:this, layer:layer}}));
		}
		this.dispatchEvent(new CustomEvent("update", {detail:this}));

		return layer;
	}

	public removeLayer(layer:Layer):Layer {
		if(!layer) return layer;
		if(this._layers.indexOf(layer) != -1){
			this._layers.splice(this._layers.indexOf(layer), 1);
			layer.parent = null;
			layer.removeEventListener(PropertyEvent.UPDATE, this.onLayerUpdate);
			this.dispatchEvent(new CustomEvent("layerRemove", {detail:{slide:this, layer:layer}}));
			this.dispatchEvent(new CustomEvent("update", {detail:this}));
		}
		return layer;
	}

	public removeAllLayers() {
		while(this._layers.length > 0){
			this.removeLayer(this._layers[0]);
		}
	}


	public fitLayer(layer:Layer):Layer {
		if(layer.originWidth == 0 || layer.originHeight ==0)
		{
			return layer;
		}

		var scaleX,scaleY;
		if(layer.rotation == 90 || layer.rotation == -90){
			scaleX = this._width / layer.originHeight;
			scaleY = this._height / layer.originWidth;
		}else{
			scaleX = this._width / layer.originWidth;
			scaleY = this._height / layer.originHeight;
		}

		var scale1:number = Math.min(scaleX, scaleY);
		var scale2:number = Math.max(scaleX, scaleY);

		if(layer.x == this.centerX && layer.y == this.centerY){
			var compRatio:number = Math.pow(10,10);
			if(Math.round(layer.scale * compRatio) == Math.round(scale1 * compRatio)){
				layer.scale = scale2;
			}else{
				layer.scale = scale1;
			}
		}else{
			layer.scale = scale1;
			layer.x = this.centerX;
			layer.y = this.centerY;
		}

		return layer;
	}


	//
	// private methods
	//
	private onLayerUpdate = (pe:PropertyEvent)=>{
		this.dispatchEvent(new CustomEvent("layerUpdate", {detail:{slide:this, layer:(pe.targe), propFlags:pe.propFlags}}));
	}


	//
	// getset
	//
	get id():number {
		return this._id;
	}
	set id(value:number) {
		this._id = value;
	}

	get width(){
		return this._width;
	}
	get height(){
		return this._height;
	}
	get centerX(){
		return this._width >> 1;
	}
	get centerY(){
		return this._height >> 1;
	}
	
	get durationRatio(){return this._durationRatio;}
	set durationRatio(value:number){
		this._durationRatio = Math.max(value, 0.4);
		this.dispatchEvent(new CustomEvent("update", {detail:this}));
	}

	set joining(value:boolean) {
		this._joining = value;
		this.dispatchEvent(new CustomEvent("update", {detail:this}));
	}
	get joining():boolean { return this._joining; }

	set disabled(value:boolean) {
		this._disabled = value;
		this.dispatchEvent(new CustomEvent("update", {detail:this}));
	}
	get disabled():boolean { return this._disabled; }

	get layers():Layer[] {
		return this._layers;
	}
	set layers(value:Layer[]) {
		this.removeAllLayers();
		value.forEach(layer=>{
			this.addLayer(layer);
		});
	}

	//


}