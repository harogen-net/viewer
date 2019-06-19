import {EventDispatcher} from "../../events/EventDispatcher";
import { Viewer } from "../../Viewer";
import { Layer, LayerType } from "../model/Layer";
import { Slide } from "../model/Slide";
import { VDoc } from "../model/VDoc";

declare var $: any;

export class SlideView extends EventDispatcher {
	// static slideFromImage(img:Layer):SlideView {
	// 	var slide = new SlideView($('<div />'));
	// 	slide.addLayer(img);
	// 	return slide;
	// }

	// static centerX():number { return Viewer.SCREEN_WIDTH >> 1; }
	// static centerY():number { return Viewer.SCREEN_HEIGHT >> 1; }

	// static readonly LAYER_NUM_MAX:number = 100;

	//

	//protected _layers:Layer[];
	
	//

	

	//private _id:number;

	protected _selected:boolean = false;

	// private _isLock:boolean = false;
	// private _durationRatio:number = 1;
	// private _joining:boolean = false;
	// private _disabled:boolean = false;

	
	constructor(protected _slide:Slide, public obj:any){
		super();

/*		this._slide.addEventListener("layerAdd", (e)=>{

		});
		this._slide.addEventListener("layerRemove", (e)=>{

		});
		this._slide.addEventListener("layerUpdate", (e)=>{

		});*/
		
		this.obj.addClass("slide");
	}

	public destroy(){
		this._slide = null;
		this.obj.remove();
		this.obj = null;
	}

	// public clone():this {
	// 	console.log("clone at slide : " + this._slide.id);
	// 	var newObj:any = $('<div />');
	// 	var slideView:this = new (this.constructor as any)(this._slide.clone(), newObj);

	// 	// slideView.id = this.id;
	// 	// slideView.durationRatio = this.durationRatio;
	// 	// slideView.joining = this.joining;
	// 	// slideView.isLock = this.isLock;
	// 	// slideView.disabled = this.disabled;
	// 	// console.log("this slide has " + this._layers.length + " layers.");
	// 	// $.each(this._layers, (index:number, layer:Layer) => {
	// 	// 	slideView.addLayer(layer.clone());
	// 	// });

	// 	return slideView;
	// }

	//

	// public addLayer(layer:Layer, index:number = -1):Layer {
	// 	if(!layer) return layer;
	// 	if(index > this._layers.length - (this._layers.indexOf(layer) != -1 ? 1 : 0)) {
	// 		throw new Error("invalid index.");
	// 	}
	// 	if(this._layers.length >= SlideView.LAYER_NUM_MAX - (this._layers.indexOf(layer) != -1 ? 1 : 0)){
	// 		throw new Error("exceeds max layer num.");
	// 	}

	// 	// console.log("addLayer at slide");
	// 	// console.log(layer);

	// 	if(this._layers.indexOf(layer) != -1){
	// 		this._layers.splice(this._layers.indexOf(layer), 1);
	// 	}
	// 	if(index != -1){
	// 		this._layers.push(layer);
	// 	}else{
	// 		this._layers.splice(index, 0, layer);
	// 	}
		
	// 	return layer;
	// }

	// public removeLayer(layer:Layer):Layer {
	// 	if(!layer) return layer;
	// 	if(this._layers.indexOf(layer) != -1){
	// 		this._layers.splice(this._layers.indexOf(layer), 1);
	// 	}
	// 	return layer;
	// }

	// public removeAllLayers() {
	// 	while(this._layers.length > 0){
	// 		this.removeLayer(this._layers[0]);
	// 	}
	// }

	//

	// get id():number {
	// 	return this._id;
	// }
	// set id(value:number) {
	// 	this._id = value;
	// 	this.obj.data("id",value);
	// }

	get selected(){return this._selected;}
	set selected(value:boolean){
		this._selected = value;
		(this._selected) ? this.obj.addClass("selected") : this.obj.removeClass("selected");
	}
	


	get slide():Slide {
		return this._slide;
	}
	set slide(value:Slide) {
		this.replaceSlide(value);
	}
	protected replaceSlide(newSlide:Slide){
		throw new Error("");
	}
	
	// get durationRatio(){return this._durationRatio;}
	// set durationRatio(value:number){
	// 	this._durationRatio = Math.max(value, 0.4);
	// 	if(this.obj.attr("style")){
	// 		if(this.obj.attr("style").indexOf("width") != -1){
	// 			this.fitToHeight();
	// 		}
	// 	}
	// }

	// set isLock(value:boolean){ this._isLock = value; }
	// get isLock():boolean{ return this._isLock; }

	// set joining(value:boolean) {
	// 	this._joining = value;
	// 	if(this._joining){
	// 		this.obj.addClass("joining");
	// 	}else{
	// 		this.obj.removeClass("joining");
	// 	}
	// }
	// get joining():boolean { return this._joining; }


	// set disabled(value:boolean) {
	// 	this._disabled = value;
	// 	if(this._disabled){
	// 		this.obj.addClass("disabled");
	// 	}else{
	// 		this.obj.removeClass("disabled");
	// 	}
	// }
	// get disabled():boolean { return this._disabled; }

	//get layers():Layer[] {
// 		return this._layers;
// 	}
// 	set layers(value:Layer[]) {
// //		console.log("set layers called : " + value);
// 		if(this._isLock) return;
// 		this.setLayers(value);
// 	}

	//

	// public fitToWidth():void {
	// 	var fitHeight = (this.obj.width() / this._slide.width) * this._slide.height;
	// 	//console.log("fitToWidth : ", this.obj.width());
		
	// 	this.obj.css("width","");
	// 	this.obj.height(fitHeight);
	// 	this.scale = this._scale;
	// }

	


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

//	protected setLayers(aData:Layer[]){
		// console.log("setData called : " + aData);
		// if(this._isLock) return;

//		this._layers = aData;
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
//	}


}