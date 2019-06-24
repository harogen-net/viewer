import { SlideView } from "../__core__/view/SlideView";
import { Layer } from "../__core__/model/Layer";
import { SlideToPNGConverter } from "../utils/SlideToPNGConverter";
import { Slide } from "../__core__/model/Slide";

declare var $: any;

export class CanvasSlideView extends SlideView {
	

	protected _id:number;

	protected thumbnail:any;
	protected converter:SlideToPNGConverter;
	protected canvas:HTMLCanvasElement;

	constructor(protected _slide:Slide, public obj:any){
		super(_slide, obj);

		this._id = Math.floor(Math.random() * 100000000000);
		obj.data("id",this._id);


		// this._slide.addEventListener("layerUpdate", this.onLayerUpdate);
		 this._slide.addEventListener("update", this.onLayerUpdate);

		 this.converter = new SlideToPNGConverter();


		 var width = Math.round((ThumbSlide2.HEIGHT / this._slide.height) * this._slide.width * 1);
		 var scale = ThumbSlide2.HEIGHT / this._slide.height;

		 this.canvas = this.converter.slide2canvas(this._slide, width, ThumbSlide2.HEIGHT, scale);
		 this.thumbnail = $(this.canvas);
		 this.obj.append(this.thumbnail);
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
		this.converter.drawSlide2Canvas(this._slide, this.canvas, ThumbSlide2.HEIGHT / this._slide.height);

	//	this.thumbnail.hide().fadeIn(100);
	}

	public get id():number {
		return this._id;
	}

	// protected replaceSlide(newSlide:Slide) {
	// 	this._slide.removeEventListener("layerUpdate", this.onLayerUpdate);
	// 	this._slide = newSlide;
	// 	this._slide.addEventListener("layerUpdate", this.onLayerUpdate);
	// }
}

export class ThumbSlide2 extends CanvasSlideView {

	public static readonly HEIGHT:number = 110;
	
	private doubleClickLock:boolean;
	private doubleClickTimer:NodeJS.Timer;

	constructor(protected _slide:Slide, public obj:any){
		super(_slide, obj);

		this._slide.addEventListener("update", this.onSlideUpdate);
		this.obj.height(ThumbSlide2.HEIGHT);

		//

		var deleteBtn = $('<button class="delete"><i class="fas fa-times"></i></button>').appendTo(this.obj);
		deleteBtn.click(()=>{
			this.dispatchEvent(new CustomEvent("delete", {detail:this._slide}));
			//if(window.confirm('Are you sure?')){
//				this.removeSlide(slideView.slide ,true);
			//}
			return false;
		});
		var cloneBtn = $('<button class="clone"><i class="fas fa-plus"></i></button>').appendTo(this.obj);
		cloneBtn.click(()=>{
//			this.clonseSlide(slideView.slide);
			this.dispatchEvent(new CustomEvent("clone", {detail:this._slide}));
			return false;
		});
		var editBtn = $('<button class="edit"><i class="fas fa-edit"></i></button>').appendTo(this.obj);
		editBtn.click(()=>{
			this.dispatchEvent(new CustomEvent("edit", {detail:this._slide}));
//			this.dispatchEvent(new Event("edit"));
			return false;
		});
		
		var durationDiv = $('<div class="duration"><button class="down">-</button><span>x1</span><button class="up">+</button></div>').appendTo(this.obj);
		durationDiv.find("button.up").click((e:any)=>{
			this.lockDoubleClick();
			if(this._slide.durationRatio < 9){
				if(this._slide.durationRatio >= 2){
					this._slide.durationRatio += 1;
				}else if(this._slide.durationRatio >= 1){
					this._slide.durationRatio += 0.5;
				}else{
					this._slide.durationRatio += 0.2;
				}
			};
		});
		durationDiv.find("button.down").click((e:any)=>{
			this.lockDoubleClick();
			if(this._slide.durationRatio > 0.2){
				if(this._slide.durationRatio > 2){
					this._slide.durationRatio -= 1;
				}else if(this._slide.durationRatio > 1){
					this._slide.durationRatio -= 0.5;
				}else{
					this._slide.durationRatio -= 0.2;
				}
			};
		});


		var joinArrow = $('<div class="joinArrow"></div>').appendTo(this.obj);
		//var joinArrow = $('<div class="joinArrow"><i class="fas fa-arrow-right"></i></div>').appendTo(slide.obj);
		joinArrow.on("click.slide", (e:any)=>{
			this._slide.joining = !this._slide.joining;
			e.preventDefault();
			e.stopImmediatePropagation();
		});


		var enableCheck = $('<input class="enableCheck" type="checkbox" checked="checked" />').appendTo(this.obj);
		enableCheck.on("click.slide", (e:any)=>{
			this._slide.disabled = !enableCheck.prop("checked");
			e.stopImmediatePropagation();
		});
		enableCheck.prop("checked", !this._slide.disabled);


		//

		this.obj.on("mousedown.slide",(e:any)=>{
			//e.stopPropagation();
		});
		this.obj.on("click.slide", ()=>{
			if(this.selected) return;
			this.dispatchEvent(new CustomEvent("select", {detail:this._slide}));
			//this.selectSlide(slideView.slide);
		});
		this.obj.on("dblclick.slide", ()=>{
			if(this.doubleClickLock) return;
			this.dispatchEvent(new CustomEvent("edit", {detail:this._slide}));
//			this.dispatchEvent(new Event("edit"));
			return false;
		});

		//

		this.updatePropsView();
	}

