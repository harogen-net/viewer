import { EventDispatcher } from "../events/EventDispatcher";
import { SlideView } from "../view/SlideView";
import { ImageLayer } from "../model/layer/ImageLayer";
import { Layer, LayerType } from "../model/Layer";
import { TextLayer } from "../model/layer/TextLayer";
import { DOMSlideView } from "../view/slide/DOMSlideView";
import { Slide } from "../model/Slide";
import { ViewerDocument } from "../model/ViewerDocument";

declare var $:any;

export class SlideShowViewController extends EventDispatcher {
	private _isRun:boolean;
	private _isPause:boolean;
	private _mirrorH:boolean;
	private _mirrorV:boolean;

	private slideContainer:any;

	private slides:SlideView[] = [];
	private data:any[];
	private index:number;
	private isInit:boolean;
	private timer:any;
	private history:SlideView[];
	private mouseMoveTimer:any;

	private interval:number;
	private duration:number;
	private bgColor:string;

	private started:number;
	private elapsed:number;
	private slideDuration:number;

	//private readonly RUN_IN_WINDOW:boolean = true;

	constructor(public obj:any){
		super();

		obj.addClass("slideShow");
		document.addEventListener("webkitfullscreenchange",()=>{
			if(document["webkitFullscreenElement"]){
			}else{
				this.stop();
			}
		});

		$(window).resize(()=>{
			setTimeout(()=>{
				this.updateSlideSize();
			},50);

		});
		
		this.slideContainer = $('<div class="slideContainer" />').appendTo(obj);
		
		var closeBtn = $('<button class="close"><i class="fas fa-times"></i></button>').appendTo(obj);
		closeBtn.click(()=>{
			//this.stop();
			this.intialize();
		});

		document.onmousedown = ()=>{
			if(!this._isRun) return;
			if(!this._isPause){
				this.pause();
			}else{
				this.resume();
			}
			return false;
		};
	}

	setUp(targetSlides:Slide[]):void {
		console.log("setup at slideshow", targetSlides.length);
		this.intialize();

		this.interval = parseInt($("#interval").val());
		this.duration = parseInt($("#duration").val());
//		this.bgColor = $("#bgColor").val();

		targetSlides = targetSlides.filter((value:Slide)=>{
			return !value.disabled;
		});

		var slideIndex:number = 0;
		var lastSlide:Slide = undefined;
		for(var i:number = 0; i < targetSlides.length; i++){
			var slide:Slide = targetSlides[i];
			var lastSlide:Slide = (i == 0) ? targetSlides[targetSlides.length - 1] : targetSlides[i - 1];

			var newObj:any = $('<div />');
			var slideForSS:Slide = slide.clone();
			var slideViewForSS:DOMSlideView = new DOMSlideView(slide.clone(), newObj);
			slideForSS.id = slide.id;
			slideForSS.durationRatio = slide.durationRatio;
			slideForSS.joining = slide.joining;
			slideForSS.disabled = slide.disabled;
			slideViewForSS.obj.hide();

			var datum:any = {};

			if(this.checkSlidesSame(slide,lastSlide)){
				datum.keep = true;
				datum.index = this.slides.length - 1;
			}else{
				datum.index = this.slides.length;
				this.slides.push(slideViewForSS);
				//this.obj.append(slideForSS.obj);
				this.slideContainer.append(slideViewForSS.obj);
			}
			datum.transforms = [];
			for(var j:number = 0; j < slide.layers.length; j++){
				var transform:any = slide.layers[j].transform;
				transform.opacity = slide.layers[j].opacity;
				if(slide.layers[j].type == LayerType.IMAGE){
					transform.clipRect = (slide.layers[j] as ImageLayer).clipRect;
				}
				datum.transforms.push(transform);
			}
			datum.durationRatio = slide.durationRatio;
			this.data.push(datum);
		}

		//すべてkeepだった場合を解決
		if(this.slides.length == 0){	
			//var slideForSS:SlideView = slides[0].clone();

			var newObj:any = $('<div />');
			var slideForSS:Slide = slide.clone();
			var slideViewForSS:DOMSlideView = new DOMSlideView(slideForSS, newObj);
			slideForSS.id = targetSlides[0].id;
			slideForSS.durationRatio = targetSlides[0].durationRatio;
			slideForSS.joining = targetSlides[0].joining;
			slideForSS.disabled = targetSlides[0].disabled;
	
			this.slides.push(slideViewForSS);
			this.slideContainer.append(slideViewForSS.obj);
		}

		//index:-1を解決
		$.each(this.data, (number, datum:any)=>{
			if(datum.index < 0){
				datum.index += this.slides.length;
			}
		});
		//console.log(this.data);
	}

