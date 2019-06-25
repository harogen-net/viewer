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

declare var $:any;

export enum ViewerMode {
	SELECT,
	EDIT,
	SLIDESHOW
}

export class Viewer {
	
	public static enforceAspectRatio = true;

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


    constructor(public obj:any){
//		if(localStorage.duration == undefined) localStorage.duration = 2000;
//		if(localStorage.interval == undefined) localStorage.interval = 5000;

		ImageManager.init($('#images > .container'));

		$(document).on("drop dragover", (e:any) => {
			e.preventDefault();
			e.stopImmediatePropagation();
		});
		document.addEventListener("webkitfullscreenchange",()=>{
			if(document["webkitFullscreenElement"]){
				obj.addClass("slideShow");
			}else{
				obj.removeClass("slideShow");
			}
		});

		//
		this.list = new SlideList(obj.find(".list"));
		this.edit = new SlideEdit(obj.find(".canvas"));
		this.slideShow = new SlideShow($("<div />").appendTo(obj));

		this.storage = new SlideStorage();
		this.storage.addEventListener("loaded", (e:CustomEvent)=>{
			this.newDocument(e.detail as VDoc);
		});
		//


		this.list.addEventListener("select", ()=>{
			if(this._mode == ViewerMode.SELECT){
			}else if(this._mode == ViewerMode.EDIT){
				if(this.list.selectedSlide){
//					this.edit.slideView.isActive = true;
					this.edit.setSlide(this.list.selectedSlide);
				}else{
					this.edit.initialize();
				}
			}
		})
		this.list.addEventListener("edit", ()=>{
			if(this.list.selectedSlide){
				this.edit.setSlide(this.list.selectedSlide);
				this.setMode(ViewerMode.EDIT);
			}
		});

		// this.edit.slideView.addEventListener("sharedPaste",(ce:CustomEvent)=>{
		// 	if(this._mode == ViewerMode.EDIT){
		// 		if(this.list.selectedSlide){
		// 			var targetLayer:Layer = ce.detail.layer as Layer;
		// 			console.log("sharedPaste : " + targetLayer);
		// 			if(!targetLayer) return;

		// 			var i:number = this.list.selectedSlideIndex;
		// 			var found:boolean = false;
		// 			var slide:Slide = null;
		// 			var findFunc = (j:number, layer:Layer)=>{
		// 				if(found) return;

		// 				if(targetLayer.type != layer.type) return;
		// 				switch(targetLayer.type){
		// 					case LayerType.IMAGE:
		// 						if((layer as ImageLayer).imageId == (targetLayer as ImageLayer).imageId) {
		// 							found = true;
		// 							return;
		// 						}
		// 					break;
		// 					default:
		// 						if(layer.id == targetLayer.id) {
		// 							found = true;
		// 							return;
		// 						};
		// 					break;
		// 				}
		// 			}
		// 			while(--i >= 0){
		// 				found = false;
		// 				slide = this.list.slides[i];
		// 				$.each(slide.layers, findFunc);
		// 				if(found) {
		// 					break;
		// 				}else{
		// 					slide.addLayer(targetLayer.clone());
		// 				}
		// 			}
		// 			i = this.list.selectedSlideIndex;
		// 			while(++i < this.list.slides.length){
		// 				found = false;
		// 				slide = this.list.slides[i];
		// 				$.each(slide.layers, findFunc);
		// 				if(found) {
		// 					break;
		// 				}else{
		// 					slide.addLayer(targetLayer.clone());
		// 				}
		// 			}
		// 		}
		// 	}
		// });

		this.edit.addEventListener("close",()=>{
			this.setMode(ViewerMode.SELECT);
		});
		this.list.addEventListener("close",()=>{
			this.setMode(ViewerMode.SELECT);
		});

		this.edit.addEventListener("download", ()=>{
			var canvas:HTMLCanvasElement = new SlideToPNGConverter().slide2canvas(this.edit.slideView.slide, Viewer.SCREEN_WIDTH, Viewer.SCREEN_HEIGHT, 1, this.document.bgColor);
			DataUtil.downloadBlob(DataUtil.dataURItoBlob(canvas.toDataURL()),this.document.title + "_" + (this.list.selectedSlideIndex + 1) + ".png");
		});

		//

		//IO section
		{
			$("#pref > button").click(()=>{
				$("#pref > .menu").toggle();
			});
			$("#images > button").click(()=>{
				$("#images > .container").toggle();
			});
			$("label[for='cb_ignore']").hide();

			$(".startSlideShow").click(() => {
				if(this.list.slides.length < 1) return;
				this.slideShow.setUp(this.list.slides);

				var startIndex:number = 0;
				if(this.list.selectedSlideIndex != -1){
					for(var i:number = 0; i < this.list.slides.length; i++){
						if(i == this.list.selectedSlideIndex) break;
						var slide = this.list.slides[i];
						if(!slide.disabled) startIndex++;
					}
				}

				this.slideShow.run(startIndex);
			});
			$("#cb_mirrorH").click(()=>{
				this.slideShow.mirrorH = $("#cb_mirrorH").prop("checked");
			});
			$("#cb_mirrorV").click(()=>{
				this.slideShow.mirrorV = $("#cb_mirrorV").prop("checked");
			});

						
			$(".new").click(()=>{
				if(this.document.slides.length == 0) return;
				//if($("#cb_ignore").prop("checked") || window.confirm('clear slides and new document. Are you sure?')){
				if(window.confirm('clear slides and new document. Are you sure?')){
					this.newDocument();
				}
			});

			$(".fileSelect.up").click(()=>{
				var val = $('select.filename').val();
				var prevOp = $('select.filename option[value="' + val + '"]').prev();
				if(prevOp.length == 0) return;
				$('select.filename').val(prevOp.attr("value"));
				this.storage.load();
			});
			$(".fileSelect.down").click(()=>{
				var val = $('select.filename').val();
				var nextOp = $('select.filename option[value="' + val + '"]').next();
				if(nextOp.length == 0) return;
				$('select.filename').val(nextOp.attr("value"));
				this.storage.load();
			});
		
			$(".save").click(()=>{
				if(this.list.slides.length > 0){
					this.storage.save(this.document);
				}
			});
			$(".dispose").dblclick(()=>{
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
					var type:HVDataType;
					if($("#saveFormat_png").prop("checked")) type = HVDataType.PNG;
					if($("#saveFormat_hvz").prop("checked")) type = HVDataType.HVZ;
					if($("#saveFormat_hvd").prop("checked")) type = HVDataType.HVD;

					this.storage.export(this.document, type, {
						pages:(this.list.selectedSlideIndex != -1) ? [this.list.selectedSlideIndex] : undefined
					});
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
			//selectInit($("#duration"),localStorage.duration);
			$("#duration").change((any)=>{
				//localStorage.duration = $("#duration").val();
			});
			//selectInit($("#interval"),localStorage.interval);
			$("#interval").change((any)=>{
				//localStorage.interval = $("#interval").val();
			});

			$("#bgColor").change((e)=>{
				this.document.bgColor = $("#bgColor").val();
			});


		}

		//

		// window.addEventListener('beforeunload', function(e){
		// 	e.returnValue = "ページを離れます。よろしいですか？";
		// },false);

		this.newDocument();
	}

	private newDocument(doc?:VDoc){
		 if(this.document){
		 	this.document = null;
			this.edit.initialize();
		 	this.list.initialize();
		}

		this.setMode(ViewerMode.SELECT);
		if(!doc){
			ImageManager.shared.deleteAllImageData();
		}

		//

//		this.document = doc || new VDoc([], {width:(Viewer.SCREEN_WIDTH / 8), height:(Viewer.SCREEN_HEIGHT / 8)});
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
				this.edit.slideView.isActive = false;
			break;
			case ViewerMode.EDIT:
				this.obj.removeClass("select");
				this.obj.addClass("edit");
				this.edit.slideView.isActive = true;
			break;
/*			case ViewerMode.SLIDESHOW:
			break;*/
		}
		this.list.setMode(this._mode);
		this.edit.setMode(this._mode);
	}
}