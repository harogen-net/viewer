import {SlideView} from "../__core__/view/SlideView";
import {Layer, LayerType} from "../__core__/model/Layer";
import {ImageLayer} from "../__core__/model/ImageLayer";
import {KeyboardManager} from "../utils/KeyboardManager";
import { DropHelper } from "../utils/DropHelper";
import { IDroppable } from "../interface/IDroppable";
import { TextLayer } from "../__core__/model/TextLayer";
import { DOMSlide } from "./DOMSlide";
import { LayerView } from "../__core__/view/LayerView";
import { TextView } from "../__core__/view/TextView";
import { ImageView } from "../__core__/view/ImageView";
import { LayerViewFactory } from "../__core__/view/LayerViewFactory";
import { Slide } from "../__core__/model/Slide";

declare var $: any;
declare var Matrix4: any;

export class SlideEditable extends DOMSlide implements IDroppable {
	public static SCALE_DEFAULT:number = 0.9;

	private readonly ENFORCE_ASPECT_RATIO:boolean = true;

	public selectedLayer:Layer|null;
	private copyedLayer:Layer|null;
	private copyedTrans:any = null;

	//image controls
	private border:any;
	private controls:any;
	private frame:any;
	private anchorPoint1:any;
	private anchorPoint2:any;
	private anchorPoint3:any;
	private anchorPoint4:any;

	private mouseX:number = 0;
	private mouseY:number = 0;
	private isDrag:boolean = false;
	private _isActive:boolean = false;

	//

	private lastSelectedId:string = "";
	private lastSelectedIndex:number = -1;


	public get selectedLayerView():LayerView {
		return this.getLayerViewByLayer(this.selectedLayer);
	}

	constructor(protected _slide:Slide, public obj:any){
		super(_slide, obj);

		this.scale = SlideEditable.SCALE_DEFAULT;
		this.selectedLayer = null;
		this.obj.addClass("editable");

		
		if(this.obj.width() == 0 && this.obj.height() == 0){
			this.obj.ready(() => {
				console.log("obj ready at SlideEditable")
				this.updateSize();
			});
		}else {
			this.updateSize();
		}

		//this.shadow = $('<div class="shadow" />').appendTo(this.obj);
		this.border = $('<div class="border" />').appendTo(this.container);


		this.controls = $('<div class="controls">');
		this.frame = $('<div class="frame" />').appendTo(this.controls);
		this.anchorPoint1 = $('<div class="anchor ne" />').appendTo(this.controls);
		this.anchorPoint1.on("mousedown.image", (e:any) => {
			this.startScale(e,"ne");
			e.stopImmediatePropagation();
		});
		this.anchorPoint2 = $('<div class="anchor nw" />').appendTo(this.controls);
		this.anchorPoint2.on("mousedown.image", (e:any) => {
			this.startScale(e,"nw");
			e.stopImmediatePropagation();
		});
		this.anchorPoint3 = $('<div class="anchor se" />').appendTo(this.controls);
		this.anchorPoint3.on("mousedown.image", (e:any) => {
			this.startScale(e,"se");
			e.stopImmediatePropagation();
		});
		this.anchorPoint4 = $('<div class="anchor sw" />').appendTo(this.controls);
		this.anchorPoint4.on("mousedown.image", (e:any) => {
			this.startScale(e,"sw");
			e.stopImmediatePropagation();
		});

		this.frame.on("mousedown.layer_drag", (e:any) => {
			this.startDrag(e);
			e.stopImmediatePropagation();
		});
		this.frame.on("dblclick.layer_edit", (e:any)=>{
			this.startEdit();
			e.stopImmediatePropagation();
		});

		$(this.obj).on("wheel", (e:any) => {
			if(!this._isActive ) return;
			//if(KeyboardManager.isDown(17)){
				var dScale = (0.1 * e.originalEvent.deltaY / Math.abs(e.originalEvent.deltaY));
				this.scale /= (1 + dScale);
				this.updateControlsSize();
				e.preventDefault();
				e.stopImmediatePropagation();
			//}


			return;

			if(this.selectedLayer !== null){
				var theta:number = (e.originalEvent.deltaY / 20) * (Math.PI / 180);
				if(KeyboardManager.isDown(16)){
					theta = (45 * e.originalEvent.deltaY / Math.abs(e.originalEvent.deltaY)) * (Math.PI / 180);
				}
				this.selectedLayer.rotateBy(theta);
			}
		});
		
		this.obj.on("mousedown",(e:any) => {
			if(!this._isActive) return;
			this.selectLayer(null);
		});

		var dropHelper = new DropHelper(this);
		dropHelper.addEventListener(DropHelper.EVENT_DROP_COMPLETE, (e:CustomEvent)=>{
			var layer = (new ImageLayer(e.detail));
			if(layer.originHeight > (layer.originWidth * 1.2)) {
				layer.rotation -= 90;
			}
			this.selectLayer(this._slide.fitLayer(this._slide.addLayer(layer)));
		});


		KeyboardManager.addEventListener("cut",()=>{
			this.cut();
		});
		KeyboardManager.addEventListener("copy",()=>{
			this.copy();
		});
		KeyboardManager.addEventListener("paste",()=>{
			this.paste();
		});

		//

		$(window).resize(()=>{
			setTimeout(()=>{
				this.updateSize();
			},50);
		});

		//

		this.isActive = false;
	}

// 	addLayer(layer:Layer):Layer{
// 		super.addLayer(layer);

// //		var layerView:LayerView = this.getLayerViewByLayer(layer);
// //		if(!layerView) return layer;



// /*		if(layer.type == LayerType.TEXT){
// 			var textLayer = layer as TextLayer;
// 			textLayer.textObj.off("dblclick.textLayer_edit");
// 			textLayer.textObj.on("dblclick.textLayer_edit", (e:any)=>{
// 				textLayer.textObj.attr("contentEditable","true");
// 				textLayer.textObj.focus();
// 				textLayer.textObj.off("focusout.textLayer_edit");
// 				textLayer.textObj.on("focusout.textLayer_edit", ()=>{
// 					textLayer.textObj.attr("contentEditable","false");
// 					textLayer.textObj.off("focusout.textLayer_edit");
// 				});
// 			});

// 		}*/

// 		return layer;
// 	}

// 	removeLayer(layer:Layer):Layer{
// 		var layerView:LayerView = this.getLayerViewByLayer(layer);
// 		if(!layerView) return layer;
// //		this.removeDomLayer(layerView);

		
// 		return layer;
// 	}