	public intialize():void{
		this._isRun = false;
		this._isPause = false;
		clearInterval(this.timer);
		this.started = 0;
		this.elapsed = 0;
		this.obj.removeClass("pause");
		this.isInit = false;
		
		if(!$(".fullscreen").prop("checked")) {
		//if(this.RUN_IN_WINDOW) {
			$("body").removeClass("slideShow");
		}else{
			try{
				document.exitFullscreen(); //HTML5 Fullscreen API仕様
			}catch(e){};
			try{
				document["webkitCancelFullScreen"](); //Chrome, Safari, Opera
			}catch(e){};
		}

		if(this.slides){
			while(this.slides.length > 0){
				this.slides.pop().destroy();
			}
		}

		this.data = [];
		this.history = [];

		this.stopCursorAutoHide();
	}

	public run(initIndex:number = 0):void{
		//console.log("run at slideshow", this._isRun);
		if(this._isRun) return;
		if(this.slides.length == 0) return;
		this._isRun = true;
		this.isInit = true;

		if(!$(".fullscreen").prop("checked")) {
			$("body").addClass("slideShow");
		}else{
			this.obj[0].webkitRequestFullScreen();
		}
		this.updateSlideSize();

		if(this.data.length == 1){
			$.each(this.slides, (index:number, slide:SlideView) =>{
				slide.obj.css("opacity", 0);
//				slide.updateSize();
				slide.obj.show();
				slide.obj.animate({"opacity":1},1000);

				for(var i:number = 0; i < slide.slide.layers.length; i++){
					var layer = slide.slide.layers[i];
					var trans = layer.transform;
					//文字要素を反転から救う
					if(layer.type == LayerType.TEXT || (layer.type == LayerType.IMAGE && (layer as ImageLayer).isText)){
						this.avoidMirror(layer, trans.mirrorH, trans.mirrorV);
					}
				}				
			});
			return;
		}

		$.each(this.slides, (index:number, slide:SlideView) =>{
			slide.obj.css("opacity", 0);
			//slide.updateSize();
		})

		this.index = initIndex;
		this.timer = setTimeout(()=>{
			this.slideShowFunc();
		}, 1000);

		this.startCursorAutoHide();
	}

	public stop():void{
	   // console.log("stop at slideshow", this.timer);
		if(!this._isRun) return;
		this._isRun = false;
		this._isPause = false;

		if(!$(".fullscreen").prop("checked")) {
		//if(this.RUN_IN_WINDOW) {
			$("body").removeClass("slideShow");
		}else{
			try{
				document.exitFullscreen(); //HTML5 Fullscreen API仕様
			}catch(e){};
			try{
				document["webkitCancelFullScreen"](); //Chrome, Safari, Opera
			}catch(e){};
		}

		clearInterval(this.timer);
		$.each(this.slides, (index:number, slide:SlideView) =>{
			slide.obj.stop().css({
				"z-index":0,
				"opacity":1
			});
			slide.obj.find(".layerWrapper").css("transition", "");
		});

		this.stopCursorAutoHide();
	}

	public pause():void{
		if(!this._isRun) return;
		if(this._isPause) return;
		this._isPause = true;
		this.obj.addClass("pause");

		this.elapsed = new Date().getTime() - this.started;
		clearInterval(this.timer);

		//console.log("[paused]");
		//console.log("slideDuration : " + this.slideDuration + "ms");
		//console.log("elasped : " + this.elapsed + "ms");
		this.stopCursorAutoHide();
	}

