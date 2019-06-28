import { EventDispatcher } from "./events/EventDispatcher";
import { EditableSlideView } from "./slide/EditableSlideView";
import { SlideView } from "./__core__/view/SlideView";
import { ImageLayer } from "./__core__/model/ImageLayer";
import { ImageManager } from "./utils/ImageManager";
import { SELayerListItem } from "./SELayerListItem";
import { PropertyInput } from "./SENumberBindingInput";
import { Viewer,ViewerMode } from "./Viewer";
import { SlideToPNGConverter } from "./utils/SlideToPNGConverter";
import { DataUtil } from "./utils/DataUtil";
import { LayerType, Layer } from "./__core__/model/Layer";
import { TextLayer } from "./__core__/model/TextLayer";
import { LayerView } from "./__core__/view/LayerView";
import { Slide } from "./__core__/model/Slide";
import { SEPropDiv } from "./SEPropDiv";
import { SELayerDiv } from "./SELayerDiv";
import { VDoc } from "./__core__/model/VDoc";
import { VMInput, VMButton } from "./__core__/view/VMInput";


declare var $:any;
declare var jsSHA:any;

export class SlideEdit extends EventDispatcher {

	public slideView:EditableSlideView;

	private propDiv:SEPropDiv;
	private layerDiv:SELayerDiv;

	private shadow:any;
	private UIsForImage:any[];




	constructor(public obj:any){
		super();
		this.obj.addClass("slideCanvas");

// 		this.UIsForImage = [
// //			$("#main button.cut"),
// 			$("#main button.copy"),
// 			$("#main button.fit"),
// 			$("#main button.rotateL"),
// 			$("#main button.rotateR"),
// 			$("#main button.mirrorH"),
// 			$("#main button.mirrorV"),
// 			$("#main button.delete"),
// 			$("#main button.copyTrans"),
// 			$("#main button.pasteTrans"),
// //			$("#main button.imageRef"),
// 			$("#main button.download"),
// 			$("#main button.up"),
// 			$("#main button.down")
// 		];
// 		this.UIsForImage.forEach(obj=>{obj.prop("disabled", true);});

		//

		this.slideView = new EditableSlideView(new Slide(), $('<div />').appendTo(this.obj));
		this.propDiv = new SEPropDiv($(".property"));
		this.layerDiv = new SELayerDiv($(".layer"));

		//

		var vms:VMInput[] = [
			new VMButton($("#main button.cut"), Layer, ()=>{
				this.slideView.cut();
			}),
			new VMButton($("#main button.copy"), Layer, ()=>{
				this.slideView.copy();
			}),
			new VMButton($("#main button.rotateL"), Layer, ()=>{
				if(!this.slideView.editingLayer) return;
				this.slideView.editingLayer.rotateBy(-90);
			}),
			new VMButton($("#main button.rotateR"), Layer, ()=>{
				if(!this.slideView.editingLayer) return;
				this.slideView.selectedLayer.rotateBy(90);
			}),
			new VMButton($("#main button.mirrorH"), Layer, ()=>{
				if(!this.slideView.editingLayer) return;
				this.slideView.editingLayer.mirrorH = !this.slideView.editingLayer.mirrorH;
			}),
			new VMButton($("#main button.mirrorV"), Layer, ()=>{
				if(!this.slideView.editingLayer) return;
				this.slideView.editingLayer.mirrorV = !this.slideView.editingLayer.mirrorV;
			}),
			new VMButton($("#main button.copyTrans"), Layer, ()=>{
				this.slideView.copyTrans();
			}),
			new VMButton($("#main button.pasteTrans"), Layer, ()=>{
				this.slideView.pasteTrans();
			}),
			new VMButton($("#main button.fit"), Layer, ()=>{
				this.slideView.fitSelectedLayer();
			}),
			new VMButton($("#main button.imageRef"), ImageLayer, ()=>{
				$("input.imageRef")[0].click();
			}),
			new VMButton($("#main button.download"), ImageLayer, ()=>{
				if(this.slideView.selectedLayerView == null) return;
				if(this.slideView.selectedLayerView.type != LayerType.IMAGE) return;
	
				var a = document.createElement("a");
				a.href = ImageManager.shared.getSrcById((this.slideView.selectedLayer as ImageLayer).imageId);
				a.target = '_blank';
				a.download = this.slideView.selectedLayer.name;
				a.click();
				window.URL.revokeObjectURL(a.href);
			}),

			new VMButton($("#main button.up"), Layer, ()=>{
				this.slideView.swapLayer(this.slideView.selectedLayer, 1);
			}),
			new VMButton($("#main button.down"), Layer, ()=>{
				this.slideView.swapLayer(this.slideView.selectedLayer, -1);
			}),
			new VMButton($("#main button.top"), Layer, ()=>{
				this.slideView.swapLayer(this.slideView.selectedLayer, Slide.LAYER_NUM_MAX);
			}),
			new VMButton($("#main button.bottom"), Layer, ()=>{
				this.slideView.swapLayer(this.slideView.selectedLayer, -Slide.LAYER_NUM_MAX);
			}),
		];

		$(".paste").click(() => {
			this.slideView.paste();
		});
		


		this.slideView.addEventListener("select", (any)=>{
			vms.forEach(vmi=>{
				vmi.target = this.slideView.selectedLayer;
			})


			if(this.slideView.selectedLayerView != null){
				if(this.slideView.selectedLayer.mirrorH){
					$("button.mirrorH").addClass("on");
				}
				if(this.slideView.selectedLayer.mirrorV){
					$("button.mirrorV").addClass("on");
				}
			}

			try{
				this.propDiv.targetLayer = this.slideView.selectedLayer;
			}
			catch {
				this.propDiv.targetLayer = null;
			}
		});


//		this.slideView.addEventListener("scale",(any)=>{
//			this.updateShadow();
//		});
		this.shadow = $('<div class="shadow" />')//.appendTo(this.obj);



		//

		$(".zoomIn").click(() => {
			this.slideView.scale *= 1.1;
		});
		$(".showAll").click(() => {
			this.slideView.scale = EditableSlideView.SCALE_DEFAULT;
		});
		$(".zoomOut").click(() => {
			this.slideView.scale /= 1.1;
		});
		$(".slideDownload").click(()=>{
			this.dispatchEvent(new Event("download"));
		});
		$(".text").click(()=>{
			var textLayer:TextLayer = new TextLayer(prompt("insert text layer:"));
			this.slideView.slide.addLayer(textLayer);
			textLayer.moveTo(this.slideView.slide.centerX, this.slideView.slide.centerY);
		});


		$("label[for='cb_imageRef']").click((e)=>{
			$("input#cb_imageRef").prop("checked", !$("input#cb_imageRef").prop("checked"));
			return false;
		});
		$("input.imageRef").on("change", async (e)=>{
			if(this.slideView.selectedLayer == null || this.slideView.selectedLayer.type != LayerType.IMAGE) return;
			var targetImage:ImageLayer = this.slideView.selectedLayer as ImageLayer;
			var newImageId:string = await ImageManager.shared.registImageFromFile(e.target.files[0]);

			if($("input#cb_imageRef").prop("checked")){
				var fromImageId:string = targetImage.imageId;	//直参照すると途中で変わってしまうため変数に退避
				VDoc.shared.slides.forEach(slide=>{
					slide.layers.forEach(layer=>{
						if(layer.type != LayerType.IMAGE) return;
						var imageLayer:ImageLayer = layer as ImageLayer;
						if(imageLayer.imageId == fromImageId){
							imageLayer.imageId = newImageId;
						}
					});
				});

			}else{newImageId
				targetImage.imageId = newImageId;
			}
		});






		$(".close").click(() => {
			this.dispatchEvent(new Event("close"));
		});
		



	}

