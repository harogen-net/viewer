import { EventDispatcher } from "./events/EventDispatcher";
import { SlideEditable } from "./slide/EditableSlide";
import { SlideView } from "./__core__/view/SlideView";
import { ImageLayer } from "./__core__/model/ImageLayer";
import { ImageManager } from "./utils/ImageManager";
import { LayerListItem } from "./LayerListItem";
import { PropertyInput } from "./PropertyInput";
import { Viewer,ViewerMode } from "./Viewer";
import { SlideToPNGConverter } from "./utils/SlideToPNGConverter";
import { DataUtil } from "./utils/DataUtil";
import { LayerType, Layer } from "./__core__/model/Layer";
import { TextLayer } from "./__core__/model/TextLayer";
import { LayerView } from "./__core__/view/LayerView";
import { Slide } from "./__core__/model/Slide";


declare var $:any;
declare var jsSHA:any;

export class SlideCanvas extends EventDispatcher {

	public slideView:SlideEditable;

	private shadow:any;
	private UIsForImage:any[];




	constructor(public obj:any){
		super();

		this.UIsForImage = [
			$("#main button.cut"),
			$("#main button.copy"),
			$("#main button.fit"),
			$("#main button.rotateL"),
			$("#main button.rotateR"),
			$("#main button.mirrorH"),
			$("#main button.mirrorV"),
			$("#main button.delete"),
			$("#main button.copyTrans"),
			$("#main button.pasteTrans"),
//			$("#main button.imageRef"),
			$("#main button.download"),
			$("#main button.up"),
			$("#main button.down")
		];
		$.each(this.UIsForImage, (number, obj:any)=>{
			obj.prop("disabled", true);
		});

		this.obj.addClass("slideCanvas");

		this.slideView = new SlideEditable(new Slide(), $('<div />').appendTo(this.obj));
		this.slideView.addEventListener("select", (any)=>{
			$.each(this.UIsForImage, (number, obj:any)=>{
				obj.prop("disabled", this.slideView.selectedLayer == null);
				obj.removeClass("on");
			});
			
			$("button.imageRef").prop("disabled", !(this.slideView.selectedLayer != null && this.slideView.selectedLayer.type == LayerType.IMAGE));
			$(".property .clip dd input").prop("disabled", !(this.slideView.selectedLayer != null && this.slideView.selectedLayer.type == LayerType.IMAGE));

			if(this.slideView.selectedLayer != null){
				if(this.slideView.selectedLayer.mirrorH){
					$("button.mirrorH").addClass("on");
				}
				if(this.slideView.selectedLayer.mirrorV){
					$("button.mirrorV").addClass("on");
				}
			}

			this.updateMenu(this.slideView.layerViews);
		});
		this.slideView.addEventListener("update",(any)=>{
			this.updateMenu(this.slideView.layerViews);
		});


		this.slideView.addEventListener("scale",(any)=>{
//			this.updateShadow();
		});
		this.shadow = $('<div class="shadow" />')//.appendTo(this.obj);



		//

		$(".zoomIn").click(() => {
			this.slideView.scale *= 1.1;
		});
		$(".showAll").click(() => {
			this.slideView.scale = SlideEditable.SCALE_DEFAULT;
		});
		$(".zoomOut").click(() => {
			this.slideView.scale /= 1.1;
		});

		$(".cut").click(() => {
			this.slideView.cut();
		});
		$(".copy").click(() => {
			this.slideView.copy();
		});
		$(".paste").click(() => {
			this.slideView.paste();
		});
		
		$(".rotateL").click(() => {
			if(this.slideView.selectedLayer && !this.slideView.selectedLayer.locked && this.slideView.selectedLayer.visible) {
				this.slideView.selectedLayer.rotation -= 90;
				this.slideView.dispatchEvent(new Event("update"));

				if(this.slideView.selectedLayer.shared){
					this.slideView.dispatchEvent(new CustomEvent("sharedUpdate", {detail:{layer:this.slideView.selectedLayer}}));
				}
			}
		});
		$(".rotateR").click(() => {
			if(this.slideView.selectedLayer && !this.slideView.selectedLayer.locked && this.slideView.selectedLayer.visible) {
				this.slideView.selectedLayer.rotation += 90;
				this.slideView.dispatchEvent(new Event("update"));

				if(this.slideView.selectedLayer.shared){
					this.slideView.dispatchEvent(new CustomEvent("sharedUpdate", {detail:{layer:this.slideView.selectedLayer}}));
				}
			}
		});

		$(".mirrorH").click(() => {
			if(this.slideView.selectedLayer && !this.slideView.selectedLayer.locked && this.slideView.selectedLayer.visible) {
				this.slideView.selectedLayer.mirrorH = !this.slideView.selectedLayer.mirrorH;
				this.slideView.dispatchEvent(new Event("update"));
				if(this.slideView.selectedLayer.shared){
					this.slideView.dispatchEvent(new CustomEvent("sharedUpdate", {detail:{layer:this.slideView.selectedLayer}}));
				}
				$(".mirrorH").toggleClass("on");
			}
		});
		$(".mirrorV").click(() => {
			if(this.slideView.selectedLayer && !this.slideView.selectedLayer.locked && this.slideView.selectedLayer.visible) {
				this.slideView.selectedLayer.mirrorV = !this.slideView.selectedLayer.mirrorV;
				this.slideView.dispatchEvent(new Event("update"));
				if(this.slideView.selectedLayer.shared){
					this.slideView.dispatchEvent(new CustomEvent("sharedUpdate", {detail:{layer:this.slideView.selectedLayer}}));
				}
				$(".mirrorV").toggleClass("on");
			}
		});

		$(".copyTrans").click(() => {
			this.slideView.copyTrans();
		});
		$(".pasteTrans").click(() => {
			this.slideView.pasteTrans();
		});
	
		$(".fit").click(() => {
			this.slideView.fitSelectedLayer();
		});
		$(".slideDownload").click(()=>{
			this.dispatchEvent(new Event("download"));
		});
		$(".text").click(()=>{
			var textLayer:TextLayer = new TextLayer(prompt("insert text layer:"));
			this.slideView.slide.addLayer(textLayer);
			textLayer.moveTo(Viewer.SCREEN_WIDTH >> 1, Viewer.SCREEN_HEIGHT >> 1);
		});


		$("label[for='cb_imageRef']").click((e)=>{
			$("input#cb_imageRef").prop("checked", !$("input#cb_imageRef").prop("checked"));
			return false;
		});
		
		$("button.imageRef").click(()=>{
			$("input.imageRef")[0].click();
		});

		$("input.imageRef").on("change",(e)=>{
		/*	if(this.slide.selectedLayer == null) return;

			var targetImage:Image = this.slide.selectedLayer as Image;
			if(targetImage == null) return;

			var targetImageId:string = targetImage.imageId;
			var reader = new FileReader();
			reader.addEventListener('load', (e2:any) => {
				var imgObj = $('<img src="' + reader.result + '" />');

				var shaObj = new jsSHA("SHA-256","TEXT");
				shaObj.update(reader.result);
 				imgObj.bind("load",()=>{
					imgObj.unbind("load");
					imgObj.ready(()=>{

						if($("input#cb_imageRef").prop("checked")){
							ImageManager.swapImageAll(targetImageId, imgObj);
						}else{
							targetImage.swap(imgObj);
							this.slide.dispatchEvent(new Event("update"));
						}

						$("input.imageRef").val("");
					});
					$("body").append(imgObj);
				});
				imgObj.data("imageId",shaObj.getHash("HEX")); 
				imgObj.data("name",e.target.files[0].name); 
			});
			try{
				reader.readAsDataURL(e.target.files[0]);
			}
			catch(err){
				console.log(err);
			}*/
		});

		$("button.download").click(()=>{
			if(this.slideView.selectedLayer == null) return;
			if(this.slideView.selectedLayer.type != LayerType.IMAGE) return;

			var a = document.createElement("a");
			a.href = ImageManager.shared.getSrcById((this.slideView.selectedLayer as ImageLayer).imageId);
			a.target = '_blank';
			a.download = this.slideView.selectedLayer.name;
			a.click();
			window.URL.revokeObjectURL(a.href);
		});



		$("button.up").click(()=>{
			this.slideView.changeLayerOrder(this.slideView.selectedLayer, true);
		});
		$("button.down").click(()=>{
			this.slideView.changeLayerOrder(this.slideView.selectedLayer, false);
		});

		$(".close").click(() => {
			this.dispatchEvent(new Event("close"));
		});
		

		this.constructMenu(this.slideView);
	}

