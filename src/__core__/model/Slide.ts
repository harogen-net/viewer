import { EventDispatcher } from "../../events/EventDispatcher";
import { Layer } from "./Layer";
import { VDoc } from "./VDoc";
import { Viewer } from "../../Viewer";


export class Slide extends EventDispatcher {

	// static slideFromImage(img:Layer):SlideView {
	// 	var slide = new SlideView($('<div />'));
	// 	slide.addLayer(img);
	// 	return slide;
	// }


//	static centerX():number { return Viewer.SCREEN_WIDTH >> 1; }
//	static centerY():number { return Viewer.SCREEN_HEIGHT >> 1; }

	static readonly LAYER_NUM_MAX:number = 20;

	//

//	protected _layers:Layer[];
	
//	public container:any;

	
	private _id:number;
	// private scale_min:number = 0.2;
	// private scale_max:number = 5;
	// protected scale_base:number = 1;
	// protected _scale:number = 1;
	// protected _selected:boolean = false;

//	private _isLock:boolean = false;
	private _durationRatio:number = 1;
	private _joining:boolean = false;
	private _disabled:boolean = false;

	
	constructor(private _width:number = 0, private _height:number = 0, protected _layers:Layer[] = []){
		super();

		if(this._width == 0) this._width = Viewer.SCREEN_WIDTH;
		if(this._height == 0) this._height = Viewer.SCREEN_HEIGHT;
		
//		this._layers = [];

//		this.obj.addClass("slide");

		// this.container = $('<div class="container" />').appendTo(this.obj);
		// this.container.css("width",Viewer.SCREEN_WIDTH + "px");
		// this.container.css("height",Viewer.SCREEN_HEIGHT + "px");
		
		// if(this.obj.width() == 0 && this.obj.height() == 0){
		// 	this.obj.ready(() => {
		// 		this.updateSize();
		// 	});
		// }else {
		// 	this.updateSize();
		// }
	}

	public clone():this {
		console.log("clone at slide : " + this.id);
//		var newObj:any = $('<div />');
//		var slide:this = new (this.constructor as any)(newObj);
		var slide:this = new (this.constructor as any)(this._width, this._height);

		slide.id = this.id;
		slide.durationRatio = this.durationRatio;
		slide.joining = this.joining;
		slide.disabled = this.disabled;
		console.log("this slide has " + this._layers.length + " layers.");

		this._layers.forEach(layer=>{
			slide.addLayer(layer.clone());
		});

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
		// console.log("addLayer at slide");
		// console.log(layer);

		if(!isAdd){
			this._layers.splice(this._layers.indexOf(layer), 1);
		}
		if(index != -1){
			this._layers.push(layer);
		}else{
			this._layers.splice(index, 0, layer);
		}

		if(isAdd){
			layer.addEventListener("update", this.onLayerUpdate);
			this.dispatchEvent(new CustomEvent("layerAdd", {detail:{layer:layer}}));
		}
		this.dispatchEvent(new CustomEvent("update", {detail:this}));

		return layer;
	}

	public removeLayer(layer:Layer):Layer {
		if(!layer) return layer;
		if(this._layers.indexOf(layer) != -1){
			this._layers.splice(this._layers.indexOf(layer), 1);
			layer.removeEventListener("update", this.onLayerUpdate);
			this.dispatchEvent(new CustomEvent("layerRemove", {detail:{layer:layer}}));
			this.dispatchEvent(new CustomEvent("update", {detail:this}));

		}
		return layer;
	}

	public removeAllLayers() {
		while(this._layers.length > 0){
			this.removeLayer(this._layers[0]);
		}
	}


	//
	// private methods
	//
	private onLayerUpdate(e:Event){
		//this.dispatchEvent(new Event("layerUpdate"));
		this.dispatchEvent(new CustomEvent("layerUpdate", {detail:{layer:e.target}}));
	}


	//
	// getset
	//
	get id():number {
		return this._id;
	}
	set id(value:number) {
		this._id = value;
//		this.obj.data("id",value);
	}

// 	get selected(){return this._selected;}
// 	set selected(value:boolean){
// 		this._selected = value;
// //		(this._selected) ? this.obj.addClass("selected") : this.obj.removeClass("selected");
// 	}
	
// 	get scale(){return this._scale;}
// 	set scale(value:number){
// 		//console.log("init",this._scale, this.scale_base);
// 		this._scale = value > this.scale_min ? (value < this.scale_max ? value : this.scale_max) : this.scale_min;


// 		// var actualScale:number = this._scale * this.scale_base;
// 		// var containerWidth = Viewer.SCREEN_WIDTH * actualScale;
// 		// var containerHeight = Viewer.SCREEN_HEIGHT * actualScale;
// 		// var defX = -(Viewer.SCREEN_WIDTH * (1 - actualScale) / 2) + (this.obj.width() - containerWidth) / 2;
// 		// var defY = -(Viewer.SCREEN_HEIGHT * (1 - actualScale) / 2) + (this.obj.height() - containerHeight) / 2;
		
// 		// this.container.css("transform","matrix(" + actualScale + ",0,0," + actualScale + "," + defX + "," + defY + ")");

// 		this.dispatchEvent(new Event("scale"));
// 	}
	get width(){
		return this._width;
		//return Viewer.SCREEN_WIDTH * this._scale * this.scale_base;
	}
	get height(){
		return this._height;
		//return Viewer.SCREEN_HEIGHT * this._scale * this.scale_base;
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
		// if(this.obj.attr("style")){
		// 	if(this.obj.attr("style").indexOf("width") != -1){
		// 		this.fitToHeight();
		// 	}
		// }
	}

