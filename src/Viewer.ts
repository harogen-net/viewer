import {SlideView} from "./__core__/view/SlideView";
import {SlideList} from "./SlideList";
import {ImageLayer} from "./__core__/model/ImageLayer";
import { SlideStorage, HVDataType } from "./utils/SlideStorage";
import { SlideShow } from "./SlideShow";
import { Menu } from "./Menu";
import { SlideEdit } from "./SlideEdit";
import { ImageManager } from "./utils/ImageManager";
import { VDoc } from "./__core__/model/VDoc";
import { SlideToPNGConverter } from "./utils/SlideToPNGConverter";
import { DataUtil } from "./utils/DataUtil";
import { Layer, LayerType } from "./__core__/model/Layer";
import { Slide } from "./__core__/model/Slide";
import { HistoryManager } from "./utils/HistoryManager";

declare var $:any;

export enum ViewerMode {
	SELECT,
	EDIT,
	SLIDESHOW
}
export enum ViewerStartUpMode {
	VIEW_AND_EDIT,
	VIEW_ONLY
}

export class Viewer {
	
	public static enforceAspectRatio = true;
	public static startUpMode:ViewerStartUpMode = ViewerStartUpMode.VIEW_AND_EDIT;

	//スライドのサイズ基本値として必要
	public static readonly SCREEN_WIDTH = Math.max(window.screen.width, window.screen.height);
	public static readonly SCREEN_HEIGHT = Math.min(window.screen.width, window.screen.height);

	private edit:SlideEdit;
	private list:SlideList;
	private slideShow:SlideShow;
	private storage:SlideStorage;
	private menu:Menu;

	private _mode:ViewerMode;

	private document:VDoc;


