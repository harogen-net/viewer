import { Image } from "./layerModel/Image";
import {EventDispatcher} from "../events/EventDispatcher";
import { ImageManager } from "../utils/ImageManager";
import { Viewer } from "../Viewer";
import { Layer, LayerType } from "./layerModel/Layer";
import { TextLayer } from "./layerModel/TextLayer";

declare var $: any;

export class SlideView extends EventDispatcher {
	static slideFromImage(img:Layer):SlideView {
		var slide = new SlideView($('<div />'));
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
	private _disabled:boolean = false;

	
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

	public clone():this {
		console.log("clone at slide : " + this.id);
		var newObj:any = $('<div />');
		var slide:this = new (this.constructor as any)(newObj);

		slide.id = this.id;
		slide.durationRatio = this.durationRatio;
		slide.joining = this.joining;
		slide.isLock = this.isLock;
		slide.disabled = this.disabled;
		console.log("this slide has " + this._layers.length + " layers.");
		$.each(this._layers, (index:number, layer:Layer) => {
			slide.addLayer(layer.clone());
		});

		return slide;
	}

	//

	public addLayer(layer:Layer, index:number = -1):Layer {
		if(!layer) return layer;
		if(index > this._layers.length - (this._layers.indexOf(layer) != -1 ? 1 : 0)) {
			throw new Error("invalid index.");
		}
		if(this._layers.length >= SlideView.LAYER_NUM_MAX - (this._layers.indexOf(layer) != -1 ? 1 : 0)){
			throw new Error("exceeds max layer num.");
		}

		// console.log("addLayer at slide");
		// console.log(layer);

		if(this._layers.indexOf(layer) != -1){
			this._layers.splice(this._layers.indexOf(layer), 1);
		}
		if(index != -1){
			this._layers.push(layer);
		}else{
			this._layers.splice(index, 0, layer);
		}
		
		return layer;
	}

	public removeLayer(layer:Layer):Layer {
		if(!layer) return layer;
		if(this._layers.indexOf(layer) != -1){
			this._layers.splice(this._layers.indexOf(layer), 1);
		}
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
	set disabled(value:boolean) {
		this._disabled = value;
		if(this._disabled){
			this.obj.addClass("disabled");
		}else{
			this.obj.removeClass("disabled");
		}
	}
	get disabled():boolean { return this._disabled; }

	get layers():Layer[] {
		return this._layers;
	}
	set layers(value:Layer[]) {
//		console.log("set layers called : " + value);
		if(this._isLock) return;
		this.setLayers(value);
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
		var durationCorrection:number = Math.atan(this._durationRatio - 1) * 0.5 + 1;
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
	
	public fitLayer(layer:Layer):Layer {
		console.log("fitLayer", layer, layer.width, layer.height);
		if(layer.width == 0 || layer.height ==0)
		{
			return layer;
		}

/*		if(layer.width == Viewer.SCREEN_WIDTH && layer.height == Viewer.SCREEN_HEIGHT){
			layer.x = Slide.centerX()
			layer.y = Slide.centerY();
			layer.scale = 1;
			return layer;
		}*/

		var scaleX,scaleY;
		if(layer.rotation == 90 || layer.rotation == -90){
			scaleX = Viewer.SCREEN_WIDTH / layer.height;
			scaleY = Viewer.SCREEN_HEIGHT / layer.width;
		}else{
			scaleX = Viewer.SCREEN_WIDTH / layer.width;
			scaleY = Viewer.SCREEN_HEIGHT / layer.height;
		}

		var scale1:number = Math.min(scaleX, scaleY);
		var scale2:number = Math.max(scaleX, scaleY);

		if(layer.x == SlideView.centerX() && layer.y == SlideView.centerY()){
			var compRatio:number = Math.pow(10,10);
			if(Math.round(layer.scale * compRatio) == Math.round(scale1 * compRatio)){
				layer.scale = scale2;
			}else{
				layer.scale = scale1;
			}
		}else{
			layer.scale = scale1;
			layer.x = SlideView.centerX()
			layer.y = SlideView.centerY();
		}

		return layer;
	}

	//



	//

	// getData():Layer[] {
	// 	// var ret:Layer[] = [];
	// 	// $.each(this._layers, (index:number,img:Layer) => {
	// 	// 	ret.push(img);
	// 	// });
	// 	// return ret;
	// 	return this._layers;
	// }

	protected setLayers(aData:Layer[]){
		// console.log("setData called : " + aData);
		// if(this._isLock) return;

		this._layers = aData;
/*		this.removeAllLayers();
		aData.forEach(layer => {
			this.addLayer(layer);
		});*/
		
		
/*		var i,j:number;
		var layer:Layer;
		var datum:{class:Layer};
		var found:boolean;
		var newLayers:Layer[] = [];

		for(i = 0; i < this._layers.length; i++){
			layer = this._layers[i];
			found = false;
			$.each(aData, (j, datum:Layer) => {
				if(datum.id == layer.id) {
					if(datum.type == LayerType.IMAGE){
						if((datum as Image).imageId == (layer as Image).imageId){
							layer.name = datum.name;
							found = true;
						}
					}else if(datum.type == LayerType.TEXT){
						found = true;
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

		$.each(aData, (i, datum:Layer) => {
			found = false;

			for(j = 0; j < this._layers.length; j++){
				layer = this._layers[j];
				if(datum.id == layer.id){
					switch(datum.type){
						case LayerType.IMAGE:
						{
							var imageClass = datum as Image;
							var imageLayer = layer as Image;
							if(imageClass.imageId != imageLayer.imageId){
								this.removeLayer(imageLayer);
								//j--;
							}else{
								found = true;
								Layer.copyAttributes(imageLayer, imageClass);
								imageLayer.clipRect = imageClass.clipRect;
								newLayers[i] = layer;
							}
						}
						break;
						case LayerType.TEXT:
						{
							var textClass = datum as TextLayer;
							var textLayer = layer as TextLayer;

							found = true;
							Layer.copyAttributes(layer, datum);
							textLayer.text = textClass.text;
							newLayers[i] = layer;
						}
						break;
						default:

						break;
					}
				}
			}
			if(!found){
				//console.log("\t",datum.class.id + "～のImageがありません");
				//console.log((datum.class as Layer).transform);
				newLayers[i] = this.addLayer(datum.clone(datum.id));
			}
		});

		console.log(newLayers);


		this._layers = newLayers;
//		console.log(this.id, "/=============");
		*/
	//	this._layers = aData;
	}


}