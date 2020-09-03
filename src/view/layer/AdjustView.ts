import { LayerView } from "../LayerView";
import { Layer, LayerType } from "../../model/Layer";
import { KeyboardManager } from "../../utils/KeyboardManager";
import { PropertyEvent } from "../../events/PropertyEvent";
import { PropFlags } from "../../model/PropFlags";
import { Slide } from "../../model/Slide";
import { HistoryManager, Command } from "../../utils/HistoryManager";
import { Matrix4 } from "matrixgl";
import $ from "jquery";

export class AdjustView extends LayerView {


	private readonly ENFORCE_ASPECT_RATIO:boolean = true;

	private _base_scale:number = 1;

	private controls:any;
	private anchorPoint1:any;
	private anchorPoint2:any;
	private anchorPoint3:any;
	private anchorPoint4:any;
	private frame:any;

	private _targetLayerView:LayerView;

	public isDrag:boolean;


	constructor() {
		super(new Layer(), $('<div class="layerWrapper" />'));
	}
	protected constructMain(){
		//prevent super construction
		//super.constructMain();

		this._data = null;

		this.obj.css("z-index", Slide.LAYER_NUM_MAX + 1);

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

		// this.frame.on("wheel", (e:any) => {
		// 	if(!this._targetLayerView) return;

		// 	var theta:number = (e.originalEvent.deltaY / 20) * (Math.PI / 180);
		// 	if(KeyboardManager.isDown(16)){
		// 		theta = (45 * e.originalEvent.deltaY / Math.abs(e.originalEvent.deltaY)) * (Math.PI / 180);
		// 	}
		// 	this._targetLayerView.data.rotateBy(theta);
		// 	e.preventDefault();
		// 	e.stopImmediatePropagation();
		// });


		this.controls.appendTo(this.obj);
		this.obj.hide();
	}

	public startDrag(e:any){
		if(!this._data) return;
		if(this._data.locked) return;
		//if(this.isDrag) this.stopDrag(e:any);
		this.isDrag = true;

		var mouseX = e.screenX;
		var mouseY = e.screenY;

		var layer = this._data;
		var initPos = {x:layer.x, y:layer.y};
		var endPos = {x:initPos.x, y:initPos.y};

//		$(document).css("pointer-events","none");
		$(document).off("mousemove.layer_drag");
		$(document).off("mouseup.layer_drag");
		$(document).on("mousemove.layer_drag", (e:any) => {
			if(!this._targetLayerView) return;
			if(!this.isDrag) return;

			this._data.moveBy((e.screenX - mouseX) / this._base_scale, (e.screenY - mouseY) / this._base_scale);
			mouseX = e.screenX;
			mouseY = e.screenY;
		});
		$(document).on("mouseup.layer_drag", (e:any) => {
			if(!this._targetLayerView) return;
			if(!this.isDrag) return;

			this.isDrag = false;
//			$(document).css("pointer-events","auto");
			$(document).off("mousemove.layer_drag");
			$(document).off("mouseup.layer_drag");

			endPos.x = layer.x;
			endPos.y = layer.y;
			if(initPos.x != endPos.x || initPos.y != endPos.y){
				HistoryManager.shared.record(new Command(
					()=>{
						layer.x = endPos.x;
						layer.y = endPos.y;
					},
					()=>{
						layer.x = initPos.x;
						layer.y = initPos.y;
					}
				));
			}
		});
	}