	public resume():void{
		if(!this._isRun) return;
		if(!this._isPause) return;
		this._isPause = false;
		this.obj.removeClass("pause");

		var restDuration:number = this.slideDuration - this.elapsed;
		if(restDuration < 0){
			this.slideShowFunc();
		}else{
			this.timer = setTimeout(()=>{
				this.slideShowFunc();
			}, restDuration);
	
		}
		//console.log("[resume]");
		//console.log("restDuration : " + restDuration + "ms");
		//note : 同一スライド上で2回以上ポーズをすると、経過時刻がおかしくなりリジュームが正常に動作しない。
		//		とはいえリジューム後すぐに次のスライドが始まるだけなので現状実害はない
		this.startCursorAutoHide();
	}

	//

	private slideShowFunc(){
		this.started = new Date().getTime();
		this.elapsed = 0;

		var datum:any = this.data[this.index % this.data.length];
		var slide:SlideView = this.slides[datum.index];

		this.slideDuration = this.interval * datum.durationRatio;
		
		if(datum.keep && !this.isInit){
			slide.obj.stop().css({"opacity":1});
			var keepDurationOffset:number = Math.min(this.slideDuration * 0.2, (this.interval - this.duration));
			var transitionDuration = ((this.slideDuration - keepDurationOffset) / 1000);
			var bezierStr = "cubic-bezier(.4,0,.7,1)";
			slide.obj.find(".layerWrapper").css("transition", "transform " + transitionDuration + "s " + bezierStr);


			var imgTransitions:string[] = [];
			imgTransitions.push("opacity " + transitionDuration + "s linear");
			imgTransitions.push("clip-path " + transitionDuration + "s " + bezierStr);
			imgTransitions.push("-webkit-clip-path " + transitionDuration + "s " + bezierStr);
			slide.obj.find("img").css("transition", imgTransitions.join(", "));
			//slide.obj.find("img").css("transition", "all " + transitionDuration + "s linear");
			//slide.obj.find(".layerWrapper").css("transition", "transform " + (this.duration / 1000) + "s cubic-bezier(.4,0,.7,1)");
		}else{
			slide.obj.find(".layerWrapper").css("transition", "");
			slide.obj.find("img").css("transition", "");
			slide.obj.show();
			slide.obj.css({
				"z-index": this.index + 100,
				"opacity":0
			});
			slide.obj.animate({"opacity":1},Math.min(this.duration,this.slideDuration));

			if(this.history.indexOf(slide) != -1){
				this.history.splice(this.history.indexOf(slide),1);
			}
			this.history.push(slide);
		}
		for(var i:number = 0; i < slide.slide.layers.length; i++){
			var layer = slide.slide.layers[i];
			var trans = datum.transforms[i];
			layer.transform = trans;

			//文字要素を反転から救う
			if(layer.type == LayerType.TEXT || (layer.type == LayerType.IMAGE && (layer as ImageLayer).isText)){
				this.avoidMirror(layer, trans.mirrorH, trans.mirrorV);
			}
			layer.opacity = datum.transforms[i].opacity;

			if(layer.type == LayerType.IMAGE){
				(layer as ImageLayer).clipRect = datum.transforms[i].clipRect;
			}
		}
		
		this.timer = setTimeout(()=>{
			this.slideShowFunc();
		} ,this.slideDuration);
		this.index++;

		if(this.history.length > 2){
			this.history.shift().obj.hide();
		}
		this.isInit = false;
	}

	private startCursorAutoHide(){
		this.obj.on("mousemove.showing", (any)=>{
			this.mouseMoveOnPlaying();
		});
		this.mouseMoveTimer = setTimeout(()=>{
			this.obj.addClass("playing");
		}, 1000);
	}

	private stopCursorAutoHide(){
		this.obj.off("mousemove.showing");
		clearInterval(this.mouseMoveTimer);
		this.obj.removeClass("playing");
	}