	//

	protected addLayerView(layer:Layer):LayerView{
		var layerView = super.addLayerView(layer);

		layerView.obj.on("mousedown.layer_preselect", (e:any) => {
			if(layerView.selected) return;
			if(layerView.data.locked) return;

			layerView.obj.off("mousemove.layer_preselect");
			layerView.obj.on("mousemove.layer_preselect", (e:any) => {
				layerView.obj.off("mousemove.layer_preselect");
				this.selectLayer(layerView.data);
				this.startDrag(e);
			});
			e.stopImmediatePropagation();
		});
		layerView.obj.on("mouseup.layer_preselect", (e:any) => {
			layerView.obj.off("mousemove.layer_preselect");
			if(!layerView.selected && !this.isDrag && !layerView.data.locked){
				this.selectLayer(layerView.data);
			};
		});

//		this.dispatchEvent(new Event("update"));

		return layerView;
	}
	protected removeLayerView(layer:Layer):LayerView{
		var layerView = super.removeLayerView(layer);

		if(layerView.data == this.selectedLayer){
			this.selectLayer();
		}
		layerView.obj.off("dragstart");
		layerView.obj.off("mousedown.layer_preselect");
		layerView.obj.off("mousemove.layer_preselect");
		layerView.obj.off("mouseup.layer_preselect");
		if(layerView.type == LayerType.TEXT){
			var textLayerView = layerView as TextView;
			textLayerView.textObj.off("focusout.textLayer_edit");
		}
		//this.dispatchEvent(new Event("update"));

		return layerView
	}

	//

