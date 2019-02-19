import {Slide} from "./Slide";
import {Image} from "./Image";
import {KeyboardManager} from "../utils/KeyboardManager";
import { DropHelper } from "../utils/DropHelper";
import { IDroppable } from "../interface/IDroppable";

declare var $: any;
declare var Matrix4: any;

export class SlideEditable extends Slide implements IDroppable {
	public static SCALE_DEFAULT:number = 0.9;

	private readonly ENFORCE_ASPECT_RATIO:boolean = true;

	public selectedImg:Image|null;
	private copyedImg:Image|null;
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
		this.selectedImg = null;
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

		this.frame.on("mousedown.image_drag", (e:any) => {
			this.startDrag(e);
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

			if(this.selectedImg !== null){
				var theta:number = (e.originalEvent.deltaY / 20) * (Math.PI / 180);
				if(KeyboardManager.isDown(16)){
					theta = (45 * e.originalEvent.deltaY / Math.abs(e.originalEvent.deltaY)) * (Math.PI / 180);
				}
				this.selectedImg.rotateBy(theta);
			}

			//this.selectedImg.rotation = 45;
		});
		
		this.obj.on("mousedown",(e:any) => {
			if(!this._isActive) return;
			this.selectImage(null);
		});

		var dropHelper = new DropHelper(this);
		dropHelper.addEventListener(DropHelper.EVENT_DROP_COMPLETE, (e:CustomEvent)=>{
			this.selectImage(this.addImage(new Image(e.detail)));
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

	addImage(img:Image):Image{
		super.addImage(img);

		img.obj.on("mousedown.image_preselect", (e:any) => {
			if(img.selected) return;
			if(img.locked) return;

			img.obj.off("mousemove.image_preselect");
			img.obj.on("mousemove.image_preselect", (e:any) => {
				img.obj.off("mousemove.image_preselect");
				this.selectImage(img);
				this.startDrag(e);
			});
			e.stopImmediatePropagation();
		});
		img.obj.on("mouseup.image_preselect", (e:any) => {
			img.obj.off("mousemove.image_preselect");
			if(!img.selected && !this.isDrag && !img.locked){
				this.selectImage(img);
			};
		});

		this.dispatchEvent(new Event("update"));
		return img;
	}

	removeImage(img:Image):Image{
		if(img == this.selectedImg){
			this.selectImage();
		}
		super.removeImage(img);
		img.obj.off("dragstart");
		img.obj.off("mousedown.image_preselect");
		img.obj.off("mousemove.image_preselect");
		img.obj.off("mouseup.image_preselect");
		this.dispatchEvent(new Event("update"));
		return img;
	}

	selectImage(img:Image|null = null){
		if(this.selectedImg) {
			this.controls.detach();
		}
		this.selectedImg = null;

		$.each(this._images, (i:number ,value:any) => {
			if(img === value){
				value.selected = true;

				this.selectedImg = value;
			}else {
				value.selected = false;
			}
		});

		if(this.selectedImg !== null){
			this.selectedImg.obj.append(this.controls);
			this.updateControlsSize();
			this.controls.show();

			this.lastSelectedId = this.selectedImg.imageId;
			this.lastSelectedIndex = this.images.indexOf(this.selectedImg);
		}else{
			this.controls.hide();

//			this.lastSelectedId = "";
//			this.lastSelectedIndex = -1;
		}

		this.dispatchEvent(new Event("select"));
	}

	initialize(){
		var tmpImages:Image[] = this._images.concat() as Image[];
		$.each(tmpImages, (index:number, img:Image)=>{
			this.removeImage(img);
		});
		this.isActive = false;
	}

	cut(){
		if(!this._isActive) return;
		if(this.selectedImg){
			this.copyedImg = this.selectedImg;
			this.removeImage(this.selectedImg);
		}
	}

	copy(){
		if(!this._isActive) return;
		if(this.selectedImg){
			this.copyedImg = this.selectedImg;
		}
	}

	paste(){
		if(!this._isActive) return;
		if(this.copyedImg){
			var newImg:Image = this.copyedImg.clone();
			this.selectImage(this.addImage(newImg));
		}
	}

	copyTrans(){
		if(!this.selectedImg) return;
		this.copyedTrans = this.selectedImg.transform;
	}

	pasteTrans(){
		if(!this.selectedImg) return;
		if(!this.copyedTrans) return;
		this.selectedImg.transform = this.copyedTrans;

		//console.log(this.selectedImg.transform, this.copyedTrans);
		this.dispatchEvent(new Event("update"));
		if(this.selectedImg.shared){
			this.dispatchEvent(new CustomEvent("sharedUpdate", {detail:{image:this.selectedImg}}));
		}

		this.updateControlsSize();
	}

	updateSize(){
		super.updateSize();
		this.updateControlsSize();
	}

	fitSelectedImage(){
		if(!this.selectedImg) return;
		//this.selectedImg.rotation = 0;
		this.fitImage(this.selectedImg);

		this.dispatchEvent(new Event("update"));

		this.updateControlsSize();
	}

	forwardImage(img:Image){
		if(this._images.indexOf(img) == -1) return;

		var index:number = this._images.indexOf(img);
		this._images.splice(index,1);
		this._images.splice(Math.min(index + 1, this._images.length),0,img);

		this.setImagesZIndex();
		this.dispatchEvent(new Event("update"));
	}

	backwordImage(img:Image){
		if(this._images.indexOf(img) == -1) return;

		var index:number = this._images.indexOf(img);
		this._images.splice(index,1);
		this._images.splice(Math.max(index - 1, 0),0,img);

		this.setImagesZIndex();
		this.dispatchEvent(new Event("update"));
	}

	//

	private startDrag(e:any){
		if(!this.selectedImg) return;
		if(this.selectedImg.locked) return;
		//if(this.isDrag) this.stopDrag(e:any);
		this.isDrag = true;

		var mouseX = e.screenX;
		var mouseY = e.screenY;

		$(document).off("mousemove.image_drag");
		$(document).off("mouseup.image_drag");
		$(document).on("mousemove.image_drag", (e:any) => {
			if(!this.selectedImg) return;
			if(!this.isDrag) return;

			this.selectedImg.moveBy((e.screenX - mouseX) / this.actualScale, (e.screenY - mouseY) / this.actualScale);
			mouseX = e.screenX;
			mouseY = e.screenY;
		});
		$(document).on("mouseup.image_drag", (e:any) => {
			if(!this.selectedImg) return;
			if(!this.isDrag) return;

			this.isDrag = false;
			$(document).off("mousemove.image_drag");
			$(document).off("mouseup.image_drag");

			this.dispatchEvent(new Event("update"));
			if(this.selectedImg.shared){
				this.dispatchEvent(new CustomEvent("sharedUpdate", {detail:{image:this.selectedImg}}));
			}
		});
	}

	private startScale(e:any, key:string = ""){
		if(!this.selectedImg) return;
		if(this.selectedImg.locked) return;
		//if(this.isDrag) this.stopScale(e);
		this.isDrag = true;

		var mouseX = e.screenX;
		var mouseY = e.screenY;

		var controlX = (this.selectedImg.width / 2) * (this.selectedImg.scaleX);
		var controlY = (this.selectedImg.height / 2) * (this.selectedImg.scaleY);

		$(document).off("mousemove.image_scale");
		$(document).off("mouseup.image_scale");
		$(document).on("mousemove.image_scale", (e:any) => {
			if(!this.isDrag) return;

			var defX:number,defY:number;
			defX = (e.screenX - mouseX);
			defY = (e.screenY - mouseY);
			var mat = Matrix4.identity().scale(1/this.actualScale, 1/this.actualScale,1).rotateZ(-this.selectedImg.rotation * Math.PI / 180).translate(defX, defY,0);
			var defX2 = mat.values[12];
			var defY2 = mat.values[13];

			var scaleX:number,scaleY:number;
			var xDirection:number = 1;
			var yDirection:number = 1;
			if(key.indexOf("e") == -1) xDirection *= -1;
			if(key.indexOf("s") == -1) yDirection *= -1;
			if(this.selectedImg.mirrorH) xDirection *= -1;
			if(this.selectedImg.mirrorV) yDirection *= -1;

			scaleX = (controlX + (defX2 * xDirection)) / (this.selectedImg.width / 2);
			scaleY = (controlY + (defY2 * yDirection)) / (this.selectedImg.height / 2);

			if(KeyboardManager.isDown(16) || this.ENFORCE_ASPECT_RATIO) {
				var scale = Math.min(scaleX, scaleY);
				this.selectedImg.scaleX = this.selectedImg.scaleY = scale;
			}else{
				this.selectedImg.scaleX = scaleX;
				this.selectedImg.scaleY = scaleY;
			}
			this.updateControlsSize();
		});
		$(document).on("mouseup.image_scale", (e:any) => {
			if(!this.isDrag) return;
			this.isDrag = false;
			$(document).off("mousemove.image_scale");
			$(document).off("mouseup.image_scale");

			this.dispatchEvent(new Event("update"));
			if(this.selectedImg.shared){
				this.dispatchEvent(new CustomEvent("sharedUpdate", {detail:{image:this.selectedImg}}));
			}
		});
	}

	private updateControlsSize(){
		if(this.border){
			this.border.css("border-width", 6/this.actualScale + "px");
		}

		if(!this.selectedImg) return;
		var anchorSizeX = 20 / (this.selectedImg.scaleX * this.actualScale);
		var anchorSizeY = 20 / (this.selectedImg.scaleY * this.actualScale);
		this.anchorPoint1.css("width",anchorSizeX);
		this.anchorPoint1.css("height",anchorSizeY);
		this.anchorPoint2.css("width",anchorSizeX);
		this.anchorPoint2.css("height",anchorSizeY);
		this.anchorPoint3.css("width",anchorSizeX);
		this.anchorPoint3.css("height",anchorSizeY);
		this.anchorPoint4.css("width",anchorSizeX);
		this.anchorPoint4.css("height",anchorSizeY);
		var borderSizeH = 3 / (this.selectedImg.scaleX * this.actualScale) + "px";
		var borderSizeV = 3 / (this.selectedImg.scaleY * this.actualScale) + "px";
		this.frame.css("border-width",borderSizeV + " " + borderSizeH);
	}

	//

	setData(aData:any[]){
		super.setData(aData);

		if(this.images.length > 0){
			// MARK: auto image select

			//console.log(this.lastSelectedId.slice(0,10), this.lastSelectedIndex);

			var autoSelectedImg:Image = null;

			if(this.lastSelectedId != ""){
				$.each(this.images, (number, image:Image)=>{
					if(this.lastSelectedId == image.imageId){
						if(!image.locked && image.visible){
							autoSelectedImg = image;
						}
						return false;
					}
				});
			}
			if(autoSelectedImg != null){this.selectImage(autoSelectedImg); return;}

			if(this.lastSelectedIndex != -1 && this.images.length > this.lastSelectedIndex){
				if(!this.images[this.lastSelectedIndex].locked && this.images[this.lastSelectedIndex].visible){
					autoSelectedImg = this.images[this.lastSelectedIndex];
				}
			}
			if(autoSelectedImg != null){this.selectImage(autoSelectedImg); return;}

			for(var i:number = this.images.length - 1; i >= 0; i--){
				if(!this.images[i].locked && this.images[i].visible){
					this.selectImage(this.images[i]);
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
