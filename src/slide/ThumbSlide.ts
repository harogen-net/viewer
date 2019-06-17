import { SlideView } from "../__core__/view/SlideView";
import { Layer } from "../__core__/model/Layer";
import { SlideToPNGConverter } from "../utils/SlideToPNGConverter";
import { Slide } from "../__core__/model/Slide";

declare var $: any;

export class ThumbSlide extends SlideView {
	
	private _id:number;

	private thumbnail:any;
	private converter:SlideToPNGConverter;

	constructor(protected _slide:Slide, public obj:any){
		super(_slide, obj);

		this._id = Math.floor(Math.random() * 100000000000);
		obj.data("id",this._id);

		this._slide.addEventListener("update", (e)=>{
			this.refresh();
		});
		this._slide.addEventListener("layerUpdate", (e)=>{
			this.refresh();
		});

		this.converter = new SlideToPNGConverter();
		this._slide.addEventListener("update", this.refresh);
		this.refresh();
	}

	//

	// public addLayer(layer:Layer, index:number = -1):Layer {
	// 	if(!layer) return layer;
	// 	super.addLayer(layer, index);
	// 	this.updateThumbnail();

	// 	return layer;
	// }

	// public removeLayer(layer:Layer):Layer {
	// 	if(!layer) return layer;
	// 	super.removeLayer(layer);
	// 	this.updateThumbnail();
		
	// 	return layer;
	// }

	// protected setLayers(aData:any[]){
	// 	super.setLayers(aData);
	// 	this.refresh();
	// }

	//

	public refresh(){
		if(this.thumbnail){
			this.thumbnail.remove();
			this.thumbnail = null;
		}
		var canvas = this.converter.slide2canvas(this._slide, this.width, this.height);
		this.thumbnail = $(canvas);
		this.container.append(this.thumbnail);
		this.thumbnail.css({
			"witdh":"100%",
			"height":"100%"
		});		
	}

	public get id():number {
		return this._id;
	}
}