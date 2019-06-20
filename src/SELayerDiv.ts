import { SELayerListItem } from "./SELayerListItem";
import { EditableSlide } from "./slide/EditableSlide";
import { Slide } from "./__core__/model/Slide";
import { LayerView } from "./__core__/view/LayerView";

declare var $:any;

export class SELayerDiv {

	private ulObj:any;

	private items:SELayerListItem[];
//	private _targetSlideView:EditableSlide;
	private _layerViews:LayerView[];

	constructor(private obj:any){
		this.items = [];
		for(var i:number = 0; i < Slide.LAYER_NUM_MAX; i++){
			var item = new SELayerListItem();
		//	item.addEventListener("update", this.onLayerUpdate);
			this.items.push(item);
		}

		var bg:any = $('<div class="bg" />');
		this.obj.append(bg);
		bg.on("click",(any)=>{
			// if(this._targetSlideView != null){
			// 	this._targetSlideView.selectLayerView(null);
			// }

			this.items.forEach(item=>{
				if(!item.layerView) return;
				if(item.layerView.selected) item.layerView.selected = false;
			});
		});

		this.ulObj = this.obj.find("ul");
	}

	private updateLayers():void{
		this.items.forEach(item=>{
			item.obj.detach();
			item.layerView = null;
		});

		console.log(this._layerViews);
		if(this._layerViews){
			$.each(this._layerViews, (i:number, layerView:LayerView)=>{
				this.ulObj.prepend(this.items[i].obj);
				this.items[i].layerView = layerView;
			});
		}
	}

	//
	// set get
	//
	// public set targetSlide(value:EditableSlide) {
	// 	if(this._targetSlideView != null){
	// 		// this._targetSlideView.removeEventListener("select", this.o);
	// 		// this._targetSlideView.slide.removeEventListener("update", this.onSlideUpdate);
	// 		// this._targetSlideView.slide.removeEventListener("layerUpdate", this.onLayerUpdate);
	// 	}

	// 	//value is nullable
	// 	this._targetSlideView = value;
	// 	this.updateLayers();

	// 	if(this._targetSlideView != null){
	// 		// this._targetSlideView.slide.addEventListener("update", this.onSlideUpdate);
	// 		// this._targetSlideView.slide.addEventListener("layerUpdate", this.onLayerUpdate);
	// 	}
	// }

	public set layerViews(value:LayerView[]) {
		this._layerViews = value;
		this.updateLayers();
	}


	//
	// event listeners
	//
	// private onSlideUpdate = (ce:CustomEvent)=>{

	// };
	// private onLayerUpdate = (ce:CustomEvent)=>{
	// };
}