import { EventDispatcher } from "./events/EventDispatcher";
import { EditableSlideView } from "./slide/EditableSlideView";
import { ImageLayer } from "./__core__/model/ImageLayer";
import { ImageManager } from "./utils/ImageManager";
import { Viewer,ViewerMode } from "./Viewer";
import { LayerType, Layer } from "./__core__/model/Layer";
import { TextLayer } from "./__core__/model/TextLayer";
import { Slide, Direction } from "./__core__/model/Slide";
import { SELayerDiv } from "./SELayerDiv";
import { VDoc } from "./__core__/model/VDoc";
import { VMInput, VMButton, VMToggleButton, VMVariableInput } from "./__core__/view/VMInput";
import { PropFlags } from "./__core__/model/PropFlags";


declare var $:any;
declare var jsSHA:any;

export class SlideEdit extends EventDispatcher {

	public slideView:EditableSlideView;

//	private propDiv:SEPropDiv;
	private layerDiv:SELayerDiv;l

//	private shadow:any;


	constructor(public obj:any){
		super();
		this.obj.addClass("slideCanvas");

		this.slideView = new EditableSlideView(new Slide(), $('<div />').appendTo(this.obj));
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
				this.slideView.editingLayer.rotateBy(-90);
			}),
			new VMButton($("#main button.rotateR"), Layer, ()=>{
				this.selectedLayer.rotateBy(90);
			}),
			new VMButton($("#main button.toTop"), Layer, ()=>{
				this.slide.arrangeLayer(this.slideView.editingLayer, Direction.TOP);
			}),
			new VMButton($("#main button.toRight"), Layer, ()=>{
				this.slide.arrangeLayer(this.slideView.editingLayer, Direction.RIGHT);
			}),
			new VMButton($("#main button.toBottom"), Layer, ()=>{
				this.slide.arrangeLayer(this.slideView.editingLayer, Direction.BOTTOM);
			}),
			new VMButton($("#main button.toLeft"), Layer, ()=>{
				this.slide.arrangeLayer(this.slideView.editingLayer, Direction.LEFT);
			}),
			new VMToggleButton($("#main button.mirrorH"), Layer, "mirrorH"),
			new VMToggleButton($("#main button.mirrorV"), Layer, "mirrorV"),
			new VMButton($("#main button.copyTrans"), Layer, ()=>{
				this.slideView.copyTrans();
			}),
			new VMButton($("#main button.pasteTrans"), Layer, ()=>{
				this.slideView.pasteTrans();
			}),
			new VMButton($("#main button.fit"), Layer, ()=>{
				this.slide.fitLayer(this.selectedLayer);
			}),
			new VMButton($("#main button.imageRef"), ImageLayer, ()=>{
				$("input.imageRef")[0].click();
			}),
			new VMButton($("#main button.download"), ImageLayer, ()=>{
				if(this.selectedLayer == null) return;
				if(this.selectedLayer.type != LayerType.IMAGE) return;
	
				var a = document.createElement("a");
				a.href = ImageManager.shared.getSrcById((this.selectedLayer as ImageLayer).imageId);
				a.target = '_blank';
				a.download = this.selectedLayer.name;
				a.click();
				window.URL.revokeObjectURL(a.href);
			}),

			new VMButton($("#main button.up"), Layer, ()=>{
				this.slide.swapLayer(this.selectedLayer, 1);
			}),
			new VMButton($("#main button.down"), Layer, ()=>{
				this.slide.swapLayer(this.selectedLayer, -1);
			}),
			new VMButton($("#main button.top"), Layer, ()=>{
				this.slide.swapLayer(this.selectedLayer, Slide.LAYER_NUM_MAX);
			}),
			new VMButton($("#main button.bottom"), Layer, ()=>{
				this.slide.swapLayer(this.selectedLayer, -Slide.LAYER_NUM_MAX);
			}),
			new VMVariableInput($(".property .position input").eq(0), Layer, "x", PropFlags.X, {v:-25}),
			new VMVariableInput($(".property .position input").eq(1), Layer, "y", PropFlags.X, {v:-25}),
			new VMVariableInput($(".property .scale input"), Layer, "scale", PropFlags.SCALE_X|PropFlags.SCALE_Y, {init:1, min:0.1, max:20, type:"multiply", v:0.1}),
			new VMVariableInput($(".property .rotation input"), Layer, "rotation", PropFlags.ROTATION, {min:-180, max:180, v:5}),
			new VMVariableInput($(".property .opacity input"), Layer, "opacity", PropFlags.OPACITY, {min:0, max:1, v:0.05}),

			new VMVariableInput($(".property .clip input").eq(0), ImageLayer, "clipT", PropFlags.IMG_CLIP, {v:-25, min:0}),
			new VMVariableInput($(".property .clip input").eq(1), ImageLayer, "clipR", PropFlags.IMG_CLIP, {v:-25, min:0}),
			new VMVariableInput($(".property .clip input").eq(2), ImageLayer, "clipB", PropFlags.IMG_CLIP, {v:-25, min:0}),
			new VMVariableInput($(".property .clip input").eq(3), ImageLayer, "clipL", PropFlags.IMG_CLIP, {v:-25, min:0}),
		];


		


		this.slideView.addEventListener("select", (any)=>{
			try{
				vms.forEach(vmi=>{
					vmi.target = this.selectedLayer;
				})
			}
			catch (e){
				console.log(e)
				vms.forEach(vmi=>{
					vmi.target = null;
				})
			}
		});

//		this.slideView.addEventListener("scale",(any)=>{
//			this.updateShadow();
//		});
//		this.shadow = $('<div class="shadow" />')//.appendTo(this.obj);



		//

		$(".paste").click(() => {
			this.slideView.paste();
		});
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
			this.slide.addLayer(textLayer);
			textLayer.moveTo(this.slide.centerX, this.slide.centerY);
		});


		$("label[for='cb_imageRef']").click((e)=>{
			$("input#cb_imageRef").prop("checked", !$("input#cb_imageRef").prop("checked"));
			return false;
		});
		$("input.imageRef").on("change", async (e)=>{
			if(this.selectedLayer == null || this.selectedLayer.type != LayerType.IMAGE) return;
			var targetImage:ImageLayer = this.selectedLayer as ImageLayer;
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

			}else{
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
		if(this.slide){
			this.slide.removeEventListener("update", ()=>{
				this.layerDiv.update();
			});
		}

		this.slideView.slide = newSlide;
		$(".slideCanvas .menu span.name").text(newSlide.id);

		this.layerDiv.layerViews = this.slideView.layerViews;
		if(this.slide){
			this.slide.addEventListener("update", ()=>{
				this.layerDiv.update();
			});
		}
	}

	//
	// getset
	//
	private get slide():Slide {
		return this.slideView.slide;
	}
	private get selectedLayer():Layer {
		return this.slideView.selectedLayer;
	}

}