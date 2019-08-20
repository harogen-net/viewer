import { CanvasSlideView } from "./CanvasSlideView";
import { Slide } from "../__core__/model/Slide";
import { PropertyEvent } from "../events/PropertyEvent";
import { PropFlags } from "../__core__/model/PropFlags";

declare var $:any;

export class ThumbSlideView extends CanvasSlideView {

	private doubleClickLock:boolean;
	private doubleClickTimer;

	constructor(protected _slide:Slide, public obj:any, protected scale:number){
		super(_slide, obj, scale);

//		this._slide.addEventListener("update", this.onSlideUpdate);
//		this._slide.addEventListener(PropertyEvent.UPDATE, this.onSlideUpdate);

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
		});
		this.obj.on("dblclick.slide", ()=>{
			if(this.doubleClickLock) return;
			this.dispatchEvent(new CustomEvent("edit", {detail:this._slide}));
			return false;
		});

		//

		this.updateView(PropFlags.S_JOIN|PropFlags.S_DISABLED|PropFlags.S_DURATION);
	}

	public fitToHeight():void {
		var durationCorrection:number = Math.atan(this._slide.durationRatio - 1) * 0.5 + 1;

		if(this._slide.durationRatio < 1){
			durationCorrection = Math.pow(this._slide.durationRatio,0.4);
		}
		var fitWidth = Math.round(this.scale * this._slide.width * durationCorrection);
		{
			this.obj.stop();
			if(this.obj.attr("style") && this.obj.attr("style").indexOf("width") != -1){
				this.obj.animate({"width":fitWidth},{duration :200});
			}else{
				//this.obj.width(fitWidth);
				this.obj.css({"width":fitWidth});
			}
		}
	}

	public show(){
		// show immidiately
		// this.obj.hide().fadeIn(300, () => {
		// });
	}

	public destroy() {
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
	protected updateView(flag:number = PropFlags.ALL){
		super.updateView(flag);

		if(flag & PropFlags.S_DISABLED){
			if(this._slide.disabled){
				this.obj.addClass("disabled");
			}else{
				this.obj.removeClass("disabled");
			}
		}
		if(flag & PropFlags.S_JOIN){
			if(this._slide.joining){
				this.obj.addClass("joining");
			}else{
				this.obj.removeClass("joining");
			}
		}
		if(flag & PropFlags.S_DURATION){
			var durationStr = "";
			if(this._slide.durationRatio != 1){
				durationStr = "x" + this._slide.durationRatio.toString().substr(0,3);
			}
			this.obj.find(".duration > span").text(durationStr);
	
			if(this.obj.height() > 0){
				this.fitToHeight();
			}
		}
	}
	
	private lockDoubleClick(){
		if(this.doubleClickTimer) clearTimeout(this.doubleClickTimer);
		this.doubleClickLock = true;
		this.doubleClickTimer = setTimeout(()=>{
			this.doubleClickLock = false;
		},100);
	}

	// protected replaceSlide(newSlide:Slide) {
	// 	this._slide.removeEventListener(PropertyEvent.UPDATE, this.onSlideUpdate);
	// 	// this._slide.removeEventListener("update", this.onSlideUpdate);
	// 	super.replaceSlide(newSlide);
	// 	this._slide.addEventListener(PropertyEvent.UPDATE, this.onSlideUpdate);
	// 	// this._slide.addEventListener("update", this.onSlideUpdate);
	// 	this.updateView();
	// }
}