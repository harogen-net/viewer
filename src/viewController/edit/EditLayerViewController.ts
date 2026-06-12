import $ from "jquery";
import { Slide } from "../../model/Slide";
import { LayerView } from "../../view/LayerView";
import { EditLayerListItem } from "./EditLayerListItem";

export class EditLayerViewController {
	private ulObj: any;

	private items: EditLayerListItem[];
	private _layerViews: LayerView[];

	constructor(private obj: any) {
		this.items = [];
		for (var i: number = 0; i < Slide.LAYER_NUM_MAX; i++) {
			var item = new EditLayerListItem();
			this.items.push(item);
		}

		this.ulObj = this.obj.find("ul");

		// React controls this layer list: skip legacy DOM manipulation
		if (this.ulObj.attr("data-react-controlled") === "true") return;

		var bg: any = $('<div class="bg" />');
		this.obj.append(bg);
		bg.on("click", (any) => {
			this.items.forEach((item) => {
				if (!item.layerView) return;
				if (item.layerView.selected) item.layerView.selected = false;
			});
		});
	}

	private updateLayers(): void {
		// React controls this layer list: skip legacy DOM manipulation
		if (this.ulObj?.attr("data-react-controlled") === "true") return;

		this.items.forEach((item) => {
			item.obj.detach();
			item.layerView = null;
		});

		if (this._layerViews) {
			this._layerViews.forEach((layerView: LayerView, index: number) => {
				this.ulObj.prepend(this.items[index].obj);
				this.items[index].layerView = layerView;
			});
			// $.each(this._layerViews, (i:number, layerView:LayerView)=>{
			// 	this.ulObj.prepend(this.items[i].obj);
			// 	this.items[i].layerView = layerView;
			// });
		}
	}

	public update() {
		this.updateLayers();
	}

	//
	// set get
	//
	public set layerViews(value: LayerView[]) {
		this._layerViews = value;
		this.updateLayers();
	}
}
