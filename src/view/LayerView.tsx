import { attachEventDispatcher, type EventDispatcher } from "../events/EventDispatcher";
import { PropertyEvent } from "../events/PropertyEvent";
import { Layer, LayerType } from "../model/Layer";
import { PropFlags } from "../model/PropFlags";

export class LayerView {
	declare listeners: EventDispatcher["listeners"];
	declare dispatchEvent: EventDispatcher["dispatchEvent"];
	declare addEventListener: EventDispatcher["addEventListener"];
	declare removeEventListener: EventDispatcher["removeEventListener"];
	declare clearEventListener: EventDispatcher["clearEventListener"];
	declare containEventListener: EventDispatcher["containEventListener"];
	declare hasEventListener: EventDispatcher["hasEventListener"];

	protected _selected: boolean = false;
	protected opacityObj: HTMLElement | null = null;

	constructor(
		protected _data: Layer,
		public obj: HTMLElement
	) {
		attachEventDispatcher(this);
		if (_data == null || obj == null) throw new Error("");
		this.constructMain();
		this.updateView();
	}
	protected constructMain() {
		//override me
		this._data.addEventListener(PropertyEvent.UPDATE, this.onLayerUpdate);
	}

	public destroy() {
		this.clearEventListener();
		this._data.removeEventListener(PropertyEvent.UPDATE, this.onLayerUpdate);
		this.obj.remove();
		this.obj = null!;
	}

	//
	//methods
	//
	protected updateMatrix() {
		var matrix: number[] = this._data.matrix;
		var cssMat: string = "matrix(" + matrix.join(",") + ")";
		this.obj.style.transform = cssMat;
	}

	protected updateView(flag: number = PropFlags.ALL) {
		const el = this.obj;
		if (flag & PropFlags.VISIBLE) {
			if (!this._data.visible) {
				el.classList.add("invisible");
			} else {
				el.classList.remove("invisible");
			}
		}
		if (flag & PropFlags.LOCKED) {
			if (this._data.locked) {
				el.classList.add("locked");
			} else {
				el.classList.remove("locked");
			}
		}
		if (this.opacityObj && flag & PropFlags.OPACITY) {
			if (this._data.opacity == 1) {
				this.opacityObj.style.opacity = "";
			} else {
				this.opacityObj.style.opacity = String(this._data.opacity);
			}
		}

		if (
			flag &
			(PropFlags.X |
				PropFlags.Y |
				PropFlags.SCALE_X |
				PropFlags.SCALE_Y |
				PropFlags.ROTATION |
				PropFlags.MIRROR_H |
				PropFlags.MIRROR_V)
		) {
			this.updateMatrix();
		}
	}

	//
	// getter / setter
	//
	public get data(): Layer {
		return this._data;
	}
	public get element(): HTMLElement {
		return this.obj;
	}
	public get type(): LayerType {
		return this._data.type;
	}
	public get id(): number {
		return this._data.id;
	}
	public get width() {
		return this.obj.offsetWidth;
	}
	public get height() {
		return this.obj.offsetHeight;
	}

	public get selected(): boolean {
		return this._selected;
	}
	public set selected(value: boolean) {
		if (this._selected == value) return;
		this._selected = value;
		this.dispatchEvent(new PropertyEvent(PropertyEvent.UPDATE, this, PropFlags.LV_SELECT));
	}

	//
	// event handlers
	//
	protected onLayerUpdate = (pe: PropertyEvent) => {
		this.updateView(pe.propFlags);
	};
}
