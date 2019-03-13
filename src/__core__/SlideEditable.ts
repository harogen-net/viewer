import {Slide} from "./Slide";
import {Layer, LayerType} from "./Layer";
import {Image} from "./layer/Image";
import {KeyboardManager} from "../utils/KeyboardManager";
import { DropHelper } from "../utils/DropHelper";
import { IDroppable } from "../interface/IDroppable";
import { TextLayer } from "./layer/TextLayer";

declare var $: any;
declare var Matrix4: any;

export class SlideEditable extends Slide implements IDroppable {
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


	constructor(public obj:any){
		super(obj);

		this.scale = SlideEditable.SCALE_DEFAULT;
		this.selectedLayer = null;
		this.obj.addClass("editable");


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

			//this.selectedImg.rotation = 45;
		});
		
		this.obj.on("mousedown",(e:any) => {
			if(!this._isActive) return;
			this.selectLayer(null);
		});

		var dropHelper = new DropHelper(this);
		dropHelper.addEventListener(DropHelper.EVENT_DROP_COMPLETE, (e:CustomEvent)=>{
			var layer = this.addLayer(new Image(e.detail));
			if(layer.originHeight > (layer.originWidth * 1.2)) {
				layer.rotation -= 90;
			}
			this.fitLayer(layer);
			this.selectLayer(layer);
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

	addLayer(layer:Layer):Layer{
		super.addLayer(layer);

		layer.obj.on("mousedown.layer_preselect", (e:any) => {
			if(layer.selected) return;
			if(layer.locked) return;

			layer.obj.off("mousemove.layer_preselect");
			layer.obj.on("mousemove.layer_preselect", (e:any) => {
				layer.obj.off("mousemove.layer_preselect");
				this.selectLayer(layer);
				this.startDrag(e);
			});
			e.stopImmediatePropagation();
		});
		layer.obj.on("mouseup.layer_preselect", (e:any) => {
			layer.obj.off("mousemove.layer_preselect");
			if(!layer.selected && !this.isDrag && !layer.locked){
				this.selectLayer(layer);
			};
		});

/*		if(layer.type == LayerType.TEXT){
			var textLayer = layer as TextLayer;
			textLayer.textObj.off("dblclick.textLayer_edit");
			textLayer.textObj.on("dblclick.textLayer_edit", (e:any)=>{
				textLayer.textObj.attr("contentEditable","true");
				textLayer.textObj.focus();
				textLayer.textObj.off("focusout.textLayer_edit");
				textLayer.textObj.on("focusout.textLayer_edit", ()=>{
					textLayer.textObj.attr("contentEditable","false");
					textLayer.textObj.off("focusout.textLayer_edit");
				});
			});

		}*/


		this.dispatchEvent(new Event("update"));
		return layer;
	}

	removeLayer(layer:Layer):Layer{
		if(layer == this.selectedLayer){
			this.selectLayer();
		}
		super.removeLayer(layer);
		layer.obj.off("dragstart");
		layer.obj.off("mousedown.layer_preselect");
		layer.obj.off("mousemove.layer_preselect");
		layer.obj.off("mouseup.layer_preselect");
		if(layer.type == LayerType.TEXT){
			var textLayer = layer as TextLayer;
			textLayer.textObj.off("focusout.textLayer_edit");
		}
		this.dispatchEvent(new Event("update"));
		return layer;
	}

	selectLayer(layer:Layer|null = null){
		if(this.selectedLayer) {
			this.controls.detach();
		}
		this.selectedLayer = null;

		$.each(this._layers, (i:number ,value:any) => {
			if(layer === value){
				value.selected = true;

				this.selectedLayer = value;
			}else {
				value.selected = false;
			}
		});

		if(this.selectedLayer !== null){
			this.selectedLayer.obj.append(this.controls);
			this.updateControlsSize();
			this.controls.show();
			
			if(this.selectedLayer.type == LayerType.IMAGE){
				this.lastSelectedId = (this.selectedLayer as Image).imageId;
			}
			this.lastSelectedIndex = this.layers.indexOf(this.selectedLayer);
		}else{
			this.controls.hide();

//			this.lastSelectedId = "";
//			this.lastSelectedIndex = -1;
		}

		this.dispatchEvent(new Event("select"));
	}

	initialize(){
		var tmpLayers:Layer[] = this._layers.concat() as Layer[];
		$.each(tmpLayers, (index:number, layer:Layer)=>{
			this.removeLayer(layer);
		});
		this.isActive = false;
	}

	cut(){
		if(!this._isActive) return;
		if(this.selectedLayer){
			this.copyedLayer = this.selectedLayer;
			this.removeLayer(this.selectedLayer);
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
			var newLayer:Layer = this.copyedLayer.clone();
			this.selectLayer(this.addLayer(newLayer));
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

	updateSize(){
		super.updateSize();
		this.updateControlsSize();
	}

	fitSelectedLayer(){
		if(!this.selectedLayer) return;
		//this.selectedImg.rotation = 0;
		this.fitLayer(this.selectedLayer);

		this.dispatchEvent(new Event("update"));

		this.updateControlsSize();
	}

	forwardLayer(layer:Layer){
		if(this._layers.indexOf(layer) == -1) return;

		var index:number = this._layers.indexOf(layer);
		this._layers.splice(index,1);
		this._layers.splice(Math.min(index + 1, this._layers.length),0,layer);

		this.setLayersZIndex();
		this.dispatchEvent(new Event("update"));
	}

	backwordLayer(layer:Layer){
		if(this._layers.indexOf(layer) == -1) return;

		var index:number = this._layers.indexOf(layer);
		this._layers.splice(index,1);
		this._layers.splice(Math.max(index - 1, 0),0,layer);

		this.setLayersZIndex();
		this.dispatchEvent(new Event("update"));
	}

	//

	private startDrag(e:any){
		if(!this.selectedLayer) return;
		if(this.selectedLayer.locked) return;
		//if(this.isDrag) this.stopDrag(e:any);
		this.isDrag = true;

		var mouseX = e.screenX;
		var mouseY = e.screenY;

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

		var controlX = (this.selectedLayer.width / 2) * (this.selectedLayer.scaleX);
		var controlY = (this.selectedLayer.height / 2) * (this.selectedLayer.scaleY);

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

			scaleX = (controlX + (defX2 * xDirection)) / (this.selectedLayer.width / 2);
			scaleY = (controlY + (defY2 * yDirection)) / (this.selectedLayer.height / 2);

			if(KeyboardManager.isDown(16) || this.ENFORCE_ASPECT_RATIO) {
				var scale = Math.min(scaleX, scaleY);
				this.selectedLayer.scaleX = this.selectedLayer.scaleY = scale;
			}else{
				this.selectedLayer.scaleX = scaleX;
				this.selectedLayer.scaleY = scaleY;
			}
			this.updateControlsSize();
		});
		$(document).on("mouseup.layer_scale", (e:any) => {
			if(!this.isDrag) return;
			this.isDrag = false;
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
			var textLayer = this.selectedLayer as TextLayer;
			var text = textLayer.text;
			textLayer.textObj.attr("contenteditable","true");
			textLayer.textObj.focus();

			textLayer.textObj.off("focusout.textLayer_edit");
			textLayer.textObj.on("focusout.textLayer_edit", ()=>{
				textLayer.textObj.attr("contentEditable","false");
				textLayer.textObj.off("focusout.textLayer_edit");

				setTimeout(()=>{
					if(text != textLayer.text){
						this.dispatchEvent(new Event("update"));
					}
				},10)
			});
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

	setData(aData:any[]){
		super.setData(aData);

		if(this.layers.length > 0){
			// MARK: auto image select

			//console.log(this.lastSelectedId.slice(0,10), this.lastSelectedIndex);

			var autoSelectedLayer:Layer = null;

			if(this.lastSelectedId != ""){
				$.each(this.layers, (number, layer:Layer)=>{
					if(layer.type != LayerType.IMAGE) return false;
					if(this.lastSelectedId == (layer as Image).imageId){
						if(!layer.locked && layer.visible){
							autoSelectedLayer = layer;
						}
						return false;
					}
				});
			}
			if(autoSelectedLayer != null){this.selectLayer(autoSelectedLayer); return;}

			if(this.lastSelectedIndex != -1 && this.layers.length > this.lastSelectedIndex){
				if(!this.layers[this.lastSelectedIndex].locked && this.layers[this.lastSelectedIndex].visible){
					autoSelectedLayer = this.layers[this.lastSelectedIndex];
				}
			}
			if(autoSelectedLayer != null){this.selectLayer(autoSelectedLayer); return;}

			for(var i:number = this.layers.length - 1; i >= 0; i--){
				if(!this.layers[i].locked && this.layers[i].visible){
					this.selectLayer(this.layers[i]);
					break;
				}
			}

			//this.selectImage(this.images[this.images.length - 1]);
		}
	}

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