    constructor(public obj:any, startUpMode:ViewerStartUpMode){
//		if(localStorage.duration == undefined) localStorage.duration = 2000;
//		if(localStorage.interval == undefined) localStorage.interval = 5000;

		ImageManager.init($('#images > .container'));
		Viewer.startUpMode = startUpMode;

		if(startUpMode == ViewerStartUpMode.VIEW_AND_EDIT){
			$(document).on("drop dragover", (e:any) => {
				e.preventDefault();
				e.stopImmediatePropagation();
			});
		}
		document.addEventListener("webkitfullscreenchange",()=>{
			if(document["webkitFullscreenElement"]){
				obj.addClass("slideShow");
			}else{
				obj.removeClass("slideShow");
			}
		});

		//
		this.list = new SlideList(obj.find(".list"));
		this.slideShow = new SlideShow($("<div />").appendTo(obj));

		this.storage = new SlideStorage();
		this.storage.addEventListener("update", (e:CustomEvent)=>{
			//window.alert();
			var index = $("select.filename").prop("selectedIndex");
			var newItem = $("select.filename option")[0];
			$("select.filename").empty();
			$("select.filename").append($(newItem));

			this.storage.titles.forEach(datum=>{
				$("select.filename").append('<option value="' + datum.id + '">' + datum.title + '</option>');
			});
			if(index <= this.storage.titles.length){
				$("select.filename").prop("selectedIndex", index);
			}else{
				$("select.filename").prop("selectedIndex", this.storage.titles.length);
			}
		});
		this.storage.addEventListener("loaded", (e:CustomEvent)=>{
			this.newDocument(e.detail as VDoc);
		});
		//


		if(startUpMode == ViewerStartUpMode.VIEW_AND_EDIT){

			this.edit = new SlideEdit(obj.find(".canvas"));

			this.list.addEventListener("select", ()=>{
				if(this._mode == ViewerMode.SELECT){
				}else if(this._mode == ViewerMode.EDIT){
					if(this.list.selectedSlide){
						this.edit.setSlide(this.list.selectedSlide);
					}else{
						this.edit.initialize();
					}
				}
			})
			this.list.addEventListener("edit", ()=>{
				if(this.list.selectedSlide){
					this.setMode(ViewerMode.EDIT);
					setTimeout(()=>{
						this.edit.setSlide(this.list.selectedSlide);
					}, 301);
					
				}
			});
	
			this.edit.addEventListener("close",()=>{
				this.setMode(ViewerMode.SELECT);
			});
			this.list.addEventListener("close",()=>{
				this.setMode(ViewerMode.SELECT);
			});

			this.edit.addEventListener("download", ()=>{
				var canvas:HTMLCanvasElement = new SlideToPNGConverter().slide2canvas(this.edit.slideView.slide, this.edit.slideView.slide.width, this.edit.slideView.slide.height, 1, this.document.bgColor);
				DataUtil.downloadBlob(DataUtil.dataURItoBlob(canvas.toDataURL()),this.document.title + "_" + (this.list.selectedSlideIndex + 1) + ".png");
			});
		}


		//

		//IO section
		{
			if(startUpMode == ViewerStartUpMode.VIEW_AND_EDIT){
				$("#pref > button").click(()=>{
					$("#pref > .menu").toggle();
				});
				$("#images > button").click(()=>{
					$("#images > .container").toggle();
				});
				$(".new").click(()=>{
					if(this.document.slides.length == 0) return;
					//if($("#cb_ignore").prop("checked") || window.confirm('clear slides and new document. Are you sure?')){
					if(window.confirm('clear slides and new document. Are you sure?')){
						this.newDocument();
					}
				});
				$(".dispose").dblclick(()=>{
					if($('select.filename').val() == -1) return;
					if($("#cb_ignore").prop("checked") || window.confirm('delete selected save data. Are you sure?')){
						this.storage.delete($('select.filename').val());
					}
				});

				$(".export").click(()=>{
					if(this.list.slides.length > 0 ){
						var type:HVDataType;
						if($("#saveFormat_png").prop("checked")) type = HVDataType.PNG;
						if($("#saveFormat_hvz").prop("checked")) type = HVDataType.HVZ;
						if($("#saveFormat_hvd").prop("checked")) type = HVDataType.HVD;
	
						this.storage.export(this.document, type, {
							pages:(this.list.selectedSlideIndex != -1) ? [this.list.selectedSlideIndex] : undefined
						});
					}
				});
	
			}else{
				$(".dispose").click(()=>{
					if($('select.filename').val() == -1) return;
					if(window.confirm('delete selected save data. Are you sure?')){
						this.storage.delete($('select.filename').val());
					}
				});
				$("label[for='cb_fullscreen']").hide();
			}

			$("label[for='cb_ignore']").hide();

			$(".startSlideShow").click(() => {
				var slides:Slide[] = [];
				var startIndex:number = 0;
				for(var i:number = 0; i < this.document.slides.length; i++){
					var slide:Slide = this.document.slides[i];
					if(slide.disabled) continue;
					slides.push(slide.clone());
					if(i == this.list.selectedSlideIndex) startIndex = slides.length - 1;
				}
				if(slides.length == 0) return;
				this.slideShow.setUp(slides);
				this.slideShow.run(startIndex);
			});
			$("#cb_mirrorH").click(()=>{
				this.slideShow.mirrorH = $("#cb_mirrorH").prop("checked");
			});
			$("#cb_mirrorV").click(()=>{
				this.slideShow.mirrorV = $("#cb_mirrorV").prop("checked");
			});

						

			$(".fileSelect.up").click(()=>{
				var val = $('select.filename').val();
				var prevOp = $('select.filename option[value="' + val + '"]').prev();
				if(prevOp.length == 0) return;
				$('select.filename').val(prevOp.attr("value"));
				this.storage.load(prevOp.attr("value"));
			});
			$(".fileSelect.down").click(()=>{
				var val = $('select.filename').val();
				var nextOp = $('select.filename option[value="' + val + '"]').next();
				if(nextOp.length == 0) return;
				$('select.filename').val(nextOp.attr("value"));
				this.storage.load(nextOp.attr("value"));
			});
		
			$(".save").click(()=>{
				if(this.list.slides.length > 0){
					this.storage.save(this.document);
				}
			});
			$(".load").click(()=>{
				if($('select.filename').val() == -1) return;
				if(this.list.slides.length == 0 || $("#cb_ignore").prop("checked") || window.confirm('load slides. Are you sure?')){
					this.storage.load($('select.filename').val());
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


			// let selectInit = (obj:any,value:number)=>{
			// 	obj.find('option[value=' + value +']').prop("selected",true);
			// };
			// //selectInit($("#duration"),localStorage.duration);
			// $("#duration").change((any)=>{
			// 	//localStorage.duration = $("#duration").val();
			// });
			// //selectInit($("#interval"),localStorage.interval);
			// $("#interval").change((any)=>{
			// 	//localStorage.interval = $("#interval").val();
			// });

			$("#bgColor").change((e)=>{
				this.document.bgColor = $("#bgColor").val();
			});


		}

		//

		window.addEventListener('beforeunload', function(e){
			e.returnValue = "ページを離れます。よろしいですか？";
		},false);

		this.newDocument();
	}

	private newDocument(doc?:VDoc){
		 if(this.document){
			this.document = null;

			this.list.initialize();
			if(Viewer.startUpMode == ViewerStartUpMode.VIEW_AND_EDIT) {
				this.edit.initialize();
				HistoryManager.shared.initialize();
			}
		}

		this.setMode(ViewerMode.SELECT);
		if(!doc){
			ImageManager.shared.deleteAllImageData();
		}

		//

		this.document = doc || new VDoc();
		this.list.slides = this.document.slides;
	}

	public setMode(mode:ViewerMode){
		if(mode == this._mode) return;
		this._mode = mode;

		switch(this._mode){
			case ViewerMode.SELECT:
				this.obj.addClass("select");
				this.obj.removeClass("edit");
				if(Viewer.startUpMode == ViewerStartUpMode.VIEW_AND_EDIT) {
					this.edit.slideView.isActive = false;
				}
			break;
			case ViewerMode.EDIT:
				this.obj.removeClass("select");
				this.obj.addClass("edit");
				if(Viewer.startUpMode == ViewerStartUpMode.VIEW_AND_EDIT) {
					this.edit.slideView.isActive = true;
				}
			break;
/*			case ViewerMode.SLIDESHOW:
			break;*/
		}
		this.list.setMode(this._mode);
		if(Viewer.startUpMode == ViewerStartUpMode.VIEW_AND_EDIT) {
			this.edit.setMode(this._mode);
		}
	}
}