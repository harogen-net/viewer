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
	//

	constructor(protected _slide:Slide, public obj:any){
		super(_slide, obj);

		this._slide.addEventListener("layerAdd", (ce:CustomEvent)=>{
			this.addDomLayer(ce.detail);
		});
		this._slide.addEventListener("layerRemove", (ce:CustomEvent)=>{
			this.removeDomLayer(ce.detail);
		});
		this._slide.addEventListener("update", (ce:CustomEvent)=>{
			this.setLayersZIndex();
		});

		this._slide.layers.forEach(layer=>{
			this.addDomLayer(layer);
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

	protected addDomLayer(layer:Layer):LayerView {
		var layerView:LayerView = LayerViewFactory.layerViewFromData(layer);
		this.layerViews.push(layerView);
		this.container.append(layerView.obj);
		// console.log(layerView);
		// console.log(this.container);
		return layerView;
	}
	protected removeDomLayer(layer:Layer):LayerView {
		var layerView:LayerView = this.getLayerViewByLayer(layer);
		this.layerViews.splice(this.layerViews.indexOf(layerView),1);
		layerView.obj.remove();

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
}