	selectLayer(targetLayer:Layer|null = null){
		if(this.selectedLayer) {
			this.controls.detach();
		}
		this.selectedLayer = null;

		$.each(this.layerViews, (i:number ,layerView:LayerView) => {
			if(layerView.data === targetLayer){
				layerView.selected = true;

				this.selectedLayer = targetLayer;
			}else {
				layerView.selected = false;
			}
		});

		if(this.selectedLayer !== null){
			var selectedLayerView = this.getLayerViewByLayer(this.selectedLayer);
			selectedLayerView.obj.append(this.controls);
			this.updateControlsSize();
			this.controls.show();
			
			if(this.selectedLayer.type == LayerType.IMAGE){
				this.lastSelectedId = (this.selectedLayer as ImageLayer).imageId;
			}
			this.lastSelectedIndex = this._slide.layers.indexOf(this.selectedLayer);
		}else{
			this.controls.hide();

//			this.lastSelectedId = "";
//			this.lastSelectedIndex = -1;
		}

		this.dispatchEvent(new Event("select"));
	}

	// initialize(){
	// 	// var tmpLayers:Layer[] = this._slide.layers.concat() as Layer[];
	// 	// $.each(tmpLayers, (index:number, layer:Layer)=>{
	// 	// 	this.removeLayer(layer);
	// 	// });
	// 	this._slide.layers = [];
	// 	this.isActive = false;
	// }

	cut(){
		if(!this._isActive) return;
		if(this.selectedLayer){
			this.copyedLayer = this.selectedLayer;
			this._slide.removeLayer(this.selectedLayer);
		}
	}

	copy(){
		if(!this._isActive) return;
		if(this.selectedLayer){
			this.copyedLayer = this.selectedLayer;
		}
	}

	paste(){
		if(!this._isActive) return;
		if(this.copyedLayer){
			this.selectLayer(this._slide.addLayer(this.copyedLayer.clone()));
		}
	}

	copyTrans(){
		if(!this.selectedLayer) return;
		this.copyedTrans = this.selectedLayer.transform;
	}

	pasteTrans(){
		if(!this.selectedLayer) return;
		if(!this.copyedTrans) return;
		this.selectedLayer.transform = this.copyedTrans;

		//console.log(this.selectedImg.transform, this.copyedTrans);
		this.dispatchEvent(new Event("update"));
		if(this.selectedLayer.shared){
			this.dispatchEvent(new CustomEvent("sharedUpdate", {detail:{layer:this.selectedLayer}}));
		}

		this.updateControlsSize();
	}


	public updateSize():void {
		this.scale_base = Math.min(this.obj.width() / this._slide.width, this.obj.height() / this._slide.height);
		this.scale = this._scale;
		this.updateControlsSize();
	}


	fitSelectedLayer(){
		if(!this.selectedLayer) return;
		//this.selectedImg.rotation = 0;
		this._slide.fitLayer(this.selectedLayer);

		this.dispatchEvent(new Event("update"));

		this.updateControlsSize();
	}

	public changeLayerOrder(layer:Layer, direction:boolean) {
		if(this._slide.layers.indexOf(layer) == -1) return;
		var index:number = this._slide.layers.indexOf(layer) + (direction ? 1 : -1);
		if(index < 0) return;
		if(index > this._slide.layers.length - 1) return;
		this._slide.addLayer(layer, index);
	}

	protected replaceSlide(newSlide:Slide) {
		this.selectLayer();
		super.replaceSlide(newSlide);
	}

// 	forwardLayer(layer:Layer){
// 		if(this._slide.layers.indexOf(layer) == -1) return;

// 		var index:number = this._slide.layers.indexOf(layer);
// 		if(index < this._slide.layers.length - 1){
// 			this._slide.addLayer(layer, index + 1);
// 		}


// //		this._slide.layers.splice(index,1);
// //		this._slide.layers.splice(Math.min(index + 1, this._slide.layers.length),0,layer);

// //		this.setLayersZIndex();
// //		this.dispatchEvent(new Event("update"));
// //this.dispatchEvent(new Event("update"));
// 	}


// 	backwordLayer(layer:Layer){
// 		if(this._slide.layers.indexOf(layer) == -1) return;

// 		var index:number = this._slide.layers.indexOf(layer);
// 		if(index > 0){
// 			this._slide.addLayer(layer, index - 1);
// 		}
// 		// this._slide.layers.splice(index,1);
// 		// this._slide.layers.splice(Math.max(index - 1, 0),0,layer);

// 		// this.setLayersZIndex();
// 		// this.dispatchEvent(new Event("update"));
// 		//this.dispatchEvent(new Event("update"));
// 	}