	private mouseMoveOnPlaying(){
		this.obj.removeClass("playing");
		clearInterval(this.mouseMoveTimer);

		if(!this._isRun) return;
		if(this._isPause) return;

		this.mouseMoveTimer = setTimeout(()=>{
			this.obj.addClass("playing");
		}, 1000);
	}
	
	private updateMirror(){
		var cssTxts:string[] = [];
		if(this._mirrorH) cssTxts.push("scaleX(-1)");
		if(this._mirrorV) cssTxts.push("scaleY(-1)");
		this.slideContainer.css("transform", cssTxts.join(" "));
	}

	//

	private updateSlideSize(){
//		console.log("updateSlideSize");
		let dispWidth = this.obj.width();
		let dispHeight = this.obj.height();
		let dispScale = Math.min(dispWidth / ViewerDocument.shared.width, dispHeight / ViewerDocument.shared.height);
		let offsetX = (dispWidth - ViewerDocument.shared.width) / 2;
		let offsetY = (dispHeight - ViewerDocument.shared.height) / 2;

		this.slideContainer.find(".slide").each((i, elem)=>{
			$(elem).css("transform", "translate(" + offsetX + "px, " + offsetY + "px) scale(" + dispScale + ")");
			$(elem).css("width", ViewerDocument.shared.width + "px");
			$(elem).css("height", ViewerDocument.shared.height + "px");
		});

	}


	//スライドの構造が同じかどうかを調べる
	private checkSlidesSame(slide1:Slide, slide2:Slide):boolean {
		if(!slide2.joining) return false;
		if(slide1.layers.length == 0) return false;
		if(slide2.layers.length == 0) return false;

		var visibleLayers1 = slide1.layers.filter(layer=>layer.visible);
		var visibleLayers2 = slide2.layers.filter(layer=>layer.visible);

		if(visibleLayers1.length != visibleLayers2.length) return false;


		for(var i = 0; i < visibleLayers1.length; i++){
			var layer1:Layer = visibleLayers1[i];
			var layer2:Layer = visibleLayers2[i];

			if(layer1.type != layer1.type) return false;

			switch(layer1.type){
				case LayerType.IMAGE:
					if((layer1 as ImageLayer).imageId != (layer2 as ImageLayer).imageId) return false;
//					if((layer1 as ImageLayer).clipString != (layer2 as ImageLayer).clipString) return false;
					if((layer1 as ImageLayer).isText != (layer2 as ImageLayer).isText) return false;
				break;
				case LayerType.TEXT:
//					if(layer1.id != layer2.id) return false;
					if((layer1 as TextLayer).text != (layer2 as TextLayer).text) return false;
				break;
				default:
					if(layer1.id != layer2.id) return false;
				break;
			}
		}

		return true;
	}

	//textLayerを鏡面再生でも読めるようにする
	//ついでに文字を含む画像も鏡面で読めるように改修
	//回転角が±90度あたりならば鏡面の縦横を逆にして判定
	private avoidMirror(layer:Layer, defaultMirrorH:boolean, defaultMirrorV:boolean){
		if(this._mirrorH){
			if((layer.rotation > 45 && layer.rotation < 135) || (layer.rotation < -45 && layer.rotation > -135)){
				layer.mirrorV = !defaultMirrorV;
			}else{
				layer.mirrorH = !defaultMirrorH;
			}
		}
		if(this._mirrorV){
			if((layer.rotation > 45 && layer.rotation < 135) || (layer.rotation < -45 && layer.rotation > -135)){
				layer.mirrorH = !defaultMirrorH;
			}else{
				layer.mirrorV = !defaultMirrorV;
			}
		}
	}

	//

	get isRun():boolean {
		return this._isRun;
	}

	public set mirrorH(value:boolean){
		this._mirrorH = value;
		this.updateMirror();
	}
	public set mirrorV(value:boolean){
		this._mirrorV = value;
		this.updateMirror();
	}
}