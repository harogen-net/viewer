import {EventDispatcher} from "../../events/EventDispatcher";
import { Viewer } from "../../Viewer";
import { Layer, LayerType } from "../model/Layer";
import { Slide } from "../model/Slide";
import { VDoc } from "../model/VDoc";
import { PropertyEvent } from "../../events/PropertyEvent";
import { PropFlags } from "../model/PropFlags";

declare var $: any;

export class SlideView extends EventDispatcher {

	protected _selected:boolean = false;


	constructor(protected _slide:Slide, public obj:any){
		super();
		this._slide.addEventListener(PropertyEvent.UPDATE, this.onSlideUpdateLambda);
		this.obj.addClass("slide");
	}

	public destroy(){
		if(this._slide){
			this._slide.removeEventListener(PropertyEvent.UPDATE, this.onSlideUpdateLambda);
		}
		this._slide = null;
		this.obj.stop();
		this.obj.remove();
		this.obj = null;
	}


	//
	// event handlers
	//
	private onSlideUpdateLambda = (pe:PropertyEvent)=>{
		this.onSlideUpdate(pe);
	};
	protected onSlideUpdate(pe:PropertyEvent) {
		//override me
	}


	//
	// get set
	//
	get selected(){return this._selected;}
	set selected(value:boolean){
		if(value == this._selected) return;
		this._selected = value;
		(this._selected) ? this.obj.addClass("selected") : this.obj.removeClass("selected");
		this.dispatchEvent(new PropertyEvent(PropertyEvent.UPDATE, this, PropFlags.SV_SELECT));
	}

	get slide():Slide {
		return this._slide;
	}
	set slide(value:Slide) {
		this.replaceSlide(value);
	}
	
	protected replaceSlide(newSlide:Slide){
		if(this._slide){
			this._slide.removeEventListener(PropertyEvent.UPDATE, this.onSlideUpdateLambda);
		}

		this._slide = newSlide;

		if(this._slide){
			this._slide.addEventListener(PropertyEvent.UPDATE, this.onSlideUpdateLambda);
		}
	}
}