	private startScale(e:any, key:string = ""){
		if(!this._data) return;
		if(this._data.locked) return;
		//if(this.isDrag) this.stopScale(e);
		this.isDrag = true;

		var mouseX = e.screenX;
		var mouseY = e.screenY;

		var controlX = (this._data.originWidth / 2) * (this._data.scaleX);
		var controlY = (this._data.originHeight / 2) * (this._data.scaleY);

		var layer = this._data;
		var initScale = {x:layer.scaleX, y:layer.scaleY};
		var endScale = {x:initScale.x, y:initScale.y};


//		$(document).css("pointer-events","none");
		$(document).off("mousemove.layer_scale");
		$(document).off("mouseup.layer_scale");
		$(document).on("mousemove.layer_scale", (e:any) => {
			if(!this.isDrag) return;

			var defX:number,defY:number;
			defX = (e.screenX - mouseX);
			defY = (e.screenY - mouseY);
			var mat = Matrix4.identity().scale(1/this._base_scale, 1/this._base_scale,1).rotateZ(-this._data.rotation * Math.PI / 180).translate(defX, defY,0);
			var defX2 = mat.values[12];
			var defY2 = mat.values[13];

			var scaleX:number,scaleY:number;
			var xDirection:number = 1;
			var yDirection:number = 1;
			if(key.indexOf("e") == -1) xDirection *= -1;
			if(key.indexOf("s") == -1) yDirection *= -1;
			if(this._data.mirrorH) xDirection *= -1;
			if(this._data.mirrorV) yDirection *= -1;

			scaleX = (controlX + (defX2 * xDirection)) / (this._data.originWidth / 2);
			scaleY = (controlY + (defY2 * yDirection)) / (this._data.originHeight / 2);

			if(KeyboardManager.isDown(16) || this.ENFORCE_ASPECT_RATIO) {
				var scale = Math.min(scaleX, scaleY);
				this._data.scale =  scale;
			}else{
				this._data.scaleX = scaleX;
				this._data.scaleY = scaleY;
			}
		});
		$(document).on("mouseup.layer_scale", (e:any) => {
			if(!this._data) return;
			if(this._data.locked) return;
			if(!this.isDrag) return;
			this.isDrag = false;
//			$(document).css("pointer-events","auto");
			$(document).off("mousemove.layer_scale");
			$(document).off("mouseup.layer_scale");

			endScale.x = layer.scaleX;
			endScale.y = layer.scaleY;
			if(initScale.x != endScale.x || initScale.y != endScale.y){
				HistoryManager.shared.record(new Command(
					()=>{
						layer.scaleX = endScale.x;
						layer.scaleY = endScale.y;
					},
					()=>{
						layer.scaleX = initScale.x;
						layer.scaleY = initScale.y;
					}
				));
			}
		});
	}

	protected updateView(flag:number = PropFlags.ALL) {
		if(!this._data) return;

		super.updateView(flag);

		if(flag & PropFlags.LOCKED){
			if(this._data.locked){
				this.obj.hide();
			}else{
				this.obj.show();
			}
		}
		if(flag & PropFlags.IMG_IMAGEID){
			this.obj.css("width", this._targetLayerView.data.originWidth + "px");
			this.obj.css("height", this._targetLayerView.data.originHeight + "px");
			this.updateMatrix();
		}
		if(flag & PropFlags.TXT_TEXT) {
			setTimeout(()=>{
				if (this._targetLayerView.data) {
					this.obj.css("width", this._targetLayerView.data.originWidth + "px");
					this.obj.css("height", this._targetLayerView.data.originHeight + "px");
					this.updateUISize();
				}
			},1);
		}

	}

	protected updateMatrix() {
		super.updateMatrix();
		this.updateUISize();
	}

	private updateUISize(){
		if(!this._data) return;

		var anchorSizeX = 16 / (this._data.scaleX * this._base_scale);
		var anchorSizeY = 16 / (this._data.scaleY * this._base_scale);
		var cssObj = {"width":anchorSizeX, "height":anchorSizeY};
		this.anchorPoint1.css(cssObj);
		this.anchorPoint2.css(cssObj);
		this.anchorPoint3.css(cssObj);
		this.anchorPoint4.css(cssObj);
		var borderSizeH = 3 / (this._data.scaleX * this._base_scale) + "px";
		var borderSizeV = 3 / (this._data.scaleY * this._base_scale) + "px";
		this.frame.css("border-width",borderSizeV + " " + borderSizeH);
	}

	//
	// get set
	//
	public set base_scale(value:number){
		this._base_scale = value;
		this.updateUISize();
	}

	public set targetLayerView(value:LayerView) {
		if(this.isDrag) return;
		if(this._targetLayerView){
			this._data.removeEventListener(PropertyEvent.UPDATE, this.onLayerUpdate);
		}

		this._targetLayerView = value;

		if(this._targetLayerView){
			this._data = this._targetLayerView.data;
			this._data.addEventListener(PropertyEvent.UPDATE, this.onLayerUpdate);

			this.obj.css("width", this._targetLayerView.data.originWidth + "px");
			this.obj.css("height", this._targetLayerView.data.originHeight + "px");
			this.updateView();	//updateView -> updateMatrix -> updateSize

			this.obj.show();
		}else{
			this._data = null;
			this.obj.hide();
		}
	}




}