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
import { PropFlags } from "../__core__/model/PropFlags";
import { PropertyEvent } from "../events/LayerEvent";
import { AdjustView } from "../__core__/view/AdjustView";

declare var $: any;
declare var Matrix4: any;

export class EditableSlideView extends DOMSlideView implements IDroppable {
	public static SCALE_DEFAULT:number = 0.9;

	public selectedLayerView:LayerView|null = null;
	private copyedLayer:Layer|null;
	private copyedTrans:any = null;

	private adjustView:AdjustView;

	//private shadow:any;
	private border:any;

	private _isActive:boolean = false;
	public _rectEdit:boolean = false;

	//

	private lastSelectedId:string = "";
	private lastSelectedIndex:number = -1;
	private sharedLayersByUUID:{[key:string]:Layer[];}  = {};
	private rectLayers:Layer[] = [];
	



	constructor(protected _slide:Slide, public obj:any){
		super(_slide, obj);

		this.scale = EditableSlideView.SCALE_DEFAULT;

		this.obj.addClass("editable");

		this.adjustView = new AdjustView();
		this.container.append(this.adjustView.obj);
		this.border = $('<div class="border" />').appendTo(this.container);

		//

		if(this.obj.width() == 0 && this.obj.height() == 0){
			this.obj.ready(() => {
				console.log("obj ready at SlideEditable")
				this.updateSize();
			});
		}else {
			this.updateSize();
		}

		$(this.obj).on("wheel", (e:any) => {
			if(!this._isActive ) return;
			var dScale = (0.1 * e.originalEvent.deltaY / Math.abs(e.originalEvent.deltaY));
			this.scale /= (1 + dScale);

			this.adjustView.base_scale = this._scale * this.scale_base;
			e.preventDefault();
			e.stopImmediatePropagation();
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
			this._slide.addLayer(layer)
			this.getLayerViewByLayer(layer).selected = true;
			this._slide.fitLayer(layer);
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
		//console.log("adLayerView at ESV");
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
				this.adjustView.startDrag(e);
			});
			e.stopImmediatePropagation();
		});
		layerView.obj.on("mouseup.layer_preselect", (e:any) => {
			layerView.obj.off("mousemove.layer_preselect");
			if(!layerView.selected && !this.adjustView.isDrag && !layerView.data.locked){
				layerView.selected = true;
			};
		});

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

		//share
		if(this.listSharedLayers[layer.uuid] != undefined){
			delete this.listSharedLayers[layer.uuid];
		}

		return layerView
	}

	//

	selectLayerView(targetLayerView:LayerView|null = null){
		this.selectedLayerView = targetLayerView;
		this.adjustView.targetLayerView = this.selectedLayerView;
		this.dispatchEvent(new Event("select"));
		
		$.each(this.layerViews, (i:number ,layerView:LayerView) => {
			if(layerView != targetLayerView) layerView.selected = false;
		});

		if(this.selectedLayerView !== null){
			if(this.selectedLayerView.type == LayerType.IMAGE){
				this.lastSelectedId = (this.selectedLayerView.data as ImageLayer).imageId;
			}
			this.lastSelectedIndex = this._slide.layers.indexOf(this.selectedLayerView.data);

			if(this._rectEdit && this.selectedLayerView.data.type == LayerType.IMAGE && !this.selectedLayerView.data.shared){
				this.listRectLayers(this.selectedLayerView.data);
			}
		}else{
			this.rectLayers = [];
		}
	}

	cut(){
		if(!this._isActive) return;
		if(this.selectedLayerView){
			this.copy();
			this._slide.removeLayer(this.selectedLayerView.data);
		}
	}

	copy(){
		if(!this._isActive) return;
		if(this.selectedLayerView){
			this.copyedLayer = this.selectedLayerView.data.clone();
			//面倒くさいので、コピーするレイヤーはsharedをオフにする⇒やっぱめんどい
			//this.copyedLayer.shared = false;
			$(".paste").prop("disabled", false);
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
	}


	public updateSize():void {
		this.scale_base = Math.min(this.obj.width() / this._slide.width, this.obj.height() / this._slide.height);
		this.scale = this._scale;

		this.border.css("border-width", 6 / (this._scale * this.scale_base) + "px");
		this.adjustView.base_scale = this._scale * this.scale_base;
	}

	protected replaceSlide(newSlide:Slide) {
		this.rectEdit = false;
		this.selectLayerView(null);

		this._slide.removeEventListener("layerRemove", this.onLayerRemove2);
		this._slide.removeEventListener("layerUpdate", this.onLayerUpdate);
		this.sharedLayersByUUID = {};

		//

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
					}
				});
			}

			if(!autoSelectedLayer){
				if(this.lastSelectedIndex != -1 && this._slide.layers.length > this.lastSelectedIndex){
					if(!this._slide.layers[this.lastSelectedIndex].locked && this._slide.layers[this.lastSelectedIndex].visible){
						autoSelectedLayer = this._slide.layers[this.lastSelectedIndex];
					}
				}
			}
			if(!autoSelectedLayer){
				for(var i:number = this._slide.layers.length - 1; i >= 0; i--){
					if(!this._slide.layers[i].locked && this._slide.layers[i].visible){
						autoSelectedLayer = this._slide.layers[i];
						break;
					}
				}
			}

			if(autoSelectedLayer){
				this.getLayerViewByLayer(autoSelectedLayer).selected = true;
			}
		}
	}




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

	private listRectLayers(layer:Layer) {
		if(layer.type != LayerType.IMAGE) return;
		if(layer.shared) return;
		this.rectLayers = [];

		var func = (slide:Slide)=>{
			var find = false;
			for(var i = 0; i < slide.layers.length; i++){
				var tmpLayer:Layer = slide.layers[i];
				if(tmpLayer.type != layer.type) continue;
				if(layer.type == LayerType.IMAGE){
					if(layer.x != tmpLayer.x) continue;
					if(layer.y != tmpLayer.y) continue;
					if(layer.originWidth != tmpLayer.originWidth) continue;
					if(layer.originHeight != tmpLayer.originHeight) continue;
					if(layer.scaleX != tmpLayer.scaleX) continue;
					if(layer.scaleY != tmpLayer.scaleY) continue;
					if(layer.mirrorH != tmpLayer.mirrorH) continue;
					if(layer.mirrorV != tmpLayer.mirrorV) continue;
					find = true;
					this.rectLayers.push(tmpLayer);
					break;
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

	private multipleLayerOperation(layer, layers:Layer[], flag:number) {
		if(!layer) return;
		if(!layers) return;
		if(layers.length == 0) return;
		if(flag == 0) return;

		layers.forEach(tmpLayer=>{
			if(flag & (PropFlags.X|PropFlags.Y|PropFlags.SCALE_X|PropFlags.SCALE_Y|PropFlags.ROTATION|PropFlags.MIRROR_H|PropFlags.MIRROR_V)){
				tmpLayer.transform = layer.transform;
			}
			if(flag & PropFlags.VISIBLE){
				tmpLayer.visible = layer.visible;
			}
			if(flag & PropFlags.LOCKED){
				tmpLayer.locked = layer.locked;
			}
			if(flag & PropFlags.OPACITY){
				tmpLayer.opacity = layer.opacity;
			}

			if(layer.type == LayerType.IMAGE){
				if(flag & PropFlags.IMG_IMAGEID){
					(tmpLayer as ImageLayer).imageId = (layer as ImageLayer).imageId;
				}
				if(flag & PropFlags.IMG_CLIP){
					(tmpLayer as ImageLayer).clipRect = (layer as ImageLayer).clipRect;
				}
			}
			if(layer.type == LayerType.TEXT){
				if(flag & PropFlags.IMG_IMAGEID){
					(tmpLayer as TextLayer).text = (layer as TextLayer).text;
				}
			}
		});
	}

	private sharedLayerSpread(layer:Layer){
		if(!layer.shared) return;

		var func = (slide:Slide)=>{
			var find = false;
			for(var i = 0; i < slide.layers.length; i++){
				var tmpLayer:Layer = slide.layers[i];
				if(!tmpLayer.shared) continue;
				if(tmpLayer.type != layer.type) continue;
				if(layer.type == LayerType.IMAGE){
					if((layer as ImageLayer).imageId == (tmpLayer as ImageLayer).imageId){
						find = true;
						break;
					}
				}
			}
			if(!find){
				slide.addLayer(layer.clone());
			}
			return find;
		}

		var slide:Slide;
		slide = VDoc.shared.getNextSlide(this._slide);
		while(slide && !func(slide)){
			slide = VDoc.shared.getNextSlide(slide);
		}
		slide = VDoc.shared.getPrevSlide(this._slide);
		while(slide && !func(slide)){
			slide = VDoc.shared.getPrevSlide(slide);
		}
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

	public get selectedLayer():Layer {
		if(this.selectedLayerView) {
			return this.selectedLayerView.data;
		}else{
			return null;
		}
	}
	public get editingLayer():Layer{
		if(!this.selectLayerView && this.selectedLayer.locked && !this.selectedLayer.visible) return null;
		return this.selectedLayer;
	}

	public get rectEdit():boolean {
		return this._rectEdit;
	}
	public set rectEdit(value:boolean) {
		if(this._rectEdit == value) return;
		this._rectEdit = value;
		if(this._rectEdit && this.selectedLayerView){
			this.listRectLayers(this.selectedLayerView.data);
		}else{
			this.rectLayers = [];
		}
		this.dispatchEvent(new PropertyEvent(PropertyEvent.UPDATE, this, PropFlags.ESV_RECT));
	}

	//
	// event handlers
	//
	private onLayerViewSelect = (ce:CustomEvent)=>{
		if(!this.isActive) return;
		this.selectLayerView(ce.detail as LayerView);
	}
	private onLayerUpdate = (ce:CustomEvent)=>{
		if(!this.isActive) return;
		var layer:Layer = ce.detail.layer;
		if(!layer) return;

		var flag:number = ce.detail.propFlags;
		if(flag & PropFlags.SHARED){
			if(layer.shared){
				if(window.confirm('paste layer to all slides. Are you sure?')){
					this.sharedLayerSpread(layer);
				}
				this.listSharedLayers(layer);
			}else{
				delete this.sharedLayersByUUID[layer.uuid];
			}
		}else{
			if(layer.shared){
				if(this.sharedLayersByUUID[layer.uuid] == undefined){
					this.listSharedLayers(layer);
				}
				this.multipleLayerOperation(layer, this.sharedLayersByUUID[layer.uuid],flag);

				if(flag & PropFlags.IMG_IMAGEID){
					delete this.sharedLayersByUUID[layer.uuid];
					this.listSharedLayers(layer);
				}
			}else{
				var flagForRect = flag&(PropFlags.X|PropFlags.Y|PropFlags.SCALE_X|PropFlags.SCALE_Y|PropFlags.MIRROR_H|PropFlags.MIRROR_V|PropFlags.ROTATION);
				if(this._rectEdit && flagForRect != 0){
					this.multipleLayerOperation(layer, this.rectLayers, flagForRect);
				}
			}
		}
	};
	private onLayerRemove2 = (ce:CustomEvent)=>{
		if(!this.isActive) return;

		var layer:Layer = ce.detail.layer;
		if(layer.shared && this.sharedLayersByUUID[layer.uuid] != undefined){
			if(window.confirm('remove shared layers. Are you sure?')){
				this.sharedLayersByUUID[layer.uuid].forEach(tmpLayer=>{
					tmpLayer.parent.removeLayer(tmpLayer);
				});
				delete this.sharedLayersByUUID[layer.uuid];
			}
		}
	};
}