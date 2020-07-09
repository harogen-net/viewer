import { SlideView } from "../SlideView";
import { Layer } from "../../model/Layer";
import { LayerView } from "../LayerView";
import { LayerViewFactory } from "../../utils/LayerViewFactory";
import { Slide } from "../../model/Slide";
import { PropertyEvent } from "../../events/PropertyEvent";
import { PropFlags } from "../../model/PropFlags";

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

		this._slide.layers.forEach(layer=>{
			this.addLayerView(layer);
		});
	}



	protected getViewByLayer(layer:Layer):LayerView {
		for(var i = 0; i < this.layerViews.length; i++){
			var layerView:LayerView = this.layerViews[i];
			if(layerView.data == layer){
				return layerView;
			}
		}
		return null;
	}


	protected addLayerView(layer:Layer):LayerView {
		var layerView:LayerView = LayerViewFactory.ViewFromLayer(layer);
		this.layerViews.push(layerView);
		this.container.append(layerView.obj);
		this.updateViewsOrder();

		return layerView;
	}
	protected removeLayerView(layer:Layer):LayerView {
		var layerView:LayerView = this.getViewByLayer(layer);
		this.layerViews.splice(this.layerViews.indexOf(layerView),1);
		this.updateViewsOrder();
		return layerView;
	}


	//

	protected updateViewsOrder(){
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
			for(var i = 0; i < this._slide.layers.length; i++){
				this.removeLayerView(this._slide.layers[i]).destroy();
			}
		}

		super.replaceSlide(newSlide);

		if(this._slide != null){
			this.container.css("width", this._slide.width + "px");
			this.container.css("height", this._slide.height + "px");

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

		this.dispatchEvent(new PropertyEvent(PropertyEvent.UPDATE, this, PropFlags.DSV_SCALE));
	}


	//
	// event handlers
	//
	protected onSlideUpdate(pe:PropertyEvent) {
		var flag = pe.propFlags;
		if(flag & PropFlags.S_LAYER_ADD){
			this.addLayerView(pe.options.layer);
		}
		if(flag & PropFlags.S_LAYER_REMOVE){
			this.removeLayerView(pe.options.layer).destroy();
		}
		if(flag & PropFlags.S_LAYER_ORDER){
			this.updateViewsOrder();
		}
	};
}