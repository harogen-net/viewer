import {Slide} from "./__core__/Slide";
import {SlideEditable} from "./__core__/SlideEditable";
import {SlideList} from "./SlideList";
import {Image} from "./__core__/Image";
import { SlideStorage } from "./utils/SlideStorage";
import { SlideShow } from "./SlideShow";
import { Menu } from "./Menu";
import { SlideCanvas } from "./SlideCanvas";
import { ImageManager } from "./utils/ImageManager";


declare var $:any;

export class Viewer {
	
	public static enforceAspectRatio = true;
	public static readonly MODE_SELECT = "mode_select";
	public static readonly MODE_EDIT = "mode_edit";
	public static readonly MODE_SLIDESHOW = "mode_slideshow";

//	public static readonly SCREEN_WIDTH = 1366;
//	public static readonly SCREEN_HEIGHT = 768;
	public static readonly SCREEN_WIDTH = window.screen.width;
	public static readonly SCREEN_HEIGHT = window.screen.height;

	private canvas:SlideCanvas;
	private list:SlideList;
	private slideShow:SlideShow;
	private storage:SlideStorage;
	private menu:Menu;

	private _mode:string;


    constructor(public obj:any){
		if(localStorage.duration == undefined) localStorage.duration = 2000;
		if(localStorage.interval == undefined) localStorage.interval = 5000;
		$("#bgColor").val("#666666");

		ImageManager.initialize();

		$(document).on("drop dragover", (e:any) => {
			e.preventDefault();
			e.stopImmediatePropagation();
		});
		document.addEventListener("webkitfullscreenchange",()=>{
			if(document.webkitFullscreenElement){
				obj.addClass("slideShow");
			}else{
				obj.removeClass("slideShow");
			}
		});

		//
		this.list = new SlideList(obj.find(".list"));
		this.canvas = new SlideCanvas(obj.find(".canvas"));
		this.slideShow = new SlideShow($("<div />").appendTo(obj));

		this.storage = new SlideStorage();
		this.storage.addEventListener("loaded", (e:any)=>{
			this.list.initialize();
			this.canvas.initialize();
			this.setMode(Viewer.MODE_SELECT);
			$.each(this.storage.slides, (i:number, slide:Slide)=>{
				this.list.addSlide(slide);
			});
		});
		//


		this.list.addEventListener("select", ()=>{
			if(this._mode == Viewer.MODE_SELECT){


			}else if(this._mode == Viewer.MODE_EDIT){
				if(this.list.selectedSlide){
					this.canvas.slide.isActive = true;
					this.list.selectedSlide.isLock = true;
					this.canvas.slide.setData(this.list.selectedSlide.getData());
					this.list.selectedSlide.isLock = false;
				}else{
					this.canvas.initialize();
				}
			}
			//console.log("slide selected at list");
		})
		this.list.addEventListener("edit", ()=>{
			this.setMode(Viewer.MODE_EDIT);
			if(this.list.selectedSlide){
				this.list.selectedSlide.isLock = true;
				this.canvas.slide.setData(this.list.selectedSlide.getData());
				this.list.selectedSlide.isLock = false;
			}
		});

		this.canvas.slide.addEventListener("update",()=>{
			if(this._mode == Viewer.MODE_EDIT){
				if(this.list.selectedSlide){
					this.list.selectedSlide.setData(this.canvas.slide.getData());
				}
			}
		});
		this.canvas.addEventListener("close",()=>{
			this.setMode(Viewer.MODE_SELECT);
		});

		//

		//IO section
		{
			$("label[for='cb_ignore']").hide();

			$(".startSlideShow").click(() => {
				if(this.list.slides.length < 1) return;
				this.slideShow.setUp(this.list.slides);
				var startIndex:number = (this.list.selectedSlideIndex != -1) ? this.list.selectedSlideIndex : 0;
				this.slideShow.run(startIndex);
			});
			$("#cb_mirrorH").click(()=>{
				this.slideShow.mirrorH = $("#cb_mirrorH").prop("checked");
			});
			$("#cb_mirrorV").click(()=>{
				this.slideShow.mirrorV = $("#cb_mirrorV").prop("checked");
			});

						
			$(".new").click(()=>{
				if(this.list.slides.length == 0) return;
				if($("#cb_ignore").prop("checked") || window.confirm('clear slides and new document. Are you sure?')){
					this.list.initialize();
					this.canvas.initialize();
					ImageManager.initialize();
					this.setMode(Viewer.MODE_SELECT);
				}
			});

		
			$(".save").click(()=>{
				if(this.list.slides.length > 0){
					this.storage.save(this.list.slides);
				}
			});
			$(".dispose").click(()=>{
				if($('select.filename').val() == -1) return;
				if($("#cb_ignore").prop("checked") || window.confirm('delete selected save data. Are you sure?')){
					this.storage.delete();
				}
			});
			$(".load").click(()=>{
				if($('select.filename').val() == -1) return;
				if(this.list.slides.length == 0 || $("#cb_ignore").prop("checked") || window.confirm('load slides. Are you sure?')){
					this.storage.load();
				}
			});
			
			$(".export").click(()=>{
				if(this.list.slides.length > 0 ){
					this.storage.export(this.list.slides);
				}
			});
			$("button.import").click(()=>{
				if(this.list.slides.length == 0 || $("#cb_ignore").prop("checked") || window.confirm('load slides. Are you sure?')){
					$("input.import")[0].click();
				}
			});
			$("input.import").change((e)=>{
				if(e.target.files[0]) {
					this.storage.import(e.target.files[0]);
					$("input.import").val("");
				}
			});


			let selectInit = (obj:any,value:number)=>{
				obj.find('option[value=' + value +']').prop("selected",true);
			};
			selectInit($("#duration"),localStorage.duration);
			$("#duration").change((any)=>{
				localStorage.duration = $("#duration").val();
			});
			selectInit($("#interval"),localStorage.interval);
			$("#interval").change((any)=>{
				localStorage.interval = $("#interval").val();
			});
		}

	
		

		
		this.setMode(Viewer.MODE_SELECT);
	}


	public setMode(mode:string){
		if(mode == this._mode) return;
		this._mode = mode;

		switch(this._mode){
			case Viewer.MODE_SELECT:
				this.obj.addClass("select");
				this.obj.removeClass("edit");
				this.canvas.slide.isActive = false;
			break;
			case Viewer.MODE_EDIT:
				this.obj.removeClass("select");
				this.obj.addClass("edit");
				this.canvas.slide.isActive = true;
			break;
/*			case Viewer.MODE_SLIDESHOW:
			break;*/
		}
		this.list.setMode(this._mode);
		this.canvas.setMode(this._mode);
	}
}