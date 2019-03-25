import {Slide} from "./__core__/Slide";
import {SlideEditable} from "./__core__/SlideEditable";
import {SlideList} from "./SlideList";
import {Image} from "./__core__/layer/Image";
import { SlideStorage, HVDataType } from "./utils/SlideStorage";
import { SlideShow } from "./SlideShow";
import { Menu } from "./Menu";
import { SlideCanvas } from "./SlideCanvas";
import { ImageManager } from "./utils/ImageManager";
import { VDoc } from "./__core__/VDoc";
import { SlideToPNGConverter } from "./utils/SlideToPNGConverter";
import { DataUtil } from "./utils/DataUtil";
import { Layer, LayerType } from "./__core__/Layer";

declare var $:any;

export enum ViewerMode {
	SELECT,
	EDIT,
	SLIDESHOW
}

export class Viewer {
	
	public static enforceAspectRatio = true;


//	public static readonly SCREEN_WIDTH = 1366;
//	public static readonly SCREEN_HEIGHT = 768;
	public static readonly SCREEN_WIDTH = window.screen.width;
	public static readonly SCREEN_HEIGHT = window.screen.height;

	private canvas:SlideCanvas;
	private list:SlideList;
	private slideShow:SlideShow;
	private storage:SlideStorage;
	private menu:Menu;

	private _mode:ViewerMode;

	private document:VDoc;


