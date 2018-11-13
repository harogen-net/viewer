import { Slide } from "./Slide";
import { Image } from "./Image";
import { DateUtil } from "../utils/DateUtil";

declare var $: any;

export class VDoc {
	private readonly BG_COLOR_INIT:string = "#999999";

	public slides:Slide[];


	//public bgColor:string|undefined;
	public duration:number|undefined;
	public interval:number|undefined;

	public title:string;
	public createTime:number;
	public editTime:number;

	private _bgColor:string|undefined;


	constructor(slides?:Slide[], options?:any){
		this.slides = slides || [];

		var bgColor:string|undefined = undefined;
		var createTime:number|undefined = new Date().getTime();
		var editTime:number|undefined = createTime;
		var title:string|undefined = DateUtil.getDateString();
		
		if(options){
			if(options.bgColor) bgColor = options.bgColor;
			if(options.createTime) createTime = options.createTime;
			if(options.editTime) editTime = options.editTime;
			if(options.title) title = options.title;
		}
		this.bgColor = bgColor;
		this.createTime = createTime;
		this.editTime = editTime;
		this.title = title;
	}

	//

	public set bgColor(value:string|undefined){
		this._bgColor = value;
		document.documentElement.style.setProperty("--slideBackgroundColor", this._bgColor || this.BG_COLOR_INIT);
		$("#bgColor").val(this._bgColor || this.BG_COLOR_INIT);
	}
	public get bgColor():string{ return this._bgColor; }
}
