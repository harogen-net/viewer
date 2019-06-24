import { SlideView } from "./__core__/view/SlideView";
import { ImageLayer } from "./__core__/model/ImageLayer";
import { EventDispatcher } from "./events/EventDispatcher";
import { DropHelper } from "./utils/DropHelper";
import { IDroppable } from "./interface/IDroppable";
import { Viewer, ViewerMode } from "./Viewer";
import { join } from "path";
import { CanvasSlideView, ThumbSlide2 } from "./slide/CanvasSlideView";
import { Slide } from "./__core__/model/Slide";
import { VDoc } from "./__core__/model/VDoc";

declare var $: any;

export class SlideList extends EventDispatcher implements IDroppable {

	private _slides:Slide[];
	private _slideViews:ThumbSlide2[];
	private _slideViewsById:any;
	private _selectedSlide:Slide;

	private _mode:ViewerMode;


	
	private newSlideBtn:any;


	constructor(public obj:any) {
		super();
		document.documentElement.style.setProperty("--slideThumbHeight", ThumbSlide2.HEIGHT + "px");

		this.obj.addClass("slideList");
		this.obj.sortable({
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

//			slideView.refresh();
		}); 

		$(window).resize(()=>{
			setTimeout(()=>{
				$.each(this._slideViews, (index:number, slide:ThumbSlide2) =>{
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

		this.newSlideBtn = $('<div class="newSlideBtn"><i class="fas fa-plus"></i></div>').appendTo(this.obj);
		this.newSlideBtn.click(()=>{
			if(this._slideViews.length > 0){
				this._slideViews[this._slideViews.length - 1].slide.joining = false;
			}
			var slide = new Slide(VDoc.shared.width, VDoc.shared.height);
			this.addSlide(slide)
//			this.selectSlide();
		});
	}

 	setMode(mode:ViewerMode):void {
		this._mode = mode;
		switch(mode){
			case ViewerMode.SELECT:
				this._slideViews.forEach(slideView=>{
					slideView.fitToHeight();
				});
				// $.each(this._slideViews, (index:number, slide:SlideView)=>{
				// 	slide.fitToHeight();
				// });
				//this.obj.sortable("refresh");
				//this.obj.sortable("enable");
			break;
			case ViewerMode.EDIT:
				this._slideViews.forEach(slideView=>{
					slideView.fitToHeight();
				});
				// 	$.each(this._slideViews, (index:number, slide:SlideView)=>{
				// 	slide.fitToHeight();
				// });
				//this.obj.sortable("disable");
				//this.obj.sortable("refresh");
				//this.obj.sortable("enable");
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
//			this._slides[index].obj.after(slide.obj);
		}else{
			this._slides.push(slide);
		}

///		slide.id = Math.floor(Math.random()*100000000);
/*		$.each(this._slides, (i, slide2:Slide)=>{
			console.log(slide2, slide2.id);
		});*/
//		this._slideViewsById[slide.id] = slide;

		this.setSlideUp(slide, index);
		this.sortSlideObjByIndex();

		return slide;
	}

	private getSlideViewBySlide(slide:Slide):ThumbSlide2 {
		return this._slideViews[this._slides.indexOf(slide)] || null;
	}

	private setSlideUp(slide:Slide, index:number = -1) {
		var slideView:ThumbSlide2 = new ThumbSlide2(slide, $('<div />'));
		if(index != -1 && index < this._slides.length){
			this._slideViews.splice(index,0,slideView);
		}else{
			this._slideViews.push(slideView);
		}
		this._slideViewsById[slideView.id] = slideView;

		slideView.obj.appendTo(this.obj);
		slideView.fitToHeight();
		this.sortSlideObjByIndex();
		console.log("slide append : " + new Date().getTime());


		// slide.addEventListener("update", this.onSlideUpdate);
		// this.updateSlideProps(slideView.slide);

		slideView.addEventListener("select", this.onSlideSelect);
		slideView.addEventListener("edit", this.onSlideEdit);
		slideView.addEventListener("clone", this.onSlideClone);
		slideView.addEventListener("delete", this.onSlideDelete);

		slideView.show();

// 		var deleteBtn = $('<button class="delete"><i class="fas fa-times"></i></button>').appendTo(slideView.obj);
// 		deleteBtn.click(()=>{
// 			//if(window.confirm('Are you sure?')){
// 				this.removeSlide(slideView.slide ,true);
// 			//}
// 			return false;
// 		});
// 		var cloneBtn = $('<button class="clone"><i class="fas fa-plus"></i></button>').appendTo(slideView.obj);
// 		cloneBtn.click(()=>{
// 			this.clonseSlide(slideView.slide);
// 			return false;
// 		});
// 		var editBtn = $('<button class="edit"><i class="fas fa-edit"></i></button>').appendTo(slideView.obj);
// 		editBtn.click(()=>{
// 			this.dispatchEvent(new Event("edit"));
// 			return false;
// 		});
		
// 		var durationDiv = $('<div class="duration"><button class="down">-</button><span>x1</span><button class="up">+</button></div>').appendTo(slideView.obj);
// 		durationDiv.find("button.up").click((e:any)=>{
// 			this.lockDoubleClick();
// 			if(slide.durationRatio < 9){
// 				if(slide.durationRatio >= 2){
// 					slide.durationRatio += 1;
// 				}else if(slide.durationRatio >= 1){
// 					slide.durationRatio += 0.5;
// 				}else{
// 					slide.durationRatio += 0.2;
// 				}
// /* 				setTimeout(()=>{
// 					this.scrollToSelected();
// 				},200); */
// 			//	this.updateSlideDuration(slideView.slide);
// 			};
// 		});
// 		durationDiv.find("button.down").click((e:any)=>{
// 			this.lockDoubleClick();
// 			if(slide.durationRatio > 0.2){
// 				if(slide.durationRatio > 2){
// 					slide.durationRatio -= 1;
// 				}else if(slide.durationRatio > 1){
// 					slide.durationRatio -= 0.5;
// 				}else{
// 					slide.durationRatio -= 0.2;
// 				}
// /* 				setTimeout(()=>{
// 					this.scrollToSelected();
// 				},200); */
// 			//	this.updateSlideDuration(slideView.slide);
// 			};
// 		});


// 		var joinArrow = $('<div class="joinArrow"></div>').appendTo(slideView.obj);
// 		//var joinArrow = $('<div class="joinArrow"><i class="fas fa-arrow-right"></i></div>').appendTo(slide.obj);
// 		joinArrow.on("click.slide", (e:any)=>{
// 			slideView.slide.joining = !slideView.slide.joining;
// 			e.preventDefault();
// 			e.stopImmediatePropagation();
// 		});


// 		var enableCheck = $('<input class="enableCheck" type="checkbox" checked="checked" />').appendTo(slideView.obj);
// 		enableCheck.on("click.slide", (e:any)=>{
// 			slideView.slide.disabled = !enableCheck.prop("checked");
// 			e.stopImmediatePropagation();
// 		});
// 		enableCheck.prop("checked", !slideView.slide.disabled);


// 		//

// 		slideView.obj.on("mousedown.slide",(e:any)=>{
// 			//e.stopPropagation();
// 		});
// 		slideView.obj.on("click.slide", ()=>{
// 			this.selectSlide(slideView.slide);
// 		});
// 		slideView.obj.on("dblclick.slide", ()=>{
// 			if(this.doubleClickLock) return;
// 			this.dispatchEvent(new Event("edit"));
// 			return false;
// 		});
// 		slideView.obj.hide().fadeIn(300, () => {
// 		});
	}

	clonseSlide(slide:Slide):Slide {
		if(this._slides.indexOf(slide) == -1) return;
		console.log("clonseSlide called : " + new Date().getTime());

		var clonedSlide:Slide = slide.clone();
		this.addSlide(clonedSlide, this._slides.indexOf(slide) + 1);
		slide.joining = true;

		setTimeout(()=>{
			this.selectSlide(clonedSlide);
		},50)

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


		var slideView:ThumbSlide2 = this.getSlideViewBySlide(slide);
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
			delete this._slideViewsById[(slideView as CanvasSlideView).id];
			slideView.destroy();
			slideView = null;

			this._slides.splice(index, 1);
			slide.removeAllLayers();
		}

		if(isAnimation){
			this.obj.css("pointer-events","none");
			slideView.obj.fadeOut(200, () => {
				this.obj.css("pointer-events","");
				removeMain();
				this.sortSlideObjByIndex();
				if(nextSlide){
					this.selectSlide(nextSlide);
				}else{
					this.dispatchEvent(new Event("close"));
				}
			});
		}else{
			removeMain();
			this.sortSlideObjByIndex();
			if(nextSlide){
				this.selectSlide(nextSlide);
			}else{
				this.dispatchEvent(new Event("close"));
			}
		}


		return slide;
	}

	// private updateSlideProps(slide){
	// 	var slideView:ThumbSlide2 = this.getSlideViewBySlide(slide);
	// 	if(!slideView) return;

	// 	if(slide.disabled){
	// 		slideView.obj.addClass("disabled");
	// 	}else{
	// 		slideView.obj.removeClass("disabled");
	// 	}
	// 	if(slide.joining){
	// 		slideView.obj.addClass("joining");
	// 	}else{
	// 		slideView.obj.removeClass("joining");
	// 	}
	// 	var durationStr = "";
	// 	if(slide.durationRatio != 1){
	// 		durationStr = "x" + slide.durationRatio.toString().substr(0,3);
	// 	}
	// 	slideView.obj.find(".duration > span").text(durationStr);

	// 	slideView.fitToHeight();
	// }

	public refresh(){
		this._slideViews.forEach(slide=>{
	//		(slide as ThumbSlide).refresh();
		})
	}

	//

	private selectSlide(slide:Slide = null){
		this._selectedSlide = slide;

		this._slideViews.forEach(slideView=>{
			slideView.selected = (slide == slideView.slide);
		});

		// $.each(this._slideViews, (index:number, slide2:ThumbSlide2) => {
		// 	//slide2.obj.off("click.slide");

		// 	if(slide2.slide == slide){
		// 		slide2.selected = true;
		// 		this._selectedSlide = slide;

		// 	}else{
		// 		slide2.selected = false;
		// 	/*	slide2.obj.on("click.slide", ()=>{
		// 			this.selectSlide(slide2.slide);
		// 		}); */
		// 	}
		// })
		this.dispatchEvent(new Event("select"));
		this.scrollToSelected();
	}

	private scrollToSelected(){
		if(!this._selectedSlide) return;
		switch(this._mode){
			case ViewerMode.SELECT:
			//	this.obj.animate({"scrollTop":this._selectedSlide.obj.position().top});
			break;
			case ViewerMode.EDIT:
				this.obj.animate({"scrollLeft":this.selectedSlideView.obj.position().left + this.obj.scrollLeft() - this.obj.width() / 2 + this.selectedSlideView.obj.width() / 2});
			break;
		}
	}



	private sortSlideObjByIndex(){
		if(this._slideViews.length == 0) return;

		$.each(this._slideViews, (i:number, slide:ThumbSlide2) => {
			this.obj.append(slide.obj);
			slide.obj.removeClass("last");
		});
		this._slideViews[this._slideViews.length - 1].obj.addClass("last");
		this.obj.append(this.newSlideBtn);
		this.obj.sortable("refresh");
	}

	//

	private onSlideSort() {
		this.obj.find(".slide").each((i:number, obj:any)=>{
			this._slideViews[i] = this._slideViewsById[$(obj).data("id")];
			
		});

		this._slides.sort((a:Slide, b:Slide)=>{
			return this._slideViews.indexOf(this.getSlideViewBySlide(a)) < this._slideViews.indexOf(this.getSlideViewBySlide(b)) ? -1 : 1;
		});

		this.sortSlideObjByIndex();
	}

	// private getSlideViewBySlide(slide:Slide):SlideView {
	// 	this._slideViews.forEach(slideView=>{
	// 		if(slideView.slide == slide) return slideView;
	// 	});
	// }

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
		this.sortSlideObjByIndex();
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