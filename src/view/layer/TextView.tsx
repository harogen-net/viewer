import { TextLayer } from "../../model/layer/TextLayer";
import { PropFlags } from "../../model/PropFlags";
import { LayerView } from "../LayerView";

export class TextView extends LayerView {
	public textObj: HTMLDivElement | null = null;
	private textSpan: HTMLSpanElement | null = null;

	constructor(
		protected _data: TextLayer,
		public obj: HTMLElement
	) {
		super(_data, obj);
	}
	protected constructMain() {
		super.constructMain();

		const div = document.createElement("div");
		div.className = "text";
		div.style.display = "inline-block";
		div.contentEditable = "false";
		div.spellcheck = false;
		const span = document.createElement("span");
		div.appendChild(span);
		this.obj.appendChild(div);

		this.textObj = div;
		this.textSpan = span;
		this.opacityObj = div;
		div.style.opacity = String(this._data.opacity);
	}

	public destroy() {
		this.textObj?.remove();
		this.textObj = null;
		this.textSpan = null;

		super.destroy();
	}

	protected updateView(flag: number = PropFlags.ALL): void {
		if (flag & PropFlags.TXT_TEXT) {
			if (this.textSpan) {
				this.textSpan.innerHTML = this._data.text;

				setTimeout(() => {
					this._data.originWidth = this.textSpan?.offsetWidth ?? 0;
					this._data.originHeight = this.textSpan?.offsetHeight ?? 0;
				}, 0);
			}
		}

		//textを先に更新してほしいからsuperは後で
		super.updateView(flag);
	}
}
