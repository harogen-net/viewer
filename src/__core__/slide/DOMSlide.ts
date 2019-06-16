import { SlideView } from "../SlideView";
import { Layer } from "../layerModel/Layer";
import { LayerView } from "../layerView/LayerView";
import { LayerViewFactory } from "../layerView/LayerViewFactory";

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

	protected getLayerViewByLayer(layer:Layer):LayerView {
		for(var i = 0; i < this.layerViews.length; i++){
			var layerView:LayerView = this.layerViews[i];
			if(layerView.data == layer){
				return layerView;
			}
		}
		return null;
	}

	public addLayer(layer:Layer, index:number = -1):Layer {
		console.log("addLayer at DOMSLIDE");
		if(!layer) return layer;

		//レイヤ追加の場合はとにかく先に追加する
		if(this._layers.indexOf(layer) == -1 && this._layers.length < SlideView.LAYER_NUM_MAX){
			var layerView:LayerView = LayerViewFactory.layerViewFromData(layer);
			this.addDomLayer(layerView);
		}

		super.addLayer(layer, index);
		this.setLayersZIndex();
		return layer;
	}

	public removeLayer(layer:Layer):Layer {
		if(!layer) return layer;

		var layerView:LayerView = this.getLayerViewByLayer(layer);
		if(layerView) this.removeDomLayer(layerView);

		super.removeLayer(layer);
		//this.setLayersZIndex();
		return layer;
	}

	protected addDomLayer(layerView:LayerView){
		this.layerViews.push(layerView);
		this.container.append(layerView.obj);
		// console.log(layerView);
		// console.log(this.container);
	}
	protected removeDomLayer(layerView:LayerView){
		this.layerViews.splice(this.layerViews.indexOf(layerView),1);
		layerView.obj.remove();
	}
	private removeAllDomLayers(){

	}

	protected setLayers(aData:any[]){
//		if(this.isLock) return;
		super.setLayers(aData);

		while(this.layerViews.length > 0){
			this.removeDomLayer(this.layerViews[0])
		}
		for(var i = 0; i < this._layers.length; i++){
			var layer:Layer = this._layers[i];
			var layerView:LayerView = LayerViewFactory.layerViewFromData(layer);
			this.addDomLayer(layerView);
		}



//		this.removeAllLayers();

/*		for(var i = 0; i < this.layerViews.length; i++){
			var layerView:layerView = this.layerViews[i];
		}*/

		this.setLayersZIndex();
	}

	//

	protected setLayersZIndex(){
		for(var i = 0; i < this.layerViews.length; i++){
			var layerView:LayerView = this.layerViews[i];
			if(this._layers.indexOf(layerView.data) == -1){
				throw new Error("");
			}
			layerView.obj.css("z-index", this._layers.indexOf(layerView.data));
		}
	}
}