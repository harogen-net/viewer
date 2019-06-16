import { SlideView } from "../SlideView";
import { Layer } from "../layerModel/Layer";
import { SlideToPNGConverter } from "../../utils/SlideToPNGConverter";

declare var $: any;

export class ThumbSlide extends SlideView {
	
	private thumbnail:any;
	private converter:SlideToPNGConverter;

	constructor(public obj:any){
		super(obj);

		this.converter = new SlideToPNGConverter();
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

	protected setLayers(aData:any[]){
		super.setLayers(aData);
		this.refresh();
	}

	//

	public refresh(){
		if(this.thumbnail){
			this.thumbnail.remove();
			this.thumbnail = null;
		}
		var canvas = this.converter.slide2canvas(this, this.width, this.height);
		this.thumbnail = $(canvas);
		this.container.append(this.thumbnail);
		this.thumbnail.css({
			"witdh":"100%",
			"height":"100%"
		});		
		
	}
}