    constructor(public obj:any){
//		if(localStorage.duration == undefined) localStorage.duration = 2000;
//		if(localStorage.interval == undefined) localStorage.interval = 5000;

		ImageManager.initialize();

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
		this.canvas = new SlideCanvas(obj.find(".canvas"));
		this.slideShow = new SlideShow($("<div />").appendTo(obj));

		this.storage = new SlideStorage();
		this.storage.addEventListener("loaded", (e:CustomEvent)=>{
/*			this.list.initialize();
			this.canvas.initialize();
			this.setMode(ViewerMode.SELECT);
			$.each(this.storage.slides, (i:number, slide:Slide)=>{
				this.list.addSlide(slide);
			});*/
			this.newDocument(e.detail as VDoc);
		});
		//


		this.list.addEventListener("select", ()=>{
			if(this._mode == ViewerMode.SELECT){


			}else if(this._mode == ViewerMode.EDIT){
				if(this.list.selectedSlide){
					this.canvas.slide.isActive = true;
					this.list.selectedSlide.isLock = true;
					this.canvas.slide.setData(this.list.selectedSlide.getData());
					this.list.selectedSlide.isLock = false;
					this.canvas.setSlideData({name:this.list.selectedSlide.id});
				}else{
					this.canvas.initialize();
				}
			}
			//console.log("slide selected at list");
		})
		this.list.addEventListener("edit", ()=>{
			this.setMode(ViewerMode.EDIT);
			if(this.list.selectedSlide){
				this.list.selectedSlide.isLock = true;
				this.canvas.slide.setData(this.list.selectedSlide.getData());
				this.list.selectedSlide.isLock = false;
				this.canvas.setSlideData({name:this.list.selectedSlide.id});
			}
		});

		this.canvas.slide.addEventListener("update",()=>{
			if(this._mode == ViewerMode.EDIT){
				if(this.list.selectedSlide){
					this.list.selectedSlide.setData(this.canvas.slide.getData());
				}
			}
		});
		this.canvas.slide.addEventListener("sharedUpdate",(ce:CustomEvent)=>{
			if(this._mode == ViewerMode.EDIT){
				if(this.list.selectedSlide){
					var targetLayer:Layer = ce.detail.layer as Layer;
					var deleteFlag:boolean = ce.detail.delete as boolean;
					console.log("sharedUpdate : " + targetLayer + " : " + deleteFlag);
					if(!targetLayer) return;

					var i:number = this.list.selectedSlideIndex;
					var found:boolean = false;
					var slide:Slide = null;
					var updateFunc = (j:number, layer:Layer)=>{
						if(found) return;
						if(!layer.shared) return;

						if(targetLayer.type != layer.type) return;
						switch(targetLayer.type){
							case LayerType.IMAGE:
								if((layer as Image).imageId != (targetLayer as Image).imageId) return;
							break;
							default:
								if(layer.id != targetLayer.id) return;
							break;
						}

						if(deleteFlag){
							slide.removeLayer(layer);
						}else{
							layer.locked = targetLayer.locked;
							layer.visible = targetLayer.visible;
							layer.opacity = targetLayer.opacity;
							layer.transform = targetLayer.transform;
						}
						found = true;
					}
					while(--i >= 0){
						found = false;
						slide = this.list.slides[i];
						$.each(slide.layers, updateFunc);
						if(!found) break;
					}
					i = this.list.selectedSlideIndex;
					while(++i < this.list.slides.length){
						found = false;
						slide = this.list.slides[i];
						$.each(slide.layers, updateFunc);
						if(!found) break;
					}
				}
			}
		});
		this.canvas.slide.addEventListener("sharedPaste",(ce:CustomEvent)=>{
			if(this._mode == ViewerMode.EDIT){
				if(this.list.selectedSlide){
					var targetLayer:Layer = ce.detail.layer as Layer;
					console.log("sharedPaste : " + targetLayer);
					if(!targetLayer) return;

					var i:number = this.list.selectedSlideIndex;
					var found:boolean = false;
					var slide:Slide = null;
					var findFunc = (j:number, layer:Layer)=>{
						if(found) return;

						if(targetLayer.type != layer.type) return;
						switch(targetLayer.type){
							case LayerType.IMAGE:
								if((layer as Image).imageId == (targetLayer as Image).imageId) {
									found = true;
									return;
								}
							break;
							default:
								if(layer.id == targetLayer.id) {
									found = true;
									return;
								};
							break;
						}
					}
					while(--i >= 0){
						found = false;
						slide = this.list.slides[i];
						$.each(slide.layers, findFunc);
						if(found) {
							break;
						}else{
							slide.addLayer(targetLayer.clone());
						}
					}
					i = this.list.selectedSlideIndex;
					while(++i < this.list.slides.length){
						found = false;
						slide = this.list.slides[i];
						$.each(slide.layers, findFunc);
						if(found) {
							break;
						}else{
							slide.addLayer(targetLayer.clone());
						}
					}
				}
			}
		});

		this.canvas.addEventListener("close",()=>{
			this.setMode(ViewerMode.SELECT);
		});
		this.list.addEventListener("close",()=>{
			this.setMode(ViewerMode.SELECT);
		});

		this.canvas.addEventListener("download", ()=>{
			var canvas:HTMLCanvasElement = new SlideToPNGConverter().slide2canvas(this.canvas.slide, Viewer.SCREEN_WIDTH, Viewer.SCREEN_HEIGHT, this.document.bgColor);
			DataUtil.downloadBlob(DataUtil.dataURItoBlob(canvas.toDataURL()),this.document.title + "_" + (this.list.selectedSlideIndex + 1) + ".png");
		});

		//

		//IO section
		{
			$("#pref > button").click(()=>{
				$("#pref > .menu").toggle();
			});
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
				if(this.document.slides.length == 0) return;
				if($("#cb_ignore").prop("checked") || window.confirm('clear slides and new document. Are you sure?')){
					this.newDocument();
				}
			});

		
			$(".save").click(()=>{
				if(this.list.slides.length > 0){
					this.storage.save(this.document);
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

		this.newDocument();
	}

	private newDocument(doc?:VDoc){
		this.document = null;
		this.list.initialize();
		this.canvas.initialize();
		this.setMode(ViewerMode.SELECT);

		if(!doc){
			ImageManager.initialize();
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
				this.canvas.slide.isActive = false;
			break;
			case ViewerMode.EDIT:
				this.obj.removeClass("select");
				this.obj.addClass("edit");
				this.canvas.slide.isActive = true;
			break;
/*			case ViewerMode.SLIDESHOW:
			break;*/
		}
		this.list.setMode(this._mode);
		this.canvas.setMode(this._mode);
	}
}