	//

	initialize(){
		this.slideView.slide = new Slide();
		$(".slideCanvas .menu span.name").text("");
	}

	private updateShadow(){
		const width:number = this.shadow.width();
		const height:number = this.shadow.height();

		var p_l:number = (width - this.slideView.width) / (width * 2);
		var p_r:number = p_l + (this.slideView.width / width);
		var p_t:number = (height - this.slideView.height) / (height * 2);
		var p_b:number = p_t + (this.slideView.height / height);

		if(p_l < 0) p_l = 0;
		if(p_r > 1) p_r = 1;
		if(p_t < 0) p_t = 0;
		if(p_b > 1) p_b = 1;

		const p_l_s:string = Math.round(p_l * 10000) / 100 + "%";
		const p_r_s:string = Math.round(p_r * 10000) / 100 + "%";
		const p_t_s:string = Math.round(p_t * 10000) / 100 + "%";
		const p_b_s:string = Math.round(p_b * 10000) / 100 + "%";

		const cssStr:string = [
			"0% 0%",
			"0% 100%",
			p_l_s + " 100%",
			p_l_s + " " + p_t_s,
			p_r_s + " " + p_t_s,
			p_r_s + " " + p_b_s,
			p_l_s + " " + p_b_s,
			p_l_s + " 100%",
			"100% 100%",
			"100% 0%",
		].join(",");

		this.shadow.css({
			"clip-path":"polygon(" + cssStr + ")"
		});
	}