	// set isLock(value:boolean){
	// 	this._isLock = value;
	// 	this.dispatchEvent(new Event("update"));
	// }
	// get isLock():boolean{ return this._isLock; }

	set joining(value:boolean) {
		this._joining = value;
		this.dispatchEvent(new CustomEvent("update", {detail:this}));

		// if(this._joining){
		// 	this.obj.addClass("joining");
		// }else{
		// 	this.obj.removeClass("joining");
		// }
	}
	get joining():boolean { return this._joining; }

	// set backgroundColor(colorStr:string) {
	// 	this.container.css("backgroundColor", colorStr);
	// }
	set disabled(value:boolean) {
		this._disabled = value;
		this.dispatchEvent(new CustomEvent("update", {detail:this}));


		// if(this._disabled){
		// 	this.obj.addClass("disabled");
		// }else{
		// 	this.obj.removeClass("disabled");
		// }
	}
	get disabled():boolean { return this._disabled; }

	get layers():Layer[] {
		return this._layers;
	}
	set layers(value:Layer[]) {
//		console.log("set layers called : " + value);
//		if(this._isLock) return;
		//this.setLayers(value);
		this.removeAllLayers();
		value.forEach(layer=>{
			this.addLayer(layer);
		});
//		this._layers = value;
	}

	//

// 	public fitToWidth():void {
// 		var fitHeight = (this.obj.width() / Viewer.SCREEN_WIDTH) * Viewer.SCREEN_HEIGHT;
// 		//console.log("fitToWidth : ", this.obj.width());
		
// 		this.obj.css("width","");
// 		this.obj.height(fitHeight);
// 		this.scale = this._scale;
// 	}
// 	public fitToHeight():void {
// 		//console.log("fitToHeight : ", this.obj.height());
// 		this.obj.css("height","");
// 		var durationCorrection:number = Math.atan(this._durationRatio - 1) * 0.5 + 1;
// 		if(this._durationRatio < 1){
// 			durationCorrection = Math.pow(this.durationRatio,0.4);
// 		}
// 		var fitWidth = (this.obj.height() / Viewer.SCREEN_HEIGHT) * Viewer.SCREEN_WIDTH * durationCorrection;
// 		//var fitWidth = (this.obj.height() / Viewer.SCREEN_HEIGHT) * Viewer.SCREEN_WIDTH * Math.pow(this._durationRatio, 1/3);

// 		//animate
// 		{
// 			this.obj.stop();
// 			if(this.obj.attr("style") && this.obj.attr("style").indexOf("width") != -1){
// 				this.obj.animate({"width":fitWidth},{duration :200,step:()=>{
// 					this.scale = this._scale;
// 				}});
// 			}else{
// 				this.obj.width(fitWidth);
// 				this.scale = this._scale;
// 			}
// 		}
// 		//this.obj.width(fitWidth);
// 		//this.scale = this._scale;
// 	}
// 	public updateSize():void {
// 		this.scale_base = Math.min(this.obj.width() / Viewer.SCREEN_WIDTH, this.obj.height() / Viewer.SCREEN_HEIGHT);
// 		this.scale = this._scale;
// 	}
	
// 	public fitLayer(layer:Layer):Layer {
// 		console.log("fitLayer", layer, layer.width, layer.height);
// 		if(layer.width == 0 || layer.height ==0)
// 		{
// 			return layer;
// 		}

// /*		if(layer.width == Viewer.SCREEN_WIDTH && layer.height == Viewer.SCREEN_HEIGHT){
// 			layer.x = Slide.centerX()
// 			layer.y = Slide.centerY();
// 			layer.scale = 1;
// 			return layer;
// 		}*/

// 		var scaleX,scaleY;
// 		if(layer.rotation == 90 || layer.rotation == -90){
// 			scaleX = Viewer.SCREEN_WIDTH / layer.height;
// 			scaleY = Viewer.SCREEN_HEIGHT / layer.width;
// 		}else{
// 			scaleX = Viewer.SCREEN_WIDTH / layer.width;
// 			scaleY = Viewer.SCREEN_HEIGHT / layer.height;
// 		}

// 		var scale1:number = Math.min(scaleX, scaleY);
// 		var scale2:number = Math.max(scaleX, scaleY);

// 		if(layer.x == SlideView.centerX() && layer.y == SlideView.centerY()){
// 			var compRatio:number = Math.pow(10,10);
// 			if(Math.round(layer.scale * compRatio) == Math.round(scale1 * compRatio)){
// 				layer.scale = scale2;
// 			}else{
// 				layer.scale = scale1;
// 			}
// 		}else{
// 			layer.scale = scale1;
// 			layer.x = SlideView.centerX()
// 			layer.y = SlideView.centerY();
// 		}

// 		return layer;
// 	}

	//



	//


	
	// protected setLayers(aData:Layer[]){
	// 	this._layers = aData;
	// }
}