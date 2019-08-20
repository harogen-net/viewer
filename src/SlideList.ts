import { SlideView } from "./__core__/view/SlideView";
import { ImageLayer } from "./__core__/model/ImageLayer";
import { EventDispatcher } from "./events/EventDispatcher";
import { DropHelper } from "./utils/DropHelper";
import { IDroppable } from "./interface/IDroppable";
import { Viewer, ViewerMode } from "./Viewer";
import { Slide } from "./__core__/model/Slide";
import { VDoc } from "./__core__/model/VDoc";
import { ThumbSlideView } from "./slide/ThumbSlideView";

declare var $: any;

export class SlideList extends EventDispatcher implements IDroppable {

	private readonly THUMB_HEIGHT:number = 110;

	private containerObj:any;

	private _slides:Slide[];
	private _slideViews:ThumbSlideView[];
	private _slideViewsById:any;
	private _selectedSlide:Slide;

	private _mode:ViewerMode;


	
	private newSlideBtn:any;


	constructor(public obj:any) {
		super();
		document.documentElement.style.setProperty("--slideThumbHeight", this.THUMB_HEIGHT + "px");

		this.obj.addClass("slideList");

		this.containerObj = $('<div class="container" />').appendTo(this.obj);
		this.containerObj.sortable({
			items:".slide",
            revert:200,
			scroll:false,
			distance:10,
			cursor:"move",
			tolerance:"pointer",
			//helper:"clone",
			forcePlaceholderSize:true,
			forceHelperSize:true,
			 update:()=>{
				this.onSlideSort();
            }
		});

		this._slides = [];
		this._slideViews = [];
		this._slideViewsById = {};

 		var dropHelper = new DropHelper(this);
		dropHelper.addEventListener(DropHelper.EVENT_DROP_COMPLETE, (e:CustomEvent)=>{
			var layer = (new ImageLayer(e.detail));
			if(layer.originHeight > (layer.originWidth * 1.2)) {
				layer.rotation -= 90;
			}
			var slide = new Slide(null,null,[layer]);
			slide.fitLayer(layer);
			this.addSlide(slide);
		}); 

		$(window).resize(()=>{
			setTimeout(()=>{
				$.each(this._slideViews, (index:number, slide:ThumbSlideView) =>{
					var bool:boolean = slide.selected;
					slide.selected = false;
					slide.fitToHeight();
					slide.selected = bool;
				})
			},50);

		});

/*  		this.obj.on("mousedown",(e)=>{
			if(this._mode == ViewerMode.SELECT) this.selectSlide();
		}); */

		this.newSlideBtn = $('<div class="newSlideBtn"><i class="fas fa-plus"></i></div>').appendTo(this.containerObj);
		this.newSlideBtn.click(()=>{
			if(this._slideViews.length > 0){
				this._slideViews[this._slideViews.length - 1].slide.joining = false;
			}
			var slide = new Slide(VDoc.shared.width, VDoc.shared.height);
			this.addSlide(slide)
			this.selectSlide(slide);
		});

		var prevSlideBtn = $('<button class="selectSlideBtn prev"><i class="fas fa-chevron-left"></i></button>');
		this.obj.append(prevSlideBtn);
		prevSlideBtn.click(()=>{
			this.selectSlideOffset(-1);
		});
		var nextSlideBtn = $('<button class="selectSlideBtn next"><i class="fas fa-chevron-right"></i></button>');
		this.obj.append(nextSlideBtn);
		nextSlideBtn.click(()=>{
			this.selectSlideOffset(1);
		});
	}

 	setMode(mode:ViewerMode):void {
		this._mode = mode;
		switch(mode){
			case ViewerMode.SELECT:
				this._slideViews.forEach(slideView=>{
					slideView.fitToHeight();
				});
			break;
			case ViewerMode.EDIT:
				this._slideViews.forEach(slideView=>{
					slideView.fitToHeight();
				});
				setTimeout(()=>{
					this.scrollToSelected();
				},300);
		break;
		}
	} 

