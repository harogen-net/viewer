import { SELayerListItem } from "./SELayerListItem";
import { EditableSlideView } from "./slide/EditableSlideView";
import { Slide } from "./__core__/model/Slide";
import { LayerView } from "./__core__/view/LayerView";

declare var $:any;

export class SELayerDiv {

	private ulObj:any;

	private items:SELayerListItem[];
	private _layerViews:LayerView[];

	constructor(private obj:any){
		this.items = [];
		for(var i:number = 0; i < Slide.LAYER_NUM_MAX; i++){
			var item = new SELayerListItem();
			this.items.push(item);
		}

		var bg:any = $('<div class="bg" />');
		this.obj.append(bg);
		bg.on("click",(any)=>{
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

		if(this._layerViews){
			$.each(this._layerViews, (i:number, layerView:LayerView)=>{
				this.ulObj.prepend(this.items[i].obj);
				this.items[i].layerView = layerView;
			});
		}
	}

	public update(){
		this.updateLayers();
	}

	//
	// set get
	//
	public set layerViews(value:LayerView[]) {
		this._layerViews = value;
		this.updateLayers();
	}

}