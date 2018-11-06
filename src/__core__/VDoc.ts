import { Slide } from "./Slide";
import { Image } from "./Image";

declare var $: any;

export class VDoc {

	public slides:Slide[];


	//public bgColor:string|undefined;
	public duration:number|undefined;
	public interval:number|undefined;

	public name:string;
	public createTime:number;
	public editTime:number;

	private _bgColor:string|undefined;


	constructor(slides?:Slide[]){
		this.slides = slides || [];
	}

	public set bgColor(value:string){
		this._bgColor = value;
		if(this._bgColor != undefined){
			document.documentElement.style.setProperty("--slideBackgroundColor", this._bgColor);
		}
	}
	public get bgColor():string{ return this._bgColor; }
}