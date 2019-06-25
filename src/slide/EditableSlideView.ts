import {SlideView} from "../__core__/view/SlideView";
import {Layer, LayerType} from "../__core__/model/Layer";
import {ImageLayer} from "../__core__/model/ImageLayer";
import {KeyboardManager} from "../utils/KeyboardManager";
import { DropHelper } from "../utils/DropHelper";
import { IDroppable } from "../interface/IDroppable";
import { TextLayer } from "../__core__/model/TextLayer";
import { DOMSlideView } from "./DOMSlideView";
import { LayerView } from "../__core__/view/LayerView";
import { TextView } from "../__core__/view/TextView";
import { ImageView } from "../__core__/view/ImageView";
import { LayerViewFactory } from "../__core__/view/LayerViewFactory";
import { Slide } from "../__core__/model/Slide";
import { VDoc } from "../__core__/model/VDoc";

declare var $: any;
declare var Matrix4: any;

export class EditableSlideView extends DOMSlideView implements IDroppable {
	public static SCALE_DEFAULT:number = 0.9;

	private readonly ENFORCE_ASPECT_RATIO:boolean = true;

	public selectedLayerView:LayerView|null = null;

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



	constructor(protected _slide:Slide, public obj:any){
		super(_slide, obj);

		this.scale = EditableSlideView.SCALE_DEFAULT;
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

			if(this.selectedLayerView !== null){
				var theta:number = (e.originalEvent.deltaY / 20) * (Math.PI / 180);
				if(KeyboardManager.isDown(16)){
					theta = (45 * e.originalEvent.deltaY / Math.abs(e.originalEvent.deltaY)) * (Math.PI / 180);
				}
				this.selectedLayerView.data.rotateBy(theta);
			}
		});
		
		this.obj.on("mousedown",(e:any) => {
			if(!this._isActive) return;
			this.selectLayerView(null);
		});

		var dropHelper = new DropHelper(this);
		dropHelper.addEventListener(DropHelper.EVENT_DROP_COMPLETE, (e:CustomEvent)=>{
			var layer = (new ImageLayer(e.detail));
			if(layer.originHeight > (layer.originWidth * 1.2)) {
				layer.rotation -= 90;
			}
			this._slide.fitLayer(this._slide.addLayer(layer));
			var layerView:LayerView = this.getLayerViewByLayer(layer);
			layerView.selected = true;
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


	//

	protected addLayerView(layer:Layer):LayerView{
		console.log("adLayerView at ESV");
		var layerView = super.addLayerView(layer);

		layerView.selected = false;
		layerView.addEventListener("select", this.onLayerViewSelect);

		layerView.obj.on("mousedown.layer_preselect", (e:any) => {
			if(layerView.selected) return;
			if(layerView.data.locked) return;

			layerView.obj.off("mousemove.layer_preselect");
			layerView.obj.on("mousemove.layer_preselect", (e:any) => {
				layerView.obj.off("mousemove.layer_preselect");
				layerView.selected = true;
//				this.selectLayerView(layerView.data);
				this.startDrag(e);
			});
			e.stopImmediatePropagation();
		});
		layerView.obj.on("mouseup.layer_preselect", (e:any) => {
			layerView.obj.off("mousemove.layer_preselect");
			if(!layerView.selected && !this.isDrag && !layerView.data.locked){
//				this.selectLayerView(layerView.data);
				layerView.selected = true;
			};
		});

//		this.dispatchEvent(new Event("update"));

		//shared
		if(layer.shared){
			this.listSharedLayers(layer);
		}

		return layerView;
	}
	protected removeLayerView(layer:Layer):LayerView{
		var layerView = super.removeLayerView(layer);

		layerView.removeEventListener("select", this.onLayerViewSelect);

		if(layerView.selected){
			this.selectLayerView();
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

		//share
		if(this.listSharedLayers[layer.uuid] != undefined){
			delete this.listSharedLayers[layer.uuid];
		}

		return layerView
	}

	//

	selectLayerView(targetLayer:LayerView|null = null){
		if(this.selectedLayerView) {
			this.controls.detach();
		}
		this.selectedLayerView = targetLayer;
		this.dispatchEvent(new Event("select"));
		
		$.each(this.layerViews, (i:number ,layerView:LayerView) => {
			if(layerView != targetLayer) layerView.selected = false;
		});

		if(this.selectedLayerView !== null){
			//var selectedLayerView = this.getLayerViewByLayer(this.selectedLayerView);
			this.selectedLayerView.obj.append(this.controls);
			this.updateControlsSize();
			this.controls.show();
			
			if(this.selectedLayerView.type == LayerType.IMAGE){
				this.lastSelectedId = (this.selectedLayerView.data as ImageLayer).imageId;
			}
			this.lastSelectedIndex = this._slide.layers.indexOf(this.selectedLayerView.data);
		}else{
			this.controls.hide();

//			this.lastSelectedId = "";
//			this.lastSelectedIndex = -1;
		}

		//this.dispatchEvent(new Event("select"));
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
		if(this.selectedLayerView){
			this.copyedLayer = this.selectedLayerView.data.clone();
			//面倒くさいので、コピーするレイヤーはsharedをオフにする
			this.copyedLayer.shared = false;

			this._slide.removeLayer(this.selectedLayerView.data);
		}
	}

	copy(){
		if(!this._isActive) return;
		if(this.selectedLayerView){
			this.copyedLayer = this.selectedLayerView.data.clone();
			//面倒くさいので、コピーするレイヤーはsharedをオフにする
			this.copyedLayer.shared = false;
		}
	}

	paste(){
		if(!this._isActive) return;
		if(this.copyedLayer){
			var layer:Layer = this._slide.addLayer(this.copyedLayer.clone());
			this.getLayerViewByLayer(layer).selected = true;
		}
	}

	copyTrans(){
		if(!this.selectedLayerView) return;
		this.copyedTrans = this.selectedLayerView.data.transform;
	}

	pasteTrans(){
		if(!this.selectedLayerView) return;
		if(!this.copyedTrans) return;
		this.selectedLayerView.data.transform = this.copyedTrans;

		//console.log(this.selectedImg.transform, this.copyedTrans);
		//this.dispatchEvent(new Event("update"));
		// if(this.selectedLayerView.data.shared){
		// 	this.dispatchEvent(new CustomEvent("sharedUpdate", {detail:{layer:this.selectedLayerView.data}}));
		// }

		this.updateControlsSize();
	}


	public updateSize():void {
		this.scale_base = Math.min(this.obj.width() / this._slide.width, this.obj.height() / this._slide.height);
		this.scale = this._scale;
		this.updateControlsSize();
	}


	public fitSelectedLayer(){
		if(!this.selectedLayerView) return;
		//this.selectedImg.rotation = 0;
		this._slide.fitLayer(this.selectedLayerView.data);

//		this.dispatchEvent(new Event("update"));

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
		this.selectLayerView();

		this._slide.removeEventListener("layerRemove", this.onLayerRemove2);
		this._slide.removeEventListener("layerUpdate", this.onLayerUpdate);

		//this.cachedLayer = null;
		//this.cachedTargetLayers = [];
		this.sharedLayersByUUID = {};

		super.replaceSlide(newSlide);

		this._slide.addEventListener("layerRemove", this.onLayerRemove2);
		this._slide.addEventListener("layerUpdate", this.onLayerUpdate);

		//
		//autoselect
		if(this._slide.layers.length > 0){
			var autoSelectedLayer:Layer = null;

			if(this.lastSelectedId != ""){

				this._slide.layers.forEach(layer=>{
					if(layer.type != LayerType.IMAGE) return false;
					if(this.lastSelectedId == (layer as ImageLayer).imageId){
						if(!layer.locked && layer.visible){
							autoSelectedLayer = layer;
						}
						return false;
					}
				});
			}
			if(autoSelectedLayer != null){this.selectLayerView(this.getLayerViewByLayer(autoSelectedLayer)); return;}

			if(this.lastSelectedIndex != -1 && this._slide.layers.length > this.lastSelectedIndex){
				if(!this._slide.layers[this.lastSelectedIndex].locked && this._slide.layers[this.lastSelectedIndex].visible){
					autoSelectedLayer = this._slide.layers[this.lastSelectedIndex];
				}
			}
			if(autoSelectedLayer != null){this.selectLayerView(this.getLayerViewByLayer(autoSelectedLayer)); return;}

			for(var i:number = this._slide.layers.length - 1; i >= 0; i--){
				if(!this._slide.layers[i].locked && this._slide.layers[i].visible){
					this.selectLayerView(this.getLayerViewByLayer(this._slide.layers[i]));
					break;
				}
			}
		}
	}


	private startDrag(e:any){
		if(!this.selectedLayerView) return;

		var targetLayer:Layer = this.selectedLayerView.data;
		if(targetLayer.locked) return;
		//if(this.isDrag) this.stopDrag(e:any);
		this.isDrag = true;

		var mouseX = e.screenX;
		var mouseY = e.screenY;

//		$(document).css("pointer-events","none");
		$(document).off("mousemove.layer_drag");
		$(document).off("mouseup.layer_drag");
		$(document).on("mousemove.layer_drag", (e:any) => {
			if(!this.selectedLayerView) return;
			if(!this.isDrag) return;

			targetLayer.moveBy((e.screenX - mouseX) / this.actualScale, (e.screenY - mouseY) / this.actualScale);
			mouseX = e.screenX;
			mouseY = e.screenY;
		});
		$(document).on("mouseup.layer_drag", (e:any) => {
			if(!this.selectedLayerView) return;
			if(!this.isDrag) return;

			this.isDrag = false;
//			$(document).css("pointer-events","auto");
			$(document).off("mousemove.layer_drag");
			$(document).off("mouseup.layer_drag");

			//this.dispatchEvent(new Event("update"));
			// if(targetLayer.shared){
			// 	this.dispatchEvent(new CustomEvent("sharedUpdate", {detail:{layer:targetLayer}}));
			// }
		});
	}

	private startScale(e:any, key:string = ""){
		if(!this.selectedLayerView) return;

		var targetLayer:Layer = this.selectedLayerView.data;
		if(targetLayer.locked) return;
		//if(this.isDrag) this.stopScale(e);
		this.isDrag = true;


		var mouseX = e.screenX;
		var mouseY = e.screenY;

		var controlX = (targetLayer.originWidth / 2) * (targetLayer.scaleX);
		var controlY = (targetLayer.originHeight / 2) * (targetLayer.scaleY);

//		$(document).css("pointer-events","none");
		$(document).off("mousemove.layer_scale");
		$(document).off("mouseup.layer_scale");
		$(document).on("mousemove.layer_scale", (e:any) => {
			if(!this.isDrag) return;

			var defX:number,defY:number;
			defX = (e.screenX - mouseX);
			defY = (e.screenY - mouseY);
			var mat = Matrix4.identity().scale(1/this.actualScale, 1/this.actualScale,1).rotateZ(-targetLayer.rotation * Math.PI / 180).translate(defX, defY,0);
			var defX2 = mat.values[12];
			var defY2 = mat.values[13];

			var scaleX:number,scaleY:number;
			var xDirection:number = 1;
			var yDirection:number = 1;
			if(key.indexOf("e") == -1) xDirection *= -1;
			if(key.indexOf("s") == -1) yDirection *= -1;
			if(targetLayer.mirrorH) xDirection *= -1;
			if(targetLayer.mirrorV) yDirection *= -1;

			scaleX = (controlX + (defX2 * xDirection)) / (targetLayer.originWidth / 2);
			scaleY = (controlY + (defY2 * yDirection)) / (targetLayer.originHeight / 2);

			if(KeyboardManager.isDown(16) || this.ENFORCE_ASPECT_RATIO) {
				var scale = Math.min(scaleX, scaleY);
				targetLayer.scale =  scale;
			}else{
				targetLayer.scaleX = scaleX;
				targetLayer.scaleY = scaleY;
			}
			this.updateControlsSize();
		});
		$(document).on("mouseup.layer_scale", (e:any) => {
			if(!this.isDrag) return;
			this.isDrag = false;
//			$(document).css("pointer-events","auto");
			$(document).off("mousemove.layer_scale");
			$(document).off("mouseup.layer_scale");

			//this.dispatchEvent(new Event("update"));
			// if(targetLayer.shared){
			// 	this.dispatchEvent(new CustomEvent("sharedUpdate", {detail:{layer:targetLayer}}));
			// }
		});
	}

	private startEdit(){
		if(!this.selectedLayerView || this.selectedLayer.locked) return;

		if(this.selectedLayer.type == LayerType.TEXT){
			var textLayer:TextLayer = this.selectedLayer as TextLayer;
			var textView:TextView = this.selectedLayerView as TextView;
			var text = textLayer.text;
			textView.textObj.attr("contenteditable","true");
			textView.textObj.focus();

			textView.textObj.off("focusout.textLayer_edit");
			textView.textObj.on("focusout.textLayer_edit", ()=>{
				textView.textObj.attr("contentEditable","false");
				textView.textObj.off("focusout.textLayer_edit");

				setTimeout(()=>{
					if(text != textView.textObj.text()){
						textLayer.text = textView.textObj.text();
		//				this.dispatchEvent(new Event("update"));
					}
				},10)
			});
//		}else if(targetLayer.type == LayerType.IMAGE) {
//			var image = this.selectedLayer as Image;
		}
	}

	private updateControlsSize(){
		if(this.border){
			this.border.css("border-width", 6/this.actualScale + "px");
		}

		if(!this.selectedLayerView) return;
		var anchorSizeX = 16 / (this.selectedLayerView.data.scaleX * this.actualScale);
		var anchorSizeY = 16 / (this.selectedLayerView.data.scaleY * this.actualScale);
		this.anchorPoint1.css("width",anchorSizeX);
		this.anchorPoint1.css("height",anchorSizeY);
		this.anchorPoint2.css("width",anchorSizeX);
		this.anchorPoint2.css("height",anchorSizeY);
		this.anchorPoint3.css("width",anchorSizeX);
		this.anchorPoint3.css("height",anchorSizeY);
		this.anchorPoint4.css("width",anchorSizeX);
		this.anchorPoint4.css("height",anchorSizeY);
		var borderSizeH = 3 / (this.selectedLayerView.data.scaleX * this.actualScale) + "px";
		var borderSizeV = 3 / (this.selectedLayerView.data.scaleY * this.actualScale) + "px";
		this.frame.css("border-width",borderSizeV + " " + borderSizeH);
	}

	//
	// get set
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

	public get selectedLayer():Layer {
		if(this.selectLayerView) {
			return this.selectedLayerView.data;
		}else{
			return null;
		}
	}

	//
	// event handlers
	//
	private onLayerViewSelect = (ce:CustomEvent)=>{
		this.selectLayerView(ce.detail as LayerView);
	}
	private onLayerUpdate = (ce:CustomEvent)=>{
		//this.sharedLayerOpetation(ce.detail.layer, "update", ce.detail.propKeys);
		var layer:Layer = ce.detail.layer;
		if(!layer) return;

		var propKeys:string[] = ce.detail.propKeys;
		if(propKeys.indexOf("shared") != -1){
			if(layer.shared){
				this.listSharedLayers(layer);
			}else{
				delete this.sharedLayersByUUID[layer.uuid];
			}
		}else{
			if(layer.shared){
				this.sharedLayerOpetation(layer,"");
			}
		}
	};
	private onLayerRemove2 = (ce:CustomEvent)=>{
		var layer:Layer = ce.detail.layer;
		if(layer.shared && this.sharedLayersByUUID[layer.uuid] != undefined){
			if(window.confirm('remove shared layers. Are you sure?')){
				this.sharedLayersByUUID[layer.uuid].forEach(tmpLayer=>{
					tmpLayer.parent.removeLayer(tmpLayer);
				});
			}
		}
	};






	///

	private sharedLayersByUUID:{[key:string]:Layer[];}  = {};
	
	private listSharedLayers(layer:Layer) {
		if(!layer.shared) return;
		if(this.sharedLayersByUUID[layer.uuid] != undefined) return;

		this.sharedLayersByUUID[layer.uuid] = [];
		var func = (slide:Slide)=>{
			var find = false;
			for(var i = 0; i < slide.layers.length; i++){
				var tmpLayer:Layer = slide.layers[i];
				if(!tmpLayer.shared) continue;
				if(tmpLayer.type != layer.type) continue;
				if(layer.type == LayerType.IMAGE){
					if((layer as ImageLayer).imageId == (tmpLayer as ImageLayer).imageId){
						find = true;
						this.sharedLayersByUUID[layer.uuid].push(tmpLayer);
						break;
					}
				}
			}
			return find;
		}

		var slide:Slide;
		slide = VDoc.shared.getNextSlide(this._slide);
		while(slide && func(slide)){
			slide = VDoc.shared.getNextSlide(slide);
		}
		slide = VDoc.shared.getPrevSlide(this._slide);
		while(slide && func(slide)){
			slide = VDoc.shared.getPrevSlide(slide);
		}
	}

	private sharedLayerOpetation(layer:Layer, mode:string, props:string[] = []) {
		if(!layer.shared) return;

		if(this.sharedLayersByUUID[layer.uuid] == undefined){
			this.listSharedLayers(layer);
		}

		this.sharedLayersByUUID[layer.uuid].forEach(tmpLayer=>{
			tmpLayer.transform = layer.transform;
			tmpLayer.visible = layer.visible;
			tmpLayer.locked = layer.locked;
			tmpLayer.opacity = layer.opacity;
		});
	}
}