	public fitToHeight():void {
		//this.obj.css("height","");
		var durationCorrection:number = Math.atan(this._slide.durationRatio - 1) * 0.5 + 1;
		if(this._slide.durationRatio < 1){
			durationCorrection = Math.pow(this._slide.durationRatio,0.4);
		}
		var fitWidth = (ThumbSlide2.HEIGHT / this._slide.height) * this._slide.width * durationCorrection;
		//var fitWidth = (this.obj.height() / VDoc.shared.height) * VDoc.shared.width * durationCorrection;
		//var fitWidth = (this.obj.height() / Viewer.SCREEN_HEIGHT) * Viewer.SCREEN_WIDTH * Math.pow(this._durationRatio, 1/3);

		//this.scale_base = this.obj.height() / this._slide.height;
		//animate
		{
			this.obj.stop();
			if(this.obj.attr("style") && this.obj.attr("style").indexOf("width") != -1){
				this.obj.animate({"width":fitWidth},{duration :200,step:()=>{
		//			this.scale = this._scale;
				}});
			}else{
				this.obj.width(fitWidth);
		//		this.scale = this._scale;
			}
		}
		//this.obj.width(fitWidth);

	}

	public show(){
		this.obj.hide().fadeIn(300, () => {
		});
	}

	public destroy() {
		this._slide.removeEventListener("update", this.onSlideUpdate);
		this.obj.stop();
		this.obj.find("button").remove();
		this.obj.find("div.duration").remove();
		this.obj.find("div.joinArrow").remove();
		this.obj.off("click.slide");
		this.obj.off("dblclick.slide");
		this.obj.off("mousedown.slide");

		super.destroy();
	}

	//
	// private methods
	//

	private onSlideUpdate = (e)=>{
		this.updatePropsView();
	}
	private updatePropsView(){
		if(this._slide.disabled){
			this.obj.addClass("disabled");
		}else{
			this.obj.removeClass("disabled");
		}
		if(this._slide.joining){
			this.obj.addClass("joining");
		}else{
			this.obj.removeClass("joining");
		}
		var durationStr = "";
		if(this._slide.durationRatio != 1){
			durationStr = "x" + this._slide.durationRatio.toString().substr(0,3);
		}
		this.obj.find(".duration > span").text(durationStr);

		if(this.obj.height() > 0){
			this.fitToHeight();
		}
	}
	private lockDoubleClick(){
		if(this.doubleClickTimer) clearTimeout(this.doubleClickTimer);
		this.doubleClickLock = true;
		this.doubleClickTimer = setTimeout(()=>{
			this.doubleClickLock = false;
		},100);
	}

	protected replaceSlide(newSlide:Slide) {
		this._slide.removeEventListener("update", this.onSlideUpdate);
		super.replaceSlide(newSlide);
		this._slide.addEventListener("update", this.onSlideUpdate);
		this.updatePropsView();
	}
}