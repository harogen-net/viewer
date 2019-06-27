import {EventDispatcher} from "../../events/EventDispatcher";
import { Viewer } from "../../Viewer";
import { Layer, LayerType } from "../model/Layer";
import { Slide } from "../model/Slide";
import { VDoc } from "../model/VDoc";

declare var $: any;

export class SlideView extends EventDispatcher {

	protected _selected:boolean = false;


	constructor(protected _slide:Slide, public obj:any){
		super();
		this.obj.addClass("slide");
	}

	public destroy(){
		this._slide.removeAllLayers();
		this._slide = null;
		this.obj.stop();
		this.obj.remove();
		this.obj = null;
	}


	//
	// get set
	//
	get selected(){return this._selected;}
	set selected(value:boolean){
		this._selected = value;
		(this._selected) ? this.obj.addClass("selected") : this.obj.removeClass("selected");
	}

	get slide():Slide {
		return this._slide;
	}
	set slide(value:Slide) {
		this.replaceSlide(value);
	}
	protected replaceSlide(newSlide:Slide){
		throw new Error("");
	}
}