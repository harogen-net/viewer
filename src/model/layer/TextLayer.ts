import { Layer, LayerType, RLayer } from "../Layer";
import { PropertyEvent } from "../../events/PropertyEvent";
import { PropFlags } from "../PropFlags";


export interface RTextLayer extends RLayer {
	text: string;
}

export namespace RTextLayer {
	export const create = (text: string, transform?: RLayer.RLayerTransform, id: number = -1): RTextLayer => {
		let layer: RTextLayer = {
			...RLayer.create(transform, id),
			type: LayerType.TEXT,
			text: text,
		}

		return layer;
	}

	export const plainText = (layer: RTextLayer) => {
		return layer.text.split("\n").join().split("\r").join();
	}
}


export class TextLayer extends Layer {

	public textObj: any;

	constructor(private _text: string, transform: any = null, id: number = -1) {
		super(transform, id);
		this._type = LayerType.TEXT;
	}

	//
	// override
	//
	public clone(id: number = -1): this {
		var ret: this = new (this.constructor as any)(this._text, this.transform, this._id);
		ret.visible = this._visible;
		ret.locked = this._locked;
		ret.opacity = this._opacity;
		ret.shared = this._shared;
		return ret;
	}

	public getData(): any {
		var ret: any = super.getData();
		ret.text = this._text;
		return ret;
	}

	//
	// getset
	//
	public get text(): string { return this._text; }
	public set text(value: string) {
		this._text = value;
		this.dispatchEvent(new PropertyEvent(PropertyEvent.UPDATE, this, PropFlags.TXT_TEXT));
	}
	public get plainText(): string {
		return this._text.split("\n").join().split("\r").join();
	}
}