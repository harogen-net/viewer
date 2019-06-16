import { SlideView } from "./__core__/SlideView";
import {Image} from "./__core__/layerModel/Image";
import { EventDispatcher } from "./events/EventDispatcher";
import { DropHelper } from "./utils/DropHelper";
import { IDroppable } from "./interface/IDroppable";
import { Viewer, ViewerMode } from "./Viewer";
import { join } from "path";
import { ThumbSlide } from "./__core__/slide/ThumbSlide";

declare var $: any;

export class SlideList extends EventDispatcher implements IDroppable {

	private _slides:SlideView[];
	private _slidesById:any;
	private _mode:ViewerMode;
	private _selectedSlide:SlideView;

	private doubleClickLock:boolean;
	private doubleClickTimer:NodeJS.Timer;

	private newSlideBtn:any;


	constructor(public obj:any) {
		super();

		this.obj.addClass("slideList");
		this.obj.sortable({
			items:".slide",
            revert:200,
			scroll:false,
			distance:10,
			cursor:"move",
			tolerance:"pointer",
			helper:"clone",
			forcePlaceholderSize:true,
			forceHelperSize:true,
			 update:()=>{
				this.onSlideSort();
            }
		});

		this._slides = [];
		this._slidesById = {};

 		var dropHelper = new DropHelper(this);
		dropHelper.addEventListener(DropHelper.EVENT_DROP_COMPLETE, (e:CustomEvent)=>{
			var slideObj = $('<div />');
			var slide = new ThumbSlide(slideObj);
			//slide.updateSize();
			this.addSlide(slide);

			var layer = slide.addLayer(new Image(e.detail));
			if(layer.originHeight > (layer.originWidth * 1.2)) {
				layer.rotation -= 90;
			}
			slide.fitLayer(layer);
		}); 

		$(window).resize(()=>{
			setTimeout(()=>{
				$.each(this._slides, (index:number, slide:SlideView) =>{
					var bool:boolean = slide.selected;
					slide.selected = false;
					slide.fitToHeight();
					slide.updateSize();
					slide.selected = bool;
				})
			},50);

		});

/*  		this.obj.on("mousedown",(e)=>{
			if(this._mode == ViewerMode.SELECT) this.selectSlide();
		}); */

		this.newSlideBtn = $('<div class="newSlideBtn"><i class="fas fa-plus"></i></div>').appendTo(this.obj);
		this.newSlideBtn.click(()=>{
			this.selectSlide(this.addSlide(new ThumbSlide($('<div/>'))));
		});
	}

