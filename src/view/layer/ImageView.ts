import { ImageLayer } from "../../model/layer/ImageLayer";
import { PropFlags } from "../../model/PropFlags";
import { ImageManager } from "../../utils/ImageManager";
import { LayerView } from "../LayerView";

export class ImageView extends LayerView {
	private imgElement: HTMLImageElement | null = null;

	constructor(
		protected _data: ImageLayer,
		public obj: any
	) {
		super(_data, obj);
	}
	protected constructMain() {
		super.constructMain();
		//	this.updateImage();
	}

	//

	public destroy() {
		this.imgElement?.remove();
		this.imgElement = null;
		super.destroy();
	}

	private updateImage() {
		if (this.imgElement) {
			this.imgElement.remove();
			this.imgElement = null;
		}
		var imageElement = ImageManager.instance.getImageCloneElementById(this._data.imageId);
		this.imgElement = imageElement;
		this.obj[0].appendChild(this.imgElement);

		this.opacityObj = this.imgElement;
		this.opacityObj.style.opacity = String(this._data.opacity);
	}

	protected updateView(flag: number = PropFlags.ALL): void {
		if (flag & PropFlags.IMG_IMAGEID) {
			this.updateImage();
		}
		if (flag & PropFlags.IMG_CLIP) {
			if (!this.imgElement) {
				super.updateView(flag);
				return;
			}
			if (this.imageData.isClipped) {
				var clipStr: string =
					"inset(" +
					this._data.clipRect
						.map((value) => {
							return value + "px";
						})
						.join(" ") +
					")";
				this.imgElement.style.setProperty("-webkit-clip-path", clipStr);
				this.imgElement.style.clipPath = clipStr;
			} else {
				this.imgElement.style.setProperty("-webkit-clip-path", "inset(0)");
				this.imgElement.style.clipPath = "inset(0)";
			}
		}
		//先にimageObj設定してほしいからsuperは後で
		super.updateView(flag);
	}

	//
	// get set
	//
	public get width() {
		if (this.obj.width() == 0) {
			return this._data.scaleX * this._data.originWidth;
		} else {
			return this.obj.width();
		}
	}
	public get height() {
		if (this.obj.height() == 0) {
			return this._data.scaleY * this._data.originHeight;
		} else {
			return this.obj.height();
		}
	}

	private get imageData(): ImageLayer {
		return this._data as ImageLayer;
	}
}