	initialize():void {
		//documentの固有プロパティslidesをslideListが操作している悪い例
		while(this.slides.length > 0){
			this.removeSlide(this.slides[0]);
		}
	}


	addSlide(slide:Slide, index:number = -1):Slide {
		console.log("addSlide called : " + this._slides.length);

		if(index != -1 && index < this._slides.length){
			this._slides.splice(index,0,slide);
		}else{
			this._slides.push(slide);
		}

		this.setSlideUp(slide, index);
		this.sortSlideViewByIndex();

		return slide;
	}

	private getSlideViewBySlide(slide:Slide):ThumbSlideView {
		return this._slideViewsById[slide.id] || null;
	}

	private setSlideUp(slide:Slide, index:number = -1) {
		var scale:number = this.THUMB_HEIGHT / slide.height;
		var slideView:ThumbSlideView = new ThumbSlideView(slide, $('<div />'), scale);
		if(index != -1 && index < this._slides.length){
			this._slideViews.splice(index,0,slideView);
		}else{
			this._slideViews.push(slideView);
		}
		this._slideViewsById[slide.id] = slideView;

		//sortable用にslideのidをslideViewのobjにセット
		slideView.obj.data("id", slide.id);

		slideView.obj.appendTo(this.containerObj);
		slideView.fitToHeight();
		this.sortSlideViewByIndex();

		slideView.addEventListener("select", this.onSlideSelect);
		slideView.addEventListener("edit", this.onSlideEdit);
		slideView.addEventListener("clone", this.onSlideClone);
		slideView.addEventListener("delete", this.onSlideDelete);

		slideView.show();
	}

	clonseSlide(slide:Slide):Slide {
		if(this._slides.indexOf(slide) == -1) return;

		var clonedSlide:Slide = slide.clone();
		this.addSlide(clonedSlide, this._slides.indexOf(slide) + 1);
		this.selectSlide(clonedSlide);
		slide.joining = true;

		return clonedSlide;
	}

	// private onSlideUpdate = (ce:CustomEvent)=>{
	// 	this.updateSlideProps(ce.detail as Slide);
	// }
	private onSlideSelect = (ce:CustomEvent)=>{
		this.selectSlide(ce.detail as Slide);
	}
	private onSlideEdit = (ce:CustomEvent)=>{
		this.dispatchEvent(new Event("edit"));
	}
	private onSlideClone = (ce:CustomEvent)=>{
		this.clonseSlide(ce.detail as Slide);
	}
	private onSlideDelete = (ce:CustomEvent)=>{
		this.removeSlide(ce.detail as Slide, true);
	}


	removeSlide(slide:Slide, isAnimation:boolean = false):Slide{
		var index:number = this._slides.indexOf(slide);
		if(index == -1) return;


		var slideView:ThumbSlideView = this.getSlideViewBySlide(slide);
//		slide.removeEventListener("update", this.onSlideUpdate);
		slideView.removeEventListener("select", this.onSlideSelect);
		slideView.removeEventListener("edit", this.onSlideEdit);
		slideView.removeEventListener("clone", this.onSlideClone);
		slideView.removeEventListener("delete", this.onSlideDelete);


		var nextSlide:Slide = null;
		if(slideView.selected){
			if(index < this._slideViews.length - 1) {
				nextSlide = this._slideViews[index + 1].slide;
			}else if(index > 0){
				nextSlide = this._slideViews[index - 1].slide;
			}
		}
		var removeMain = ()=>{
			this._slideViews.splice(index, 1);
			delete this._slideViewsById[slide.id];
			slideView.destroy();
			slideView = null;

			this._slides.splice(index, 1);
			slide.removeAllLayers();
			slide.clearEventListener();
			slide = null;
		}

		if(isAnimation){
			this.obj.css("pointer-events","none");
			slideView.obj.fadeOut(200, () => {
				this.obj.css("pointer-events","");
				if(nextSlide){
					this.selectSlide(nextSlide);
				}else{
					this.dispatchEvent(new Event("close"));
				}
				//実際に削除するのは、editableに表示されなくなってから
				//そうしないと、slide削除時に共有レイヤダイアログが出てうざったい
				removeMain();
				this.sortSlideViewByIndex();
			});
		}else{
			removeMain();
			this.sortSlideViewByIndex();
			if(nextSlide){
				this.selectSlide(nextSlide);
			}else{
				this.dispatchEvent(new Event("close"));
			}
		}


		return slide;
	}

