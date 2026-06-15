import { PropFlags } from "../../model/PropFlags";
import { Slide } from "../../model/Slide";
import { Viewer, ViewerStartUpMode } from "../../Viewer";
import { CanvasSlideView } from "./CanvasSlideView";

export class ThumbSlideView extends CanvasSlideView {
	constructor(
		protected _slide: Slide,
		public obj: any,
		protected scale: number
	) {
		super(_slide, obj, scale);

		if (Viewer.startUpMode == ViewerStartUpMode.VIEW_AND_EDIT) {
			this.obj.on("dblclick.slide", () => {
				this.dispatchEvent(new CustomEvent("edit", { detail: this._slide }));
				return false;
			});
			obj.on("contextmenu.slide", (e) => {
				this.dispatchEvent(
					new CustomEvent("contextmenu", {
						detail: { slide: this._slide, x: e.clientX, y: e.clientY },
					})
				);
				return false;
			});
		}

		//

		this.obj.on("mousedown.slide", (e: any) => {
			//e.stopPropagation();
		});
		this.obj.on("click.slide", () => {
			if (this.selected) return;
			this.dispatchEvent(new CustomEvent("select", { detail: this._slide }));
		});

		//

		this.updateView(PropFlags.S_JOIN | PropFlags.S_DISABLED | PropFlags.S_DURATION);
	}

	public fitToHeight(): void {
		var durationCorrection: number = Math.atan(this._slide.durationRatio - 1) * 0.5 + 1;

		if (this._slide.durationRatio < 1) {
			durationCorrection = Math.pow(this._slide.durationRatio, 0.4);
		}
		var fitWidth = Math.round(this.scale * this._slide.width * durationCorrection);
		{
			this.obj.stop();
			if (this.obj.attr("style") && this.obj.attr("style").indexOf("width") != -1) {
				this.obj.animate({ width: fitWidth }, { duration: 200 });
			} else {
				//this.obj.width(fitWidth);
				this.obj.css({ width: fitWidth });
			}
		}
	}

	public show() {
		// show immidiately
		// this.obj.hide().fadeIn(300, () => {
		// });
	}

	public destroy() {
		this.obj.stop();
		this.obj.off("click.slide");
		this.obj.off("dblclick.slide");
		this.obj.off("contextmenu.slide");
		this.obj.off("mousedown.slide");

		super.destroy();
	}

	//
	// private methods
	//
	protected updateView(flag: number = PropFlags.ALL) {
		super.updateView(flag);

		if (flag & PropFlags.S_DISABLED) {
			if (this._slide.disabled) {
				this.obj.addClass("disabled");
			} else {
				this.obj.removeClass("disabled");
			}
		}
		if (flag & PropFlags.S_JOIN) {
			if (this._slide.joining) {
				this.obj.addClass("joining");
			} else {
				this.obj.removeClass("joining");
			}
		}
		if (flag & PropFlags.S_DURATION) {
			if (this.obj.height() > 0) {
				this.fitToHeight();
			}
		}
	}

	// protected replaceSlide(newSlide:Slide) {
	// 	this._slide.removeEventListener(PropertyEvent.UPDATE, this.onSlideUpdate);
	// 	// this._slide.removeEventListener("update", this.onSlideUpdate);
	// 	super.replaceSlide(newSlide);
	// 	this._slide.addEventListener(PropertyEvent.UPDATE, this.onSlideUpdate);
	// 	// this._slide.addEventListener("update", this.onSlideUpdate);
	// 	this.updateView();
	// }
}
