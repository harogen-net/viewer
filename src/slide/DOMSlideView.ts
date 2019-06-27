import { SlideView } from "../__core__/view/SlideView";
import { Layer } from "../__core__/model/Layer";
import { LayerView } from "../__core__/view/LayerView";
import { LayerViewFactory } from "../__core__/view/LayerViewFactory";
import { Slide } from "../__core__/model/Slide";

declare var $ :any;

export class DOMSlideView extends SlideView {

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

	public destroy(){
		// this._slide.removeAllLayers();
		// this._slide = null;
		// this.obj.stop();
		// this.obj.remove();
		// this.obj = null;
		this._slide.removeEventListener("layerAdd", this.onLayerAdd);
		this._slide.removeEventListener("layerRemove", this.onLayerRemove);
		this._slide.removeEventListener("update", this.onSlideUpdate);
		super.destroy();
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


	protected addLayerView(layer:Layer):LayerView {
		var layerView:LayerView = LayerViewFactory.layerViewFromData(layer);
		this.layerViews.push(layerView);
		this.container.append(layerView.obj);
		this.updateLayerViewsOrder();

		// console.log(layerView);
		// console.log(this.container);
		return layerView;
	}
	protected removeLayerView(layer:Layer):LayerView {
		var layerView:LayerView = this.getLayerViewByLayer(layer);
		this.layerViews.splice(this.layerViews.indexOf(layerView),1);
		this.updateLayerViewsOrder();
		return layerView;
	}


	//

	protected updateLayerViewsOrder(){
		//slideのlayers並び順に従って、layerViewsの並び順も変える（主にlayerDivのため）
		//ついでにz-indexも設定して見た目の変更もする
		this.layerViews.sort((a:LayerView, b:LayerView)=>{
			return this._slide.layers.indexOf(a.data) < this._slide.layers.indexOf(b.data) ? -1 : 1;
		});
		for(var i = 0; i < this.layerViews.length; i++){
			this.layerViews[i].obj.css("z-index", i);
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
			this.container.css("width", this._slide.width + "px");
			this.container.css("height", this._slide.height + "px");

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
		this.updateLayerViewsOrder();
	};
}