	// public refresh(){
	// 	this._slideViews.forEach(slide=>{
	// //		(slide as ThumbSlide).refresh();
	// 	})
	// }

	//

	private selectSlide(slide:Slide = null){
		this._selectedSlide = slide;

		this._slideViews.forEach(slideView=>{
			slideView.selected = (slide == slideView.slide);
		});

		this.dispatchEvent(new Event("select"));
		this.scrollToSelected();
	}

	private selectSlideOffset(offset:number = 0){
		if(offset == 0) return;
		var index = this._slides.indexOf(this._selectedSlide);
		if(index == -1) return;
		var index2 = index + offset;
		if(index2 < 0) index2 = 0;
		if(index2 > this._slides.length - 1) index2 = this._slides.length - 1;
		if(index2 == index) return;
		this.selectSlide(this._slides[index2]);
	}

	private scrollToSelected(){
		if(!this._selectedSlide) return;
		switch(this._mode){
			case ViewerMode.SELECT:
			//	this.obj.animate({"scrollTop":this._selectedSlide.obj.position().top});
			break;
			case ViewerMode.EDIT:
				this.containerObj.animate({"scrollLeft":this.selectedSlideView.obj.position().left + this.containerObj.scrollLeft() - this.containerObj.width() / 2 + this.selectedSlideView.obj.width() / 2 - 40});
				//「40」はbody.edit .slideList .containerの左右padding値
			break;
		}
	}

	private sortSlideViewByIndex(){
		if(this._slideViews.length == 0) return;

		$.each(this._slideViews, (i:number, slide:ThumbSlideView) => {
			this.containerObj.append(slide.obj);
			slide.obj.removeClass("last");
		});
		this._slideViews[this._slideViews.length - 1].obj.addClass("last");
		this.containerObj.append(this.newSlideBtn);
		this.containerObj.sortable("refresh");
	}

	//

	private onSlideSort() {
		this.containerObj.find(".slide").each((i:number, elem:any)=>{
			this._slideViews[i] = this._slideViewsById[$(elem).data("id")];
		});
		this._slides.sort((a:Slide, b:Slide)=>{
			return this._slideViews.indexOf(this.getSlideViewBySlide(a)) < this._slideViews.indexOf(this.getSlideViewBySlide(b)) ? -1 : 1;
		});
		this.sortSlideViewByIndex();
	}


	
	//
	// getset
	//
	get selectedSlide():Slide {
		return this._selectedSlide;
	}
	get selectedSlideView():SlideView {
		return this.getSlideViewBySlide(this._selectedSlide);
	}

	get isActive():boolean {
		return true;
	}

	public set slides(value:Slide[]) {
		if(!value) return;
		this.initialize();

		this._slides = value;

		//valueの参照を消さずに、valueの中のslideがaddSlideされた後のようにする
		//割とめんどくさい処理
		for(var i = 0; i < this._slides.length; i++){
			this.setSlideUp(this._slides[i]);
		}
		this.sortSlideViewByIndex();
	}
	public get slides():Slide[] {
		return this._slides;
	}

	get selectedSlideIndex():number{
		if(this._selectedSlide == null){
			return -1;
		}else{
			return this._slides.indexOf(this._selectedSlide);
		}
	}
}