import { Image } from "./layer/Image";
import {EventDispatcher} from "../events/EventDispatcher";
import { ImageManager } from "../utils/ImageManager";
import { Viewer } from "../Viewer";
import { Layer, LayerType } from "./Layer";

declare var $: any;

export class Slide extends EventDispatcher {
	static slideFromImage(img:Layer):Slide {
		var slide = new Slide($('<div />'));
		slide.addLayer(img);
		return slide;
	}

	static centerX():number { return Viewer.SCREEN_WIDTH >> 1; }
	static centerY():number { return Viewer.SCREEN_HEIGHT >> 1; }

	static readonly LAYER_NUM_MAX:number = 100;

	//

	protected _layers:Layer[];
	
	public container:any;

	
	private _id:number;
	private scale_min:number = 0.2;
	private scale_max:number = 5;
	protected scale_base:number = 1;
	protected _scale:number = 1;
	protected _selected:boolean = false;

	private _isLock:boolean = false;
	private _durationRatio:number = 1;
	private _joining:boolean = false;

	
	constructor(public obj:any){
		super();
		
		this._layers = [];

		this.obj.addClass("slide");

		this.container = $('<div class="container" />').appendTo(this.obj);
		this.container.css("width",Viewer.SCREEN_WIDTH + "px");
		this.container.css("height",Viewer.SCREEN_HEIGHT + "px");
		
		if(this.obj.width() == 0 && this.obj.height() == 0){
			this.obj.ready(() => {
				this.updateSize();
			});
		}else {
			this.updateSize();
		}
	}

	public addLayer(layer:Layer, index:number = -1):Layer {
		if(!layer) return layer;

		console.log("addLayer at slide : " + layer.id);

		if(this._layers.indexOf(layer) != -1){
			this._layers.splice(this._layers.indexOf(layer), 1);
		}else {
			if(this._layers.length >= Slide.LAYER_NUM_MAX){
				alert("max layer num exceeded.");
				return layer;
			}
			this._layers.push(layer);
		}
		
		this.container.append(layer.obj);
		
		
		this.setLayersZIndex();
		
		if(layer.type == LayerType.IMAGE){
			ImageManager.registImage(layer as Image);

			if(!layer.transform){
				if(layer.originHeight > (layer.originWidth * 1.2)) {
					layer.rotation -= 90;
				}
				this.fitLayer(layer);
			}
		}else {
			layer.moveTo(Viewer.SCREEN_WIDTH >> 1, Viewer.SCREEN_HEIGHT >> 1);
		}

		return layer;
	}

	public removeLayer(layer:Layer):Layer {
		if(!layer) return layer;
		if(this._layers.indexOf(layer) != -1){
			this._layers.splice(this._layers.indexOf(layer), 1);
		}

		if(layer.type == LayerType.IMAGE){
			ImageManager.deleteImage(layer as Image);
		}
		layer.obj.remove();

		this.setLayersZIndex();
		
		return layer;
	}

	public removeAllLayers() {
		while(this._layers.length > 0){
			this.removeLayer(this._layers[0]);
		}
	}

	//

	get id():number {
		return this._id;
	}
	set id(value:number) {
		this._id = value;
		this.obj.data("id",value);
	}

	get selected(){return this._selected;}
	set selected(value:boolean){
		this._selected = value;
		(this._selected) ? this.obj.addClass("selected") : this.obj.removeClass("selected");
	}
	
	get scale(){return this._scale;}
	set scale(value:number){
		//console.log("init",this._scale, this.scale_base);
		this._scale = value > this.scale_min ? (value < this.scale_max ? value : this.scale_max) : this.scale_min;
		var actualScale:number = this._scale * this.scale_base;
		var containerWidth = Viewer.SCREEN_WIDTH * actualScale;
		var containerHeight = Viewer.SCREEN_HEIGHT * actualScale;
		var defX = -(Viewer.SCREEN_WIDTH * (1 - actualScale) / 2) + (this.obj.width() - containerWidth) / 2;
		var defY = -(Viewer.SCREEN_HEIGHT * (1 - actualScale) / 2) + (this.obj.height() - containerHeight) / 2;
		
		this.container.css("transform","matrix(" + actualScale + ",0,0," + actualScale + "," + defX + "," + defY + ")");

		this.dispatchEvent(new Event("scale"));
	}
	get width(){
		return Viewer.SCREEN_WIDTH * this._scale * this.scale_base;
	}
	get height(){
		return Viewer.SCREEN_HEIGHT * this._scale * this.scale_base;
	}
	
	get durationRatio(){return this._durationRatio;}
	set durationRatio(value:number){
		this._durationRatio = Math.max(value, 0.4);
		if(this.obj.attr("style")){
			if(this.obj.attr("style").indexOf("width") != -1){
				this.fitToHeight();
			}
		}
	}

	get layers():Layer[]{
		return this._layers.concat();
	}

	set isLock(value:boolean){ this._isLock = value; }
	get isLock():boolean{ return this._isLock; }

	set joining(value:boolean) {
		this._joining = value;
		if(this._joining){
			this.obj.addClass("joining");
		}else{
			this.obj.removeClass("joining");
		}
	}
	get joining():boolean { return this._joining; }

	set backgroundColor(colorStr:string) {
		this.container.css("backgroundColor", colorStr);
	}

	//

