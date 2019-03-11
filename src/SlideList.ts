import { Slide } from "./__core__/Slide";
import {Image} from "./__core__/layer/Image";
import { EventDispatcher } from "./events/EventDispatcher";
import { DropHelper } from "./utils/DropHelper";
import { IDroppable } from "./interface/IDroppable";
import { Viewer, ViewerMode } from "./Viewer";
import { join } from "path";

declare var $: any;

export class SlideList extends EventDispatcher implements IDroppable {

	private _slides:Slide[];
	private _slidesById:any;
	private _mode:ViewerMode;
	private _selectedSlide:Slide;

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
			 update:()=>{
				this.onSlideSort();
            }
		});

		this._slides = [];
		this._slidesById = {};

 		var dropHelper = new DropHelper(this);
		dropHelper.addEventListener(DropHelper.EVENT_DROP_COMPLETE, (e:CustomEvent)=>{
			var slideObj = $('<div />');
			var slide = new Slide(slideObj);
			//slide.updateSize();
			this.addSlide(slide);
			slide.addLayer(new Image(e.detail));
		}); 

		$(window).resize(()=>{
			setTimeout(()=>{
				$.each(this._slides, (index:number, slide:Slide) =>{
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

		/*var test = this.obj.append('<div />');
		test.addClass("slide");
		test.css({
			"width":Viewer.SCREEN_WIDTH,
			"height":Viewer.SCREEN_HEIGHT,
			"background-color":"red"
		});*/
	}

 	setMode(mode:ViewerMode):void {
		this._mode = mode;
		switch(mode){
			case ViewerMode.SELECT:
				$.each(this.slides, (index:number, slide:Slide)=>{
					slide.fitToHeight();
				});
				//this.obj.sortable("refresh");
				//this.obj.sortable("enable");
			break;
			case ViewerMode.EDIT:
				$.each(this.slides, (index:number, slide:Slide)=>{
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


	addSlide(slide:Slide,index:number = -1):Slide {
		this.appendSlide(slide);

		if(index != -1 && this._slides.length > index){
			this._slides.splice(index + 1,0,slide);
			$.each(this._slides, (index:number, slide2:Slide) => {
				this.obj.append(slide2);
			});
			this._slides[index].obj.after(slide.obj);
		}else{
			this._slides.push(slide);
		}

		return slide;
	}

	private appendSlide(slide:Slide) {
		slide.obj.appendTo(this.obj);

		slide.id = Math.floor(Math.random()*100000000);
		this._slidesById[slide.id] = slide;

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
		
		var durationDiv = $('<div class="duration"><span>x2</span><button class="down">-</button><button class="up">+</button></div>').appendTo(slide.obj);
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

		var joinArrow = $('<div class="joinArrow" />').appendTo(slide.obj);
		joinArrow.on("click.slide", ()=>{
			slide.joining = !slide.joining;
		});

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

		this.obj.sortable("refresh");
	}

	clonseSlide(slide:Slide):Slide {
		if(this._slides.indexOf(slide) == -1) return;
		var clonedSlide:Slide = slide.clone();
		this.addSlide(clonedSlide, this._slides.indexOf(slide));
		slide.joining = true;

		setTimeout(()=>{
			this.selectSlide(clonedSlide);
		},50)

		return clonedSlide;
	}

	removeSlide(slide:Slide, isAnimation:boolean = false):Slide{
		var index:number = this._slides.indexOf(slide);
		if(index == -1) return;

		var nextSlide:Slide = null;
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
		}

		if(isAnimation){
			this.obj.css("pointer-events","none");
			slide.obj.fadeOut(300, () => {
				this.obj.css("pointer-events","");
				removeMain();
				this.selectSlide(nextSlide);
			});
		}else{
			removeMain();
			this.selectSlide(nextSlide);
		}

		return slide;
	}

	//

	private selectSlide(slide:Slide = null){
		this._selectedSlide = undefined;
		$.each(this._slides, (index:number, slide2:Slide) => {
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

	private updateSlideDuration(slide:Slide){
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


	//

	private onSlideSort() {
		this.obj.find(".slide").each((i:number, obj:any)=>{
			this._slides[i] = this._slidesById[$(obj).data("id")];
		});
	}

	//

	get selectedSlide():Slide {
		return this._selectedSlide;
	}

	get isActive():boolean {
		return true;
	}

	public set slides(value:Slide[]) {
		this.initialize();
		this._slides  = value;
		$.each(this._slides, (number, slide:Slide)=>{
			this.appendSlide(slide);
		});
	}
	public get slides():Slide[] { return this._slides; }

	get selectedSlideIndex():number{
		if(this._selectedSlide == null){
			return -1;
		}else{
			return this._slides.indexOf(this._selectedSlide);
		}
	}
}