import { SlideView } from "../SlideView";
import { SlideToPNGConverter } from "../../utils/SlideToPNGConverter";
import { Slide } from "../../model/Slide";
import { PropertyEvent } from "../../events/PropertyEvent";
import { PropFlags } from "../../model/PropFlags";


declare var $: any;

export class CanvasSlideView extends SlideView {
	

	protected thumbnail:any;
	protected converter:SlideToPNGConverter;
	protected canvas:HTMLCanvasElement;

	protected width:number;
	protected height:number;

	private intervalId;	//interval for refresh

	constructor(protected _slide:Slide, public obj:any, protected scale:number){
		super(_slide, obj);

		this.converter = new SlideToPNGConverter();

		this.width = Math.round(this._slide.width * this.scale);
		this.height = Math.round(this._slide.height * this.scale)

		this.canvas = this.converter.slide2canvas(this._slide, this.width, this.height, this.scale);
		this.thumbnail = $(this.canvas);
		this.obj.append(this.thumbnail);
		this.obj.height(this.height);
		this.thumbnail.css({
			 "witdh":"100%",
			 "height":"100%",
			 "display":"block",
			 "margin":"0 auto"
		});
		 
		this.refresh();
	}


	public destroy(){
		if(this.intervalId){
			clearInterval(this.intervalId)
		}
		this.converter = null;
		this.thumbnail.remove();
		this.thumbnail = null;
		this.canvas = null;

		super.destroy();
	}
	
	public refresh(){
		if(this.intervalId){
			clearInterval(this.intervalId)
		}
		this.intervalId = setTimeout(() => {
			this.converter.drawSlide2Canvas(this._slide, this.canvas, this.scale);
		}, 100);
	}

	//
	// event handlers
	//
	//private onLayerUpdate = (e)=>{
	protected onSlideUpdate(pe:PropertyEvent) {
		this.updateView(pe.propFlags);
	}

	protected updateView(flag:number = PropFlags.ALL){
		if(flag & (PropFlags.S_LAYER_ADD|PropFlags.S_LAYER_REMOVE|PropFlags.S_LAYER_ORDER|PropFlags.S_LAYER)){
			this.refresh();
		}		
	}
}