	setMode(mode:ViewerMode):void {
		switch(mode){
			case ViewerMode.SELECT:
				this.shadow.css("min-height",this.shadow.height());
			break;
			case ViewerMode.EDIT:
				setTimeout(()=>{
					this.shadow.css("min-height","");
				},300);
			break;
		}
	} 

	public setSlideData(aData:any){
		if(aData.name){
			$(".slideCanvas .menu span.name").text(aData.name);
		}
	}

/* 	setData(aData:any[]){
		this.slide.setData(aData);
	}

	getData():any[]{
		return this.slide.getData();
	} */


	//////////////////////////////////////////////////////////////////////////////////////////////

	//分割予定
	//image property ui

	private inputTransX:PropertyInput;
	private inputTransY:PropertyInput;
	private inputScaleX:PropertyInput;
	private inputScaleY:PropertyInput;
	private inputRotation:PropertyInput;
	private inputOpacity:PropertyInput;
	private inputClip1:PropertyInput;
	private inputClip2:PropertyInput;
	private inputClip3:PropertyInput;
	private inputClip4:PropertyInput;

	private propertyInputs:PropertyInput[];
	private items:LayerListItem[];

	private constructMenu(slideView:SlideView):void{

		this.inputTransX = new PropertyInput($(".property .position input").eq(0), "x", {v:-25});
		this.inputTransY = new PropertyInput($(".property .position input").eq(1), "y", {v:-25});
		this.inputScaleX = new PropertyInput($(".property .scale input").eq(0), "scale", {init:1, min:0.1, max:20, type:"multiply", v:0.1});
		/*this.inputScaleY = new PropertyInput($(".property .scale input").eq(1), "scaleY", 1,10,-10,{type:"multipy"});*/
		this.inputRotation = new PropertyInput($(".property .rotation input").eq(0), "rotation", {min:-180, max:180, v:5});
		this.inputOpacity = new PropertyInput($(".property .opacity input").eq(0), "opacity", {min:0, max:1, v:0.1});

		this.inputClip1 = new PropertyInput($(".property .clip input").eq(0), "clipT", {v:-25, min:0});
		this.inputClip2 = new PropertyInput($(".property .clip input").eq(1), "clipR", {v:-25, min:0});
		this.inputClip3 = new PropertyInput($(".property .clip input").eq(2), "clipB", {v:-25, min:0});
		this.inputClip4 = new PropertyInput($(".property .clip input").eq(3), "clipL", {v:-25, min:0});

		this.propertyInputs = [this.inputTransX, this.inputTransY, this.inputScaleX, this.inputRotation, this.inputOpacity, this.inputClip1, this.inputClip2, this.inputClip3, this.inputClip4];
//		this.propertyInputs = [this.inputTransX, this.inputTransY, this.inputScaleX, this.inputScaleY, this.inputRotation, this.inputOpacity];
		$.each(this.propertyInputs, (number, input:PropertyInput)=>{
			input.addEventListener("update",this.onPropertyUpdate);
		});

		//

		this.items = [];
		for(var i:number = 0; i < Slide.LAYER_NUM_MAX; i++){
			var item = new LayerListItem();
			item.addEventListener("update", this.onLayerUpdate);
			this.items.push(item);
		}

		if(localStorage.sideMenuWidth == undefined){
			localStorage.sideMenuWidth = 200;
		}else{
			this.sideMenuWidth = localStorage.sidemenuWidth;
		}

		$(".sideMenu").resizable({
			handles:"w",
			minWidth:200,
			maxWidth:500,
			resize:(any,ui:any)=>{
				this.sideMenuWidth = ui.size.width;
				localStorage.sidemenuWidth = ui.size.width;
			}
		});

		slideView.addEventListener("select", (any)=>{
			this.updateMenuSelection();
			setTimeout(()=>{
				this.updateProperty();
			},2);
		});
		slideView.addEventListener("update",(any)=>{
			this.updateMenu(this.slideView.layerViews);
			this.updateProperty();
		});

		var bg:any = $('<div class="bg" />');
		$(".layer").append(bg);
		bg.on("click",(any)=>{
			if(this.slideView.selectedLayer != null){
				this.slideView.selectLayer(null);
			}
		});
	}



