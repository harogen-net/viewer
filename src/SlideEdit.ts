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
		this.UIsForImage.forEach(obj=>{obj.prop("disabled", true);});

		//

		this.slideView = new EditableSlideView(new Slide(), $('<div />').appendTo(this.obj));
		this.propDiv = new SEPropDiv($(".property"));
		this.layerDiv = new SELayerDiv($(".layer"));

		//

		this.slideView.addEventListener("select", (any)=>{
			$.each(this.UIsForImage, (number, obj:any)=>{
				obj.prop("disabled", this.slideView.selectedLayerView == null);
				obj.removeClass("on");
			});
			
			$("button.imageRef").prop("disabled", !(this.slideView.selectedLayerView != null && this.slideView.selectedLayerView.type == LayerType.IMAGE));
		//	$(".property .clip dd input").prop("disabled", !(this.slideView.selectedLayerView != null && this.slideView.selectedLayerView.type == LayerType.IMAGE));

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
			
			//this.updateMenu(this.slideView.layerViews);
		});

		// this.slideView.addEventListener("update",(any)=>{
		// 	this.updateMenu(this.slideView.layerViews);
		// });


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
			if(this.slideView.selectedLayerView && !this.slideView.selectedLayer.locked && this.slideView.selectedLayer.visible) {
				this.slideView.selectedLayer.rotation -= 90;
			}
		});
		$(".rotateR").click(() => {
			if(this.slideView.selectedLayerView && !this.slideView.selectedLayer.locked && this.slideView.selectedLayer.visible) {
				this.slideView.selectedLayer.rotation += 90;
			}
		});

		$(".mirrorH").click(() => {
			if(this.slideView.selectedLayerView && !this.slideView.selectedLayer.locked && this.slideView.selectedLayer.visible) {
				this.slideView.selectedLayer.mirrorH = !this.slideView.selectedLayer.mirrorH;
				$(".mirrorH").toggleClass("on");
			}
		});
		$(".mirrorV").click(() => {
			if(this.slideView.selectedLayerView && !this.slideView.selectedLayer.locked && this.slideView.selectedLayer.visible) {
				this.slideView.selectedLayer.mirrorV = !this.slideView.selectedLayer.mirrorV;
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
			textLayer.moveTo(this.slideView.slide.centerX, this.slideView.slide.centerY);
		});


		$("label[for='cb_imageRef']").click((e)=>{
			$("input#cb_imageRef").prop("checked", !$("input#cb_imageRef").prop("checked"));
			return false;
		});
		
		$("button.imageRef").click(()=>{
			$("input.imageRef")[0].click();
		});

		$("input.imageRef").on("change",(e)=>{
			if(this.slideView.selectedLayer == null || this.slideView.selectedLayer.type != LayerType.IMAGE) return;
			var targetImage:ImageLayer = this.slideView.selectedLayer as ImageLayer;
			var reader = new FileReader();
			reader.addEventListener('load', async (e2:any) => {
				var shaObj = new jsSHA("SHA-256","TEXT");
				shaObj.update(reader.result);
				var imageId = shaObj.getHash("HEX");

				await ImageManager.shared.registImageData(imageId, reader.result as string);
				if($("input#cb_imageRef").prop("checked")){
					var fromImageId:string = targetImage.imageId;	//直参照すると途中で変わってしまうため変数に退避
					VDoc.shared.slides.forEach(slide=>{
						slide.layers.forEach(layer=>{
							if(layer.type != LayerType.IMAGE) return;
							var imageLayer:ImageLayer = layer as ImageLayer;
							if(imageLayer.imageId == fromImageId){
								imageLayer.imageId = imageId;
							}
						});
					});

				}else{
					targetImage.imageId = imageId;
				}

			});
			try{
				reader.readAsDataURL(e.target.files[0]);
			}
			catch(err){
				console.log(err);
			}
		});

		$("button.download").click(()=>{
			if(this.slideView.selectedLayerView == null) return;
			if(this.slideView.selectedLayerView.type != LayerType.IMAGE) return;

			var a = document.createElement("a");
			a.href = ImageManager.shared.getSrcById((this.slideView.selectedLayer as ImageLayer).imageId);
			a.target = '_blank';
			a.download = this.slideView.selectedLayer.name;
			a.click();
			window.URL.revokeObjectURL(a.href);
		});



		$(".canvas button.up").click(()=>{
			this.slideView.changeLayerOrder(this.slideView.selectedLayer, true);
		});
		$(".canvas button.down").click(()=>{
			this.slideView.changeLayerOrder(this.slideView.selectedLayer, false);
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