	public fitToWidth():void {
		var fitHeight = (this.obj.width() / Viewer.SCREEN_WIDTH) * Viewer.SCREEN_HEIGHT;
		//console.log("fitToWidth : ", this.obj.width());
		
		this.obj.css("width","");
		this.obj.height(fitHeight);
		this.scale = this._scale;
	}
	public fitToHeight():void {
		//console.log("fitToHeight : ", this.obj.height());
		this.obj.css("height","");
		var durationCorrection:number = Math.atan(this._durationRatio - 1) + 1;
		if(this._durationRatio < 1){
			durationCorrection = Math.pow(this.durationRatio,0.4);
		}
		var fitWidth = (this.obj.height() / Viewer.SCREEN_HEIGHT) * Viewer.SCREEN_WIDTH * durationCorrection;
		//var fitWidth = (this.obj.height() / Viewer.SCREEN_HEIGHT) * Viewer.SCREEN_WIDTH * Math.pow(this._durationRatio, 1/3);

		//animate
		{
			this.obj.stop();
			if(this.obj.attr("style") && this.obj.attr("style").indexOf("width") != -1){
				this.obj.animate({"width":fitWidth},{duration :200,step:()=>{
					this.scale = this._scale;
				}});
			}else{
				this.obj.width(fitWidth);
				this.scale = this._scale;
			}
		}
		//this.obj.width(fitWidth);
		//this.scale = this._scale;
	}
	public updateSize():void {
		this.scale_base = Math.min(this.obj.width() / Viewer.SCREEN_WIDTH, this.obj.height() / Viewer.SCREEN_HEIGHT);
		this.scale = this._scale;
	}
	
	public fitLayer(img:Layer):Layer {
		var scaleX,scaleY;
		if(img.rotation == 90 || img.rotation == -90){
			scaleX = Viewer.SCREEN_WIDTH / img.height;
			scaleY = Viewer.SCREEN_HEIGHT / img.width;
		}else{
			scaleX = Viewer.SCREEN_WIDTH / img.width;
			scaleY = Viewer.SCREEN_HEIGHT / img.height;
		}

		var scale1:number = Math.min(scaleX, scaleY);
		var scale2:number = Math.max(scaleX, scaleY);

		if(img.x == Slide.centerX() && img.y == Slide.centerY()){
			var compRatio:number = Math.pow(10,10);
			if(Math.round(img.scale * compRatio) == Math.round(scale1 * compRatio)){
				img.scale = scale2;
			}else{
				img.scale = scale1;
			}
		}else{
			img.scale = Math.min(scaleX, scaleY);
			img.x = Slide.centerX()
			img.y = Slide.centerY();
		}

		return img;
	}

	//

	public clone():Slide {
		console.log("clone at slide : " + this.id);
		var newObj:any = $('<div />');
		var slide:Slide = new Slide(newObj);

		slide.id = this.id;
		slide.durationRatio = this.durationRatio;
		slide.joining = this.joining;
		slide.isLock = this.isLock;
		console.log("this slide has " + this.layers.length + " images.");
		$.each(this._layers, (index:number, layer:Layer) => {
			slide.addLayer(layer.clone());
		});

		return slide;
	}

	//

	getData():any[] {
		var ret:any[] = [];
		$.each(this._layers, (index:number,img:Layer) => {
			ret.push(img.data);
		});
		return ret;
	}

	setData(aData:any[]){
		if(this._isLock) return;
		
		var i,j:number;
		var layer:Layer;
		var datum:{class:Layer};
		var found:boolean;
		var newLayers:Layer[] = [];

		for(i = 0; i < this._layers.length; i++){
			layer = this._layers[i];
			found = false;
			$.each(aData, (j, datum) => {
				if(datum.class.id == layer.id) {
					if(datum.class.type == LayerType.IMAGE){
						if((datum.class as Image).imageId == (layer as Image).imageId){
							layer.name = datum.class.name;
							found = true;
						}
					}
				}
			});
			if(!found){
				//console.log("\t", img.imageId.slice(0,8) + "～のImageが不必要です");
				this.removeLayer(layer);
				i--;
			}
		}
//		console.log(this.id, "=============");
//		console.log("処理前 : ", this._images.length, aData.length);
		$.each(aData, (i, datum) => {
			found = false;

			for(j = 0; j < this._layers.length; j++){
				layer = this._layers[j];
				if(datum.class.id == layer.id && datum.class.type == LayerType.IMAGE){
					if((datum.class as Image).imageId != (layer as Image).imageId){
						this.removeLayer(layer);
						//j--;
					}else{
						found = true;
						layer.transform = datum.class.transform;
						layer.locked = datum.class.locked;
						layer.visible = datum.class.visible;
						layer.opacity = datum.class.opacity;
						layer.shared = datum.class.shared;
						layer.name = datum.class.name;
						newLayers[i] = layer;
					}
					break;
				}
			}
			if(!found){
				//console.log("\t",datum.class.id.slice(0,8) + "～のImageがありません");
				newLayers[i] = this.addLayer(datum.class.clone(datum.class.id));
			}
		});


		this._layers = newLayers;
//		console.log(this.id, "/=============");
		this.setLayersZIndex();
	}

	//

	protected setLayersZIndex(){
		for(var i = 0; i < this._layers.length; i++){
			this._layers[i].obj.css("z-index",i);
		}
	}
}