	private updateMenu(layers:LayerView[] = null):void{
//	private updateMenu(images:Image[]):void{
		layers = this.slideView.layerViews;
		$.each(this.items, (number, item:LayerListItem)=>{
			item.obj.detach();
			item.layerView = null;
		});
		$.each(layers, (i:number, layerView:LayerView)=>{
			$(".layer ul").prepend(this.items[i].obj);
			this.items[i].layerView = layerView;
		});

		//$(".layer ul").sortable("refresh");
	}

	private updateMenuSelection():void{
		$.each(this.items, (i:number, item:LayerListItem)=>{
			item.update();
		});
	}


	private updateProperty(){
		var selectedSlideExists:boolean = this.slideView.selectedLayer != null;
		$.each(this.propertyInputs, (number, input:PropertyInput)=>{
			input.disabled = !selectedSlideExists;
			if(selectedSlideExists && this.slideView.selectedLayer[input.key] != undefined){
				input.value = this.slideView.selectedLayer[input.key];
			}else{
				input.disabled = true;
			}
		});
	}

	//

	private onPropertyUpdate = (ce:CustomEvent)=>{
		if(this.slideView.selectedLayer == null) return;
		this.slideView.selectedLayer[ce.detail.key] = ce.detail.value;

		this.slideView.dispatchEvent(new Event("update"));
		if(this.slideView.selectedLayer.shared){
			this.slideView.dispatchEvent(new CustomEvent("sharedUpdate", {detail:{layer:this.slideView.selectedLayer}}));

		}
	};

	//private onLayerUpdate(e:any) {
	private onLayerUpdate = (e:any)=>{
		var item:LayerListItem = e.detail.target as LayerListItem;
		switch(e.detail.subType){
			case "lock_on":
				item.layerView.data.locked = true;
				if(item.layerView == this.slideView.selectedLayerView){
					this.slideView.selectLayer(null);
				}
				this.slideView.dispatchEvent(new Event("update"));
				if(item.layerView.data.shared){
					this.slideView.dispatchEvent(new CustomEvent("sharedUpdate", {detail:{layer:item.layerView}}));
				}
				break;
			case "lock_off":
			item.layerView.data.locked = false;
				this.slideView.dispatchEvent(new Event("update"));
				if(item.layerView.data.shared){
					this.slideView.dispatchEvent(new CustomEvent("sharedUpdate", {detail:{layer:item.layerView}}));
				}
				break;
			case "eye_on":
				item.layerView.data.visible = true;
				this.slideView.dispatchEvent(new Event("update"));
				if(item.layerView.data.shared){
					this.slideView.dispatchEvent(new CustomEvent("sharedUpdate", {detail:{layer:item.layerView}}));
				}
				break;
			case "eye_off":
				item.layerView.data.visible = false;
				if(item.layerView == this.slideView.selectedLayerView){
					this.slideView.selectLayer(null);
				}
				this.slideView.dispatchEvent(new Event("update"));
				if(item.layerView.data.shared){
					this.slideView.dispatchEvent(new CustomEvent("sharedUpdate", {detail:{layer:item.layerView}}));
				}
				break;
			case "share_on":
				item.layerView.data.shared = true;
				this.slideView.dispatchEvent(new Event("update"));
				if(window.confirm('copy image to all slide (within the image not exists). Are you sure?')){
					this.slideView.dispatchEvent(new CustomEvent("sharedPaste", {detail:{layer:item.layerView}}));
				}
				break;
			case "share_off":
				item.layerView.data.shared = false;
				this.slideView.dispatchEvent(new Event("update"));
				break;
			case "select":
				this.slideView.selectLayer(item.layerView.data);
				break;
			case "delete":
				if(item.layerView.data.shared && window.confirm('delete all shared image. Are you sure?')){
					this.slideView.dispatchEvent(new CustomEvent("sharedUpdate", {detail:{layer:item.layerView, delete:true}}));
				}
				this.slideView.slide.removeLayer(item.layerView.data);
			break;
			default:
			break;
		}
	}

	private set sideMenuWidth(value:number) {
		$(".sideMenu").width(value);
		this.slideView.obj.css("width", "calc(100% - " + value + "px)");
		this.shadow.css("width", "calc(100% - " + value + "px)");

	}

}