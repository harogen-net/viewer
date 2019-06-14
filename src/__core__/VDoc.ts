import { SlideView } from "./SlideView";
import { Image } from "./layerModel/Image";
import { DateUtil } from "../utils/DateUtil";
import { Viewer } from "../Viewer";

declare var $: any;

export class VDoc {
	private readonly BG_COLOR_INIT:string = "#999999";

	public slides:SlideView[];
	
	public duration:number|undefined;
	public interval:number|undefined;

	public width:number|undefined;
	public height:number|undefined;

	public title:string;
	public createTime:number;
	public editTime:number;

	private _bgColor:string|undefined;


	constructor(slides?:SlideView[], options?:any){
		console.log("const at vdoc", slides, options);
		this.slides = slides || [];

		var bgColor:string|undefined = this.BG_COLOR_INIT;
		var createTime:number|undefined = new Date().getTime();
		var editTime:number|undefined = createTime;
		var title:string|undefined = DateUtil.getDateString();
		var width:number|undefined = Viewer.SCREEN_WIDTH;
		var height:number|undefined = Viewer.SCREEN_HEIGHT;
		
		if(options){
			if(options.bgColor) bgColor = options.bgColor;
			if(options.createTime) createTime = options.createTime;
			if(options.editTime) editTime = options.editTime;
			if(options.title) title = options.title;
			if(options.width) width = options.width;
			if(options.height) height = options = options.height;
		}
		this.bgColor = bgColor;
		this.createTime = createTime;
		this.editTime = editTime;
		this.title = title;
		this.width = width;
		this.height = height;
	}

	//

	public set bgColor(value:string|undefined){
		this._bgColor = value;
		document.documentElement.style.setProperty("--slideBackgroundColor", this._bgColor || this.BG_COLOR_INIT);
		$("#bgColor").val(this._bgColor || this.BG_COLOR_INIT);
	}
	public get bgColor():string{ return this._bgColor; }
}
