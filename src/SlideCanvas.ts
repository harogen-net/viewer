import { EventDispatcher } from "./events/EventDispatcher";
import { SlideEditable } from "./__core__/SlideEditable";
import { Slide } from "./__core__/Slide";
import {Image} from "./__core__/Image";
import { ImageManager } from "./utils/ImageManager";
import { LayerListItem } from "./LayerListItem";
import { PropertyInput } from "./PropertyInput";
import { Viewer,ViewerMode } from "./Viewer";


declare var $:any;
declare var jsSHA:any;

export class SlideCanvas extends EventDispatcher {

	public slide:SlideEditable;

	private shadow:any;
	private UIsForImage:any[];




	constructor(public obj:any){
		super();

		this.UIsForImage = [
			$("button.cut"),
			$("button.copy"),
			$("button.fit"),
			$("button.rotateL"),
			$("button.rotateR"),
			$("button.mirrorH"),
			$("button.mirrorV"),
			$("button.delete"),
			$("button.copyTrans"),
			$("button.pasteTrans"),
			$("button.imageRef"),
			$("button.download"),
			$("button.up"),
			$("button.down")
		];
		$.each(this.UIsForImage, (number, obj:any)=>{
			obj.prop("disabled", true);
		});

		this.obj.addClass("slideCanvas");
		this.slide = new SlideEditable($('<div />').appendTo(this.obj));
		this.slide.addEventListener("select", (any)=>{
			$.each(this.UIsForImage, (number, obj:any)=>{
				obj.prop("disabled", this.slide.selectedImg == null);
				obj.removeClass("on");
			});


			if(this.slide.selectedImg != null){
				if(this.slide.selectedImg.mirrorH){
					$("button.mirrorH").addClass("on");
				}
				if(this.slide.selectedImg.mirrorV){
					$("button.mirrorV").addClass("on");
				}
			}

			this.updateMenu(this.slide.images);
		});
		this.slide.addEventListener("update",(any)=>{
			this.updateMenu(this.slide.images);
		});
		this.slide.addEventListener("scale",(any)=>{
			this.updateShadow();
		});

		this.shadow = $('<div class="shadow" />').appendTo(this.obj);



		//

		$(".zoomIn").click(() => {
			this.slide.scale *= 1.1;
		});
		$(".showAll").click(() => {
			this.slide.scale = SlideEditable.SCALE_DEFAULT;
		});
		$(".zoomOut").click(() => {
			this.slide.scale /= 1.1;
		});

		$(".cut").click(() => {
			this.slide.cut();
		});
		$(".copy").click(() => {
			this.slide.copy();
		});
		$(".paste").click(() => {
			this.slide.paste();
		});
		
		$(".rotateL").click(() => {
			if(this.slide.selectedImg && !this.slide.selectedImg.locked && this.slide.selectedImg.visible) {
				this.slide.selectedImg.rotation -= 90;
				this.slide.dispatchEvent(new Event("update"));
			}
		});
		$(".rotateR").click(() => {
			if(this.slide.selectedImg && !this.slide.selectedImg.locked && this.slide.selectedImg.visible) {
				this.slide.selectedImg.rotation += 90;
				this.slide.dispatchEvent(new Event("update"));
			}
		});

		$(".mirrorH").click(() => {
			if(this.slide.selectedImg && !this.slide.selectedImg.locked && this.slide.selectedImg.visible) {
				this.slide.selectedImg.mirrorH = !this.slide.selectedImg.mirrorH;
				this.slide.dispatchEvent(new Event("update"));
				$(".mirrorH").toggleClass("on");
			}
		});
		$(".mirrorV").click(() => {
			if(this.slide.selectedImg && !this.slide.selectedImg.locked && this.slide.selectedImg.visible) {
				this.slide.selectedImg.mirrorV = !this.slide.selectedImg.mirrorV;
				this.slide.dispatchEvent(new Event("update"));
				$(".mirrorV").toggleClass("on");
			}
		});
/* 		$(".delete").click(() => {
			if(this.slide.selectedImg && !this.slide.selectedImg.locked && this.slide.selectedImg.visible) {
				this.slide.removeImage(this.slide.selectedImg);
			}
		}); */
		$(".copyTrans").click(() => {
			this.slide.copyTrans();
		});
		$(".pasteTrans").click(() => {
			this.slide.pasteTrans();
		});
	
		$(".fit").click(() => {
			this.slide.fitSelectedImage();
		});

		$("label[for='cb_imageRef']").click((e)=>{
			$("input#cb_imageRef").prop("checked", !$("input#cb_imageRef").prop("checked"));
			return false;
		});
		
		$("button.imageRef").click(()=>{
			$("input.imageRef")[0].click();
		});

		$("input.imageRef").on("change",(e)=>{
			if(this.slide.selectedImg == null) return;

			var targetImg:Image = this.slide.selectedImg;
			var reader = new FileReader();
			reader.addEventListener('load', (e2:any) => {
				var imgObj = $('<img src="' + reader.result + '" />');

				var shaObj = new jsSHA("SHA-256","TEXT");
				shaObj.update(reader.result);
 				imgObj.bind("load",()=>{
					imgObj.unbind("load");
					imgObj.ready(()=>{

						if($("input#cb_imageRef").prop("checked")){
							ImageManager.swapImageAll(targetImg.imageId, imgObj);
						}else{
							targetImg.swap(imgObj);
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
			}
		});

		$("button.download").click(()=>{
			if(this.slide.selectedImg == null) return;

			var a = document.createElement("a");
			a.href = this.slide.selectedImg.data.src;
			a.target = '_blank';
			a.download = this.slide.selectedImg.name;
			a.click();
			URL.revokeObjectURL(a.href);
		});



		$("button.up").click(()=>{
			if(this.slide.selectedImg == null) return;
			this.slide.forwardImage(this.slide.selectedImg);
		});
		$("button.down").click(()=>{
			if(this.slide.selectedImg == null) return;
			this.slide.backwordImage(this.slide.selectedImg);
		});

		$(".close").click(() => {
			this.dispatchEvent(new Event("close"));
		});
		

		this.constructMenu(this.slide);
	}

	//

	initialize(){
		this.slide.initialize();
	}

	private updateShadow(){
		const width:number = this.shadow.width();
		const height:number = this.shadow.height();

		var p_l:number = (width - this.slide.width) / (width * 2);
		var p_r:number = p_l + (this.slide.width / width);
		var p_t:number = (height - this.slide.height) / (height * 2);
		var p_b:number = p_t + (this.slide.height / height);

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

	private propertyInputs:PropertyInput[];
	private items:LayerListItem[];

	private constructMenu(slide:Slide):void{

		this.inputTransX = new PropertyInput($(".property .position input").eq(0), "x");
		this.inputTransY = new PropertyInput($(".property .position input").eq(1), "y");
		this.inputScaleX = new PropertyInput($(".property .scale input").eq(0), "scale", {init:1, min:0.01, max:20, type:"multipy", acceleration:0.1});
		/*this.inputScaleY = new PropertyInput($(".property .scale input").eq(1), "scaleY", 1,10,-10,{type:"multipy"});*/
		this.inputRotation = new PropertyInput($(".property .rotation input").eq(0), "rotation", {min:-180, max:180});
		this.inputOpacity = new PropertyInput($(".property .opacity input").eq(0), "opacity", {min:0, max:1, acceleration:0.003, step:0.01});

		this.propertyInputs = [this.inputTransX, this.inputTransY, this.inputScaleX, this.inputRotation, this.inputOpacity];
//		this.propertyInputs = [this.inputTransX, this.inputTransY, this.inputScaleX, this.inputScaleY, this.inputRotation, this.inputOpacity];
		$.each(this.propertyInputs, (number, input:PropertyInput)=>{
			input.addEventListener("update",this.onPropertyUpdate);
		});

		//

		this.items = [];
		for(var i:number = 0; i < Slide.IMAGE_NUM_MAX; i++){
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

		slide.addEventListener("select", (any)=>{
			this.updateMenuSelection();
			setTimeout(()=>{
				this.updateProperty();
			},2);
		});
		slide.addEventListener("update",(any)=>{
			this.updateMenu(this.slide.images);
			this.updateProperty();
		});

		var bg:any = $('<div class="bg" />');
		$(".layer").append(bg);
		bg.on("click",(any)=>{
			if(this.slide.selectedImg != null){
				this.slide.selectImage(null);
			}
		});
	}



	private updateMenu(images:Image[] = null):void{
//	private updateMenu(images:Image[]):void{
		images = this.slide.images;
		$.each(this.items, (number, item:LayerListItem)=>{
			item.obj.detach();
			item.image = null;
		});
		$.each(images, (i:number, image:Image)=>{
			$(".layer ul").prepend(this.items[i].obj);
			this.items[i].image = image;
		});

		//$(".layer ul").sortable("refresh");
	}

	private updateMenuSelection():void{
		$.each(this.items, (i:number, item:LayerListItem)=>{
			item.update();
		});
	}


	private updateProperty(){
		var selectedSlideExists:boolean = this.slide.selectedImg != null;
		$.each(this.propertyInputs, (number, input:PropertyInput)=>{
			input.disabled = !selectedSlideExists;
			if(selectedSlideExists) input.value = this.slide.selectedImg[input.key];
		});
	}

	//

	private onPropertyUpdate = (ce:CustomEvent)=>{
		if(this.slide.selectedImg == null) return;
		this.slide.selectedImg[ce.detail.key] = ce.detail.value;

		this.slide.dispatchEvent(new Event("update"));
		if(this.slide.selectedImg.shared){
			this.slide.dispatchEvent(new CustomEvent("sharedUpdate", {detail:this.slide.selectedImg}));

		}
	};

	//private onLayerUpdate(e:any) {
	private onLayerUpdate = (e:any)=>{
		var item:LayerListItem = e.detail.target as LayerListItem;
		switch(e.detail.subType){
			case "lock_on":
				item.image.locked = true;
				if(item.image == this.slide.selectedImg){
					this.slide.selectImage(null);
				}
				this.slide.dispatchEvent(new Event("update"));
				if(item.image.shared){
					this.slide.dispatchEvent(new CustomEvent("sharedUpdate", {detail:item.image}));
				}
				break;
			case "lock_off":
			item.image.locked = false;
				this.slide.dispatchEvent(new Event("update"));
				if(item.image.shared){
					this.slide.dispatchEvent(new CustomEvent("sharedUpdate", {detail:item.image}));
				}
				break;
			case "eye_on":
				item.image.visible = true;
				this.slide.dispatchEvent(new Event("update"));
				if(item.image.shared){
					this.slide.dispatchEvent(new CustomEvent("sharedUpdate", {detail:item.image}));
				}
				break;
			case "eye_off":
				item.image.visible = false;
				if(item.image == this.slide.selectedImg){
					this.slide.selectImage(null);
				}
				this.slide.dispatchEvent(new Event("update"));
				if(item.image.shared){
					this.slide.dispatchEvent(new CustomEvent("sharedUpdate", {detail:item.image}));
				}
				break;
			case "share_on":
				item.image.shared = true;
				this.slide.dispatchEvent(new Event("update"));
				break;
			case "share_off":
				item.image.shared = false;
				this.slide.dispatchEvent(new Event("update"));
				break;
			case "select":
				this.slide.selectImage(item.image);
				break;
			case "delete":
				this.slide.removeImage(item.image);
			break;
			default:
			break;
		}
	}

	private set sideMenuWidth(value:number) {
		$(".sideMenu").width(value);
		this.slide.obj.css("width", "calc(100% - " + value + "px)");
		this.shadow.css("width", "calc(100% - " + value + "px)");

	}

}