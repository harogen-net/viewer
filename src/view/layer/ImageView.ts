import { LayerView } from "../LayerView";
import { ImageLayer } from "../../model/layer/ImageLayer";
import { ImageManager } from "../../utils/ImageManager";
import { PropFlags } from "../../model/PropFlags";

export class ImageView extends LayerView {

	private imgObj:any;

	constructor(protected _data:ImageLayer, public obj:any) {
		super(_data, obj);
	}
	protected constructMain(){
		super.constructMain();
	//	this.updateImage();
	}

	//

	public destroy(){
		this.imgObj.remove();
		this.imgObj = null;
		super.destroy();
	}

	private updateImage() {
		if(this.imgObj){
			this.imgObj.remove();
			this.imgObj = null;		
		}
		var imageData:{width:number, height:number, imgObj:any} = ImageManager.instance.getImageById(this._data.imageId);
		this.imgObj = imageData.imgObj;
		this.obj.append(this.imgObj);

		this.opacityObj = this.imgObj;
		this.opacityObj.css("opacity",this._data.opacity);
	}

	protected updateView(flag:number = PropFlags.ALL):void {
		if(flag & PropFlags.IMG_IMAGEID){
			this.updateImage();
		}
		if(flag & PropFlags.IMG_CLIP){
			if(this.imageData.isClipped){
				var clipStr:string = "inset(" + this._data.clipRect.map(value=>{return value + "px"}).join(" ") + ")";
				this.imgObj.css({
					"-webkit-clip-path":clipStr,
					"clip-path":clipStr
				});
			}else{
				if(this.imgObj.css("clip-path")){
					this.imgObj.css({
						"-webkit-clip-path":"inset(0)",
						"clip-path":"inset(0)"
					});
				}
			}
		}
		//先にimageObj設定してほしいからsuperは後で
		super.updateView(flag);
	}




	//
	// get set
	//
	public get width(){
		if(this.obj.width() == 0){
			return this._data.scaleX * this._data.originWidth;
		}else{
			return this.obj.width();
		}
	}
	public get height(){
		if(this.obj.height() == 0){
			return this._data.scaleY * this._data.originHeight;
		}else{
			return this.obj.height();
		}
	}

	private get imageData():ImageLayer{
		return this._data as ImageLayer;
	}

}