	//

	initialize(){
		this.slideView.slide = new Slide();
		this.propDiv.targetLayer = null;

		$(".slideCanvas .menu span.name").text("");
	}

	// private updateShadow(){
	// 	const width:number = this.shadow.width();
	// 	const height:number = this.shadow.height();

	// 	var p_l:number = (width - this.slideView.width) / (width * 2);
	// 	var p_r:number = p_l + (this.slideView.width / width);
	// 	var p_t:number = (height - this.slideView.height) / (height * 2);
	// 	var p_b:number = p_t + (this.slideView.height / height);

	// 	if(p_l < 0) p_l = 0;
	// 	if(p_r > 1) p_r = 1;
	// 	if(p_t < 0) p_t = 0;
	// 	if(p_b > 1) p_b = 1;

	// 	const p_l_s:string = Math.round(p_l * 10000) / 100 + "%";
	// 	const p_r_s:string = Math.round(p_r * 10000) / 100 + "%";
	// 	const p_t_s:string = Math.round(p_t * 10000) / 100 + "%";
	// 	const p_b_s:string = Math.round(p_b * 10000) / 100 + "%";

	// 	const cssStr:string = [
	// 		"0% 0%",
	// 		"0% 100%",
	// 		p_l_s + " 100%",
	// 		p_l_s + " " + p_t_s,
	// 		p_r_s + " " + p_t_s,
	// 		p_r_s + " " + p_b_s,
	// 		p_l_s + " " + p_b_s,
	// 		p_l_s + " 100%",
	// 		"100% 100%",
	// 		"100% 0%",
	// 	].join(",");

	// 	this.shadow.css({
	// 		"clip-path":"polygon(" + cssStr + ")"
	// 	});
	// }

	setMode(mode:ViewerMode):void {
		switch(mode){
			case ViewerMode.SELECT:
				this.slideView.isActive = false;
//				this.shadow.css("min-height",this.shadow.height());
			break;
			case ViewerMode.EDIT:
				this.slideView.isActive = true;
					/*				setTimeout(()=>{
					this.shadow.css("min-height","");
				},300);*/
			break;
		}
	} 

	public setSlide(newSlide:Slide) {
		if(this.slideView.slide){
			this.slideView.slide.removeEventListener("update", ()=>{
				this.layerDiv.update();
			});
		}

		this.slideView.slide = newSlide;
		$(".slideCanvas .menu span.name").text(newSlide.id);

		this.layerDiv.layerViews = this.slideView.layerViews;
		if(this.slideView.slide){
			this.slideView.slide.addEventListener("update", ()=>{
//				console.log("slide update at SlideEdit");
				this.layerDiv.update();
			});
		}

	}
}