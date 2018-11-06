import { Slide } from "./Slide";
import { Image } from "./Image";

declare var $: any;

export class VDoc {
	private readonly BG_COLOR_INIT:string = "#999999";

	public slides:Slide[];


	//public bgColor:string|undefined;
	public duration:number|undefined;
	public interval:number|undefined;

	public name:string;
	public createTime:number;
	public editTime:number;

	private _bgColor:string|undefined = undefined;


	constructor(slides?:Slide[], options?:any){
		this.slides = slides || [];

		if(options){
			if(options.bgColor) this.bgColor = options.bgColor;
		}
	}

	public set bgColor(value:string|undefined){
		this._bgColor = value;

		document.documentElement.style.setProperty("--slideBackgroundColor", this._bgColor || this.BG_COLOR_INIT);
		$("#bgColor").val(this._bgColor || this.BG_COLOR_INIT);
	}
	public get bgColor():string{ return this._bgColor; }
}