import { SlideView } from "../__core__/view/SlideView";
import { Layer } from "../__core__/model/Layer";
import { LayerView } from "../__core__/view/LayerView";
import { LayerViewFactory } from "../__core__/view/LayerViewFactory";
import { Slide } from "../__core__/model/Slide";

declare var $ :any;

export class DOMSlide extends SlideView {

	// public static cloneBySlide(slide:SlideView):DOMSlide {
	// 	var newObj:any = $('<div />');
	// 	var ret:DOMSlide = new DOMSlide(newObj);

	// 	ret.id = slide.id;
	// 	ret.durationRatio = slide.durationRatio;
	// 	ret.joining = slide.joining;
	// 	ret.isLock = slide.isLock;
	// 	ret.disabled = slide.disabled;

	// 	$.each(slide.layers, (index:number, layer:Layer) => {
	// 		ret.addLayer(layer.clone());
	// 	});

	// 	return ret;
	// }


	public layerViews:LayerView[] = [];
	public container:any;

	private scale_min:number = 0.2;
	private scale_max:number = 5;
	protected scale_base:number = 1;
	protected _scale:number = 1;


	constructor(protected _slide:Slide, public obj:any){
		super(_slide, obj);

		this.container = $('<div class="container" />').appendTo(this.obj);
		this.container.css("width", _slide.width + "px");
		this.container.css("height", _slide.height + "px");

		this._slide.addEventListener("layerAdd", this.onLayerAdd);
		this._slide.addEventListener("layerRemove", this.onLayerRemove);
		this._slide.addEventListener("update", this.onSlideUpdate);
		this._slide.layers.forEach(layer=>{
			this.addLayerView(layer);
		});
	}


	


	protected getLayerViewByLayer(layer:Layer):LayerView {
		for(var i = 0; i < this.layerViews.length; i++){
			var layerView:LayerView = this.layerViews[i];
			if(layerView.data == layer){
				return layerView;
			}
		}
		return null;
	}

	// public addLayer(layer:Layer, index:number = -1):Layer {
	// 	console.log("addLayer at DOMSLIDE");
	// 	if(!layer) return layer;

	// 	//レイヤ追加の場合はとにかく先に追加する
	// 	if(this._layers.indexOf(layer) == -1 && this._layers.length < SlideView.LAYER_NUM_MAX){
	// 		var layerView:LayerView = LayerViewFactory.layerViewFromData(layer);
	// 		this.addDomLayer(layerView);
	// 	}

	// 	super.addLayer(layer, index);
	// 	this.setLayersZIndex();
	// 	return layer;
	// }

	// public removeLayer(layer:Layer):Layer {
	// 	if(!layer) return layer;

	// 	var layerView:LayerView = this.getLayerViewByLayer(layer);
	// 	if(layerView) this.removeDomLayer(layerView);

	// 	super.removeLayer(layer);
	// 	//this.setLayersZIndex();
	// 	return layer;
	// }

	protected addLayerView(layer:Layer):LayerView {
		var layerView:LayerView = LayerViewFactory.layerViewFromData(layer);
		this.layerViews.push(layerView);
		this.container.append(layerView.obj);
		// console.log(layerView);
		// console.log(this.container);
		return layerView;
	}
	protected removeLayerView(layer:Layer):LayerView {
		var layerView:LayerView = this.getLayerViewByLayer(layer);
		this.layerViews.splice(this.layerViews.indexOf(layerView),1);
		return layerView;
	}

// 	protected setLayers(aData:any[]){
// //		if(this.isLock) return;
// 		super.setLayers(aData);

// 		while(this.layerViews.length > 0){
// 			this.removeDomLayer(this.layerViews[0])
// 		}
// 		for(var i = 0; i < this._layers.length; i++){
// 			var layer:Layer = this._layers[i];
// 			var layerView:LayerView = LayerViewFactory.layerViewFromData(layer);
// 			this.addDomLayer(layerView);
// 		}



// //		this.removeAllLayers();

// /*		for(var i = 0; i < this.layerViews.length; i++){
// 			var layerView:layerView = this.layerViews[i];
// 		}*/

// 		this.setLayersZIndex();
// 	}

	//

	protected setLayersZIndex(){
		for(var i = 0; i < this.layerViews.length; i++){
			var layerView:LayerView = this.layerViews[i];
			if(this._slide.layers.indexOf(layerView.data) == -1){
				throw new Error("");
			}
			layerView.obj.css("z-index", this._slide.layers.indexOf(layerView.data));
		}
	}

	protected replaceSlide(newSlide:Slide) {
		if(this._slide != null){
			this._slide.removeEventListener("layerAdd", this.onLayerAdd);
			this._slide.removeEventListener("layerRemove", this.onLayerRemove);
			this._slide.removeEventListener("update", this.onSlideUpdate);
			for(var i = 0; i < this._slide.layers.length; i++){
				this.removeLayerView(this._slide.layers[i]).destroy();
			}
		}

		this._slide = newSlide;

		if(this._slide != null){
			this._slide.addEventListener("layerAdd", this.onLayerAdd);
			this._slide.addEventListener("layerRemove", this.onLayerRemove);
			this._slide.addEventListener("update", this.onSlideUpdate);
			this._slide.layers.forEach(layer=>{
				this.addLayerView(layer);
			});
		}
	}

	//

	
	get width(){
		return this.obj.width() * this._scale * this.scale_base;
	}
	get height(){
		return this.obj.height() * this._scale * this.scale_base;
	}
	get scale(){return this._scale;}
	set scale(value:number){
		this._scale = value > this.scale_min ? (value < this.scale_max ? value : this.scale_max) : this.scale_min;
		var actualScale:number = this._scale * this.scale_base;
		var containerWidth = this._slide.width * actualScale;
		var containerHeight = this._slide.height * actualScale;
		var defX = -(this._slide.width * (1 - actualScale) / 2) + (this.obj.width() - containerWidth) / 2;
		var defY = -(this._slide.height * (1 - actualScale) / 2) + (this.obj.height() - containerHeight) / 2;
		
		this.container.css("transform","matrix(" + actualScale + ",0,0," + actualScale + "," + defX + "," + defY + ")");

		this.dispatchEvent(new Event("scale"));
	}


	// set backgroundColor(colorStr:string) {
	// 	this.container.css("backgroundColor", colorStr);
	// }

	//
	// event handlers
	//
	private onLayerAdd = (ce:CustomEvent)=>{
		this.addLayerView(ce.detail.layer);
	};
	private onLayerRemove = (ce:CustomEvent)=>{
		this.removeLayerView(ce.detail.layer).destroy();
	};
	private onSlideUpdate = (ce:CustomEvent)=>{
		this.setLayersZIndex();
	};
}