 	setMode(mode:ViewerMode):void {
		this._mode = mode;
		switch(mode){
			case ViewerMode.SELECT:
				$.each(this.slides, (index:number, slide:SlideView)=>{
					slide.fitToHeight();
				});
				//this.obj.sortable("refresh");
				//this.obj.sortable("enable");
			break;
			case ViewerMode.EDIT:
				$.each(this.slides, (index:number, slide:SlideView)=>{
					slide.fitToHeight();
				});
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
		while(this.slides.length > 0){
			this.removeSlide(this.slides[0]);
		}
	}


	addSlide(slide:SlideView,index:number = -1):SlideView {
		console.log("addSlide called : " + this._slides.length);

		if(index != -1 && index < this._slides.length){
			this._slides.splice(index,0,slide);
//			this._slides[index].obj.after(slide.obj);
		}else{
			this._slides.push(slide);
		}

		slide.id = Math.floor(Math.random()*100000000);
/*		$.each(this._slides, (i, slide2:Slide)=>{
			console.log(slide2, slide2.id);
		});*/
		this._slidesById[slide.id] = slide;

		this.sortSlideObjByIndex();
		this.setSlideUp(slide);

		return slide;
	}

	private setSlideUp(slide:SlideView) {
		//slide.obj.appendTo(this.obj);

		slide.fitToHeight();

		var deleteBtn = $('<button class="delete"><i class="fas fa-times"></i></button>').appendTo(slide.obj);
		deleteBtn.click(()=>{
			//if(window.confirm('Are you sure?')){
				this.removeSlide(slide,true);
			//}
			return false;
		});
		var cloneBtn = $('<button class="clone"><i class="fas fa-plus"></i></button>').appendTo(slide.obj);
		cloneBtn.click(()=>{
			this.clonseSlide(slide);
			return false;
		});
		var editBtn = $('<button class="edit"><i class="fas fa-edit"></i></button>').appendTo(slide.obj);
		editBtn.click(()=>{
			this.dispatchEvent(new Event("edit"));
			return false;
		});
		
		var durationDiv = $('<div class="duration"><button class="down">-</button><span>x1</span><button class="up">+</button></div>').appendTo(slide.obj);
		durationDiv.find("button.up").click((e:any)=>{
			this.lockDoubleClick();
			if(slide.durationRatio < 9){
				if(slide.durationRatio >= 2){
					slide.durationRatio += 1;
				}else if(slide.durationRatio >= 1){
					slide.durationRatio += 0.5;
				}else{
					slide.durationRatio += 0.2;
				}
/* 				setTimeout(()=>{
					this.scrollToSelected();
				},200); */
				this.updateSlideDuration(slide);
			};
		});
		durationDiv.find("button.down").click((e:any)=>{
			this.lockDoubleClick();
			if(slide.durationRatio > 0.2){
				if(slide.durationRatio > 2){
					slide.durationRatio -= 1;
				}else if(slide.durationRatio > 1){
					slide.durationRatio -= 0.5;
				}else{
					slide.durationRatio -= 0.2;
				}
/* 				setTimeout(()=>{
					this.scrollToSelected();
				},200); */
				this.updateSlideDuration(slide);
			};
		});
		this.updateSlideDuration(slide);

		var joinArrow = $('<div class="joinArrow"></div>').appendTo(slide.obj);
		//var joinArrow = $('<div class="joinArrow"><i class="fas fa-arrow-right"></i></div>').appendTo(slide.obj);
		joinArrow.on("click.slide", (e:any)=>{
			slide.joining = !slide.joining;
			e.preventDefault();
			e.stopImmediatePropagation();
		});

		var enableCheck = $('<input class="enableCheck" type="checkbox" checked="checked" />').appendTo(slide.obj);
		enableCheck.on("click.slide", (e:any)=>{
			slide.disabled = !enableCheck.prop("checked");
			e.stopImmediatePropagation();
		});
		enableCheck.prop("checked", !slide.disabled);

		//

		slide.obj.on("mousedown.slide",(e:any)=>{
			//e.stopPropagation();
		});
  		slide.obj.on("click.slide", ()=>{
			this.selectSlide(slide);
		});
		slide.obj.on("dblclick.slide", ()=>{
			if(this.doubleClickLock) return;
			this.dispatchEvent(new Event("edit"));
			return false;
		});
		slide.obj.hide().fadeIn(300, () => {
		});
	}

	clonseSlide(slide:SlideView):SlideView {
		if(this._slides.indexOf(slide) == -1) return;

		var clonedSlide:SlideView = slide.clone();
		this.addSlide(clonedSlide, this._slides.indexOf(slide) + 1);
		slide.joining = true;

		setTimeout(()=>{
			this.selectSlide(clonedSlide);
		},50)

		return clonedSlide;
	}

	removeSlide(slide:SlideView, isAnimation:boolean = false):SlideView{
		var index:number = this._slides.indexOf(slide);
		if(index == -1) return;

		var nextSlide:SlideView = null;
		if(slide.selected){
			if(index < this._slides.length - 1) {
				nextSlide = this._slides[index + 1];
			}else if(index > 0){
				nextSlide = this._slides[index - 1];
			}
		}
		var removeMain = ()=>{
			this._slides.splice(index, 1);
			this._slidesById[slide.id] = undefined;
			slide.removeAllLayers();
			slide.obj.find("button").remove();
			slide.obj.find("div.duration").remove();
			slide.obj.find("div.joinArrow").remove();
			slide.obj.off("click.slide");
			slide.obj.off("dblclick.slide");
			slide.obj.off("mousedown.slide");
			slide.obj.remove();
			slide = null;
		}

		if(isAnimation){
			this.obj.css("pointer-events","none");
			slide.obj.fadeOut(200, () => {
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

	//

	private selectSlide(slide:SlideView = null){
		this._selectedSlide = undefined;
		$.each(this._slides, (index:number, slide2:SlideView) => {
			slide2.obj.off("click.slide");

			if(slide2 == slide){
				slide2.selected = true;
				this._selectedSlide = slide2;

			}else{
				slide2.selected = false;
				slide2.obj.on("click.slide", ()=>{
					this.selectSlide(slide2);
				}); 
			}
		})
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
				this.obj.animate({"scrollLeft":this._selectedSlide.obj.position().left + this.obj.scrollLeft() - this.obj.width() / 2 + this._selectedSlide.obj.width() / 2});
			break;
		}
	}

	private updateSlideDuration(slide:SlideView){
		var durationStr = "";
		if(slide.durationRatio != 1){
			durationStr = "x" + slide.durationRatio.toString().substr(0,3);
		}
		slide.obj.find(".duration > span").text(durationStr);
	}

	private lockDoubleClick(){
		if(this.doubleClickTimer) clearTimeout(this.doubleClickTimer);
		this.doubleClickLock = true;
		this.doubleClickTimer = setTimeout(()=>{
			this.doubleClickLock = false;
		},100);
	}

	private sortSlideObjByIndex(){
		if(this._slides.length == 0) return;

		$.each(this._slides, (i:number, slide:SlideView) => {
			this.obj.append(slide.obj);
			slide.obj.removeClass("last");
		});
		this._slides[this._slides.length - 1].obj.addClass("last");
		this.obj.append(this.newSlideBtn);
		this.obj.sortable("refresh");
	}

	//

	private onSlideSort() {
		this.obj.find(".slide").each((i:number, obj:any)=>{
			this._slides[i] = this._slidesById[$(obj).data("id")];
		});

		this.sortSlideObjByIndex();
	}

	//

	get selectedSlide():SlideView {
		return this._selectedSlide;
	}

	get isActive():boolean {
		return true;
	}

	public set slides(value:SlideView[]) {
		console.log("set slides at slidelist");
		console.log(value);
		this.initialize();

		console.log(value);
		$.each(value, (number, slide:SlideView)=>{
			this.addSlide(slide);
		});

		//Slide追加処理の後、slidesアレイ参照自体を置き換える
		console.log(value);
		this._slides = value;
		console.log(this._slides);
	}
	public get slides():SlideView[] { return this._slides; }

	get selectedSlideIndex():number{
		if(this._selectedSlide == null){
			return -1;
		}else{
			return this._slides.indexOf(this._selectedSlide);
		}
	}
}