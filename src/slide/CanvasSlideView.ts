import { SlideView } from "../__core__/view/SlideView";
import { SlideToPNGConverter } from "../utils/SlideToPNGConverter";
import { Slide } from "../__core__/model/Slide";

declare var $: any;

export class CanvasSlideView extends SlideView {
	

	protected thumbnail:any;
	protected converter:SlideToPNGConverter;
	protected canvas:HTMLCanvasElement;

	protected width:number;
	protected height:number;

	constructor(protected _slide:Slide, public obj:any, protected scale:number){
		super(_slide, obj);
		 this._slide.addEventListener("update", this.onLayerUpdate);

		 this.converter = new SlideToPNGConverter();

		this.width = Math.round(this._slide.width * this.scale);
		this.height = Math.round(this._slide.height * this.scale)
//		 var width = Math.round((ThumbSlide2.HEIGHT / this._slide.height) * this._slide.width * 1);
//		 var scale = ThumbSlide2.HEIGHT / this._slide.height;

		 this.canvas = this.converter.slide2canvas(this._slide, this.width, this.height, this.scale);
		 //this.canvas = this.converter.slide2canvas(this._slide, width, ThumbSlide2.HEIGHT, scale);
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
	private onLayerUpdate = (e)=>{
		this.refresh();
	};


	public destroy(){
	//	this._slide.removeEventListener("layerUpdate", this.onLayerUpdate);
		this._slide.removeEventListener("update", this.onLayerUpdate);
		this.converter = null;
		this.thumbnail.remove();
		this.thumbnail = null;
		this.canvas = null;

		super.destroy();
	}
	//

	public refresh(){
		this.converter.drawSlide2Canvas(this._slide, this.canvas, this.scale);
//		this.converter.drawSlide2Canvas(this._slide, this.canvas, ThumbSlide2.HEIGHT / this._slide.height);
	}
}

