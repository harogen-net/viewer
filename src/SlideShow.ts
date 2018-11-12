import { EventDispatcher } from "./events/EventDispatcher";
import { Slide } from "./__core__/Slide";
import { Image } from "./__core__/Image";

declare var $:any;

export class SlideShow extends EventDispatcher {

	private _isRun:boolean;
	private _isPause:boolean;
	private _mirrorH:boolean;
	private _mirrorV:boolean;

	private slideContainer:any;

	private slides:Slide[];
	private data:any[];
	private index:number;
	private isInit:boolean;
	private timer:any;
	private history:Slide[];
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
				$.each(this.slides, (index:number, slide:Slide) =>{
					slide.updateSize();
				})
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

	setUp(slides:Slide[]):void {
		//console.log("setup at slideshow", this._isRun);
		this.intialize();

		this.interval = parseInt($("#interval").val());
		this.duration = parseInt($("#duration").val());
//		this.bgColor = $("#bgColor").val();

		var slideIndex:number = 0;
		var lastSlide:Slide = undefined;
		for(var i:number = 0; i < slides.length; i++){
			var slide:Slide = slides[i];
			var lastSlide:Slide = (i == 0) ? slides[slides.length - 1] : slides[i - 1];

			var slideForSS:Slide = slide.clone();
//			slideForSS.obj.css("background-color",this.bgColor);
			slideForSS.obj.hide();

			var datum:any = {};

			if(this.checkSlidesSame(slide,lastSlide)){
				datum.keep = true;
				datum.index = this.slides.length - 1;
			}else{
				datum.index = this.slides.length;
				this.slides.push(slideForSS);
				//this.obj.append(slideForSS.obj);
				this.slideContainer.append(slideForSS.obj);
			}
			datum.transforms = [];
			for(var j:number = 0; j < slide.images.length; j++){
				var transform:any = slide.images[j].transform;
				transform.opacity = slide.images[j].opacity;
				datum.transforms.push(transform);
			}
			datum.durationRatio = slide.durationRatio;
			this.data.push(datum);
		}

		//すべてkeepだった場合を解決
		if(this.slides.length == 0){	
			var slideForSS:Slide = slides[0].clone();
			this.slides.push(slideForSS);
			this.obj.append(slideForSS.obj);
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
			$.each(this.slides, (index:number, slide:Slide) =>{
				slide.removeAllImages();
				slide.obj.stop();
				slide.obj.remove();
			});
		}
		this.slides = [];
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

		if(this.data.length == 1){
			$.each(this.slides, (index:number, slide:Slide) =>{
				slide.obj.css("opacity", 0);
				slide.updateSize();
				slide.obj.animate({"opacity":1},1000);
			})
			return;
		}

		$.each(this.slides, (index:number, slide:Slide) =>{
			slide.obj.css("opacity", 0);
			slide.updateSize();
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
		$.each(this.slides, (index:number, slide:Slide) =>{
			slide.obj.stop().css({
				"z-index":0,
				"opacity":1
			});
			slide.obj.find(".imgWrapper").css("transition", "");
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
		var slide:Slide = this.slides[datum.index];

		this.slideDuration = this.interval * datum.durationRatio;
		
		if(datum.keep && !this.isInit){
			slide.obj.stop().css({"opacity":1});
			var keepDurationOffset:number = Math.min(this.slideDuration * 0.2, (this.interval - this.duration));
			slide.obj.find(".imgWrapper").css("transition", "transform " + ((this.slideDuration - keepDurationOffset) / 1000) + "s cubic-bezier(.4,0,.7,1)");
			slide.obj.find("img").css("transition", "opacity " + ((this.slideDuration - keepDurationOffset) / 1000) + "s linear");
			//slide.obj.find(".imgWrapper").css("transition", "transform " + (this.duration / 1000) + "s cubic-bezier(.4,0,.7,1)");
		}else{
			slide.obj.find(".imgWrapper").css("transition", "");
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
		for(var i:number = 0; i < slide.images.length; i++){
			slide.images[i].transform = datum.transforms[i];
			slide.images[i].opacity = datum.transforms[i].opacity;
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

	private checkSlidesSame(slide1:Slide, slide2:Slide):boolean {
		if(slide1.images.length != slide2.images.length) return false;
		if(slide1.images.length == 0) return false;

		for(var i = 0; i < slide1.images.length; i++){
			var image1:Image = slide1.images[i];
			var image2:Image = slide2.images[i];
			if(image1.imageId != image2.imageId) return false;
	//		if(image1.id != image2.id) return false;
		}

		return true;
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