	//

	private startDrag(e:any){
		if(!this.selectedLayer) return;
		if(this.selectedLayer.locked) return;
		//if(this.isDrag) this.stopDrag(e:any);
		this.isDrag = true;

		var mouseX = e.screenX;
		var mouseY = e.screenY;

//		$(document).css("pointer-events","none");
		$(document).off("mousemove.layer_drag");
		$(document).off("mouseup.layer_drag");
		$(document).on("mousemove.layer_drag", (e:any) => {
			if(!this.selectedLayer) return;
			if(!this.isDrag) return;

			this.selectedLayer.moveBy((e.screenX - mouseX) / this.actualScale, (e.screenY - mouseY) / this.actualScale);
			mouseX = e.screenX;
			mouseY = e.screenY;
		});
		$(document).on("mouseup.layer_drag", (e:any) => {
			if(!this.selectedLayer) return;
			if(!this.isDrag) return;

			this.isDrag = false;
//			$(document).css("pointer-events","auto");
			$(document).off("mousemove.layer_drag");
			$(document).off("mouseup.layer_drag");

			this.dispatchEvent(new Event("update"));
			if(this.selectedLayer.shared){
				this.dispatchEvent(new CustomEvent("sharedUpdate", {detail:{layer:this.selectedLayer}}));
			}
		});
	}

	private startScale(e:any, key:string = ""){
		if(!this.selectedLayer) return;
		if(this.selectedLayer.locked) return;
		//if(this.isDrag) this.stopScale(e);
		this.isDrag = true;

		var mouseX = e.screenX;
		var mouseY = e.screenY;

		var controlX = (this.selectedLayer.originWidth / 2) * (this.selectedLayer.scaleX);
		var controlY = (this.selectedLayer.originHeight / 2) * (this.selectedLayer.scaleY);

//		$(document).css("pointer-events","none");
		$(document).off("mousemove.layer_scale");
		$(document).off("mouseup.layer_scale");
		$(document).on("mousemove.layer_scale", (e:any) => {
			if(!this.isDrag) return;

			var defX:number,defY:number;
			defX = (e.screenX - mouseX);
			defY = (e.screenY - mouseY);
			var mat = Matrix4.identity().scale(1/this.actualScale, 1/this.actualScale,1).rotateZ(-this.selectedLayer.rotation * Math.PI / 180).translate(defX, defY,0);
			var defX2 = mat.values[12];
			var defY2 = mat.values[13];

			var scaleX:number,scaleY:number;
			var xDirection:number = 1;
			var yDirection:number = 1;
			if(key.indexOf("e") == -1) xDirection *= -1;
			if(key.indexOf("s") == -1) yDirection *= -1;
			if(this.selectedLayer.mirrorH) xDirection *= -1;
			if(this.selectedLayer.mirrorV) yDirection *= -1;

			scaleX = (controlX + (defX2 * xDirection)) / (this.selectedLayer.originWidth / 2);
			scaleY = (controlY + (defY2 * yDirection)) / (this.selectedLayer.originHeight / 2);

			if(KeyboardManager.isDown(16) || this.ENFORCE_ASPECT_RATIO) {
				var scale = Math.min(scaleX, scaleY);
				this.selectedLayer.scale =  scale;
			}else{
				this.selectedLayer.scaleX = scaleX;
				this.selectedLayer.scaleY = scaleY;
			}
			this.updateControlsSize();
		});
		$(document).on("mouseup.layer_scale", (e:any) => {
			if(!this.isDrag) return;
			this.isDrag = false;
//			$(document).css("pointer-events","auto");
			$(document).off("mousemove.layer_scale");
			$(document).off("mouseup.layer_scale");

			this.dispatchEvent(new Event("update"));
			if(this.selectedLayer.shared){
				this.dispatchEvent(new CustomEvent("sharedUpdate", {detail:{layer:this.selectedLayer}}));
			}
		});
	}

	private startEdit(){
		if(!this.selectedLayer) return;
		if(this.selectedLayer.locked) return;

		if(this.selectedLayer.type == LayerType.TEXT){
			var textView:TextView = this.getLayerViewByLayer(this.selectedLayer) as TextView;
			var text = (textView.data as TextLayer).text;
			textView.textObj.attr("contenteditable","true");
			textView.textObj.focus();

			textView.textObj.off("focusout.textLayer_edit");
			textView.textObj.on("focusout.textLayer_edit", ()=>{
				textView.textObj.attr("contentEditable","false");
				textView.textObj.off("focusout.textLayer_edit");

				setTimeout(()=>{
					if(text != (textView.data as TextLayer).text){
						this.dispatchEvent(new Event("update"));
					}
				},10)
			});
		}else if(this.selectedLayer.type == LayerType.IMAGE) {
//			var image = this.selectedLayer as Image;
		}
	}

	private updateControlsSize(){
		if(this.border){
			this.border.css("border-width", 6/this.actualScale + "px");
		}

		if(!this.selectedLayer) return;
		var anchorSizeX = 16 / (this.selectedLayer.scaleX * this.actualScale);
		var anchorSizeY = 16 / (this.selectedLayer.scaleY * this.actualScale);
		this.anchorPoint1.css("width",anchorSizeX);
		this.anchorPoint1.css("height",anchorSizeY);
		this.anchorPoint2.css("width",anchorSizeX);
		this.anchorPoint2.css("height",anchorSizeY);
		this.anchorPoint3.css("width",anchorSizeX);
		this.anchorPoint3.css("height",anchorSizeY);
		this.anchorPoint4.css("width",anchorSizeX);
		this.anchorPoint4.css("height",anchorSizeY);
		var borderSizeH = 3 / (this.selectedLayer.scaleX * this.actualScale) + "px";
		var borderSizeV = 3 / (this.selectedLayer.scaleY * this.actualScale) + "px";
		this.frame.css("border-width",borderSizeV + " " + borderSizeH);
	}

	//


// 	setData(aData:any[]){
// 		super.setData(aData);

// 		if(this._layers.length > 0){
// 			// MARK: auto image select

// 			//console.log(this.lastSelectedId.slice(0,10), this.lastSelectedIndex);
// /*

// 			var autoSelectedLayer:Layer = null;

// 			if(this.lastSelectedId != ""){
// 				$.each(this.layers, (number, layer:Layer)=>{
// 					if(layer.type != LayerType.IMAGE) return false;
// 					if(this.lastSelectedId == (layer as Image).imageId){
// 						if(!layer.locked && layer.visible){
// 							autoSelectedLayer = layer;
// 						}
// 						return false;
// 					}
// 				});
// 			}
// 			if(autoSelectedLayer != null){this.selectLayer(autoSelectedLayer); return;}

// 			if(this.lastSelectedIndex != -1 && this.layers.length > this.lastSelectedIndex){
// 				if(!this.layers[this.lastSelectedIndex].locked && this.layers[this.lastSelectedIndex].visible){
// 					autoSelectedLayer = this.layers[this.lastSelectedIndex];
// 				}
// 			}
// 			if(autoSelectedLayer != null){this.selectLayer(autoSelectedLayer); return;}

// 			for(var i:number = this.layers.length - 1; i >= 0; i--){
// 				if(!this.layers[i].locked && this.layers[i].visible){
// 					this.selectLayer(this.layers[i]);
// 					break;
// 				}
// 			}*/

// 			//this.selectImage(this.images[this.images.length - 1]);
// 		}
// 	}

	//

	get isActive():boolean {
		return this._isActive;
	}
	set isActive(value:boolean){
		this._isActive = value;
		if (this._isActive) {
			this.obj.removeClass("passive");
			setTimeout(()=>{
				this.updateSize();
			},300);
		}else{
			this.obj.addClass("passive");
			this.obj.removeClass("fileOver");	
		}
	}

	private get actualScale():number {
		return this._scale * this.scale_base;
	}
}