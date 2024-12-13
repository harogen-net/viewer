import { EventDispatcher } from "../events/EventDispatcher";
import { Layer, RLayer } from "./Layer";
import { ViewerDocument } from "./ViewerDocument";
import { Viewer } from "../Viewer";
import { PropertyEvent } from "../events/PropertyEvent";
import { PropFlags } from "./PropFlags";
import { v4 as uuidv4 } from 'uuid';


export enum Direction {
	TOP = 0,
	RIGHT,
	BOTTOM,
	LEFT
}

export interface RSlide {
	uuid: string;
	id: number;
	width: number;
	height: number;
	centerX: number;
	centerY: number;

	durationRatio: number;
	joining: boolean;
	disabled: boolean;

	layers: RLayer[];
}

export namespace RSlide {
	export const create = (width: number, height: number, layers: RLayer[] = []): RSlide => {
		return {
			uuid: uuidv4(),
			id: Math.floor(Math.random() * 90000) + 10000,
			width: width,
			height: height,
			centerX: width >> 1,
			centerY: height >> 1,
			durationRatio: 1,
			joining: false,
			disabled: false,
			
			layers: layers
		};
	}

	export const indexOf = (slide: RSlide, layer: RLayer): number => {
		return slide.layers.indexOf(layer);
	}

	export const contains = (slide: RSlide, layer: RLayer): boolean => {
		if (!layer) return false;
		return slide.layers.indexOf(layer) != -1;
	}

	export const getFitLayerSize = (slide: RSlide, layer: Layer): { scale: number, x: number, y: number } => {
		if (slide.layers.indexOf(layer) == -1) return { scale: layer.scale, x: layer.x, y: layer.y };
		if (layer.originWidth == 0 || layer.originHeight == 0) {
			return { scale: layer.scale, x: layer.x, y: layer.y };
		}
		var scaleX, scaleY;
		if (layer.rotation == 90 || layer.rotation == -90) {
			scaleX = slide.width / layer.originHeight;
			scaleY = slide.height / layer.originWidth;
		} else {
			scaleX = slide.width / layer.originWidth;
			scaleY = slide.height / layer.originHeight;
		}
		var scale1: number = Math.min(scaleX, scaleY);
		var scale2: number = Math.max(scaleX, scaleY);
		if (layer.x == slide.centerX && layer.y == slide.centerY) {
			var compRatio: number = Math.pow(10, 10);
			if (Math.round(layer.scale * compRatio) == Math.round(scale1 * compRatio)) {
				layer.scale = scale2;
			} else {
				layer.scale = scale1;
			}
		} else {
			layer.scale = scale1;
			layer.x = slide.centerX;
			layer.y = slide.centerY;
		}

		return { scale: layer.scale, x: layer.x, y: layer.y };
	}
}


export class Slide extends EventDispatcher {

	static readonly LAYER_NUM_MAX: number = 20;

	//

	private _uuid: string;
	private _id: number;
	private _width: number = 0;
	private _height: number = 0;

	private _durationRatio: number = 1;
	private _joining: boolean = false;
	private _disabled: boolean = false;


	constructor(width: number = 0, height: number = 0, protected _layers: Layer[] = []) {
		super();

		this._uuid = uuidv4();
		this._width = width || (ViewerDocument.shared ? ViewerDocument.shared.width : Viewer.SCREEN_WIDTH);
		this._height = height || (ViewerDocument.shared ? ViewerDocument.shared.height : Viewer.SCREEN_HEIGHT);

		this._layers.forEach(layer => {
			layer.addEventListener(PropertyEvent.UPDATE, this.onLayerUpdate);
			layer.parent = this;
		});

		this._id = Math.floor(Math.random() * 90000) + 10000;
	}

	public clone(): this {
		//console.log("clone at slide : " + this.id, this._layers.length);
		var slide: this = new (this.constructor as any)(this._width, this._height, this._layers.map(layer => {
			return layer.clone();
		}));

		slide.durationRatio = this.durationRatio;
		slide.joining = this.joining;
		slide.disabled = this.disabled;

		return slide;
	}

	//
	// public methods
	//
	public addLayer(layer: Layer, index: number = -1): Layer {
		if (!layer) return layer;

		if (index != -1) {
			if (index > this._layers.length - (this._layers.indexOf(layer) != -1 ? 1 : 0)) {
				//throw new Error("invalid index.");
				//index値上限を指定した場合は後ろに追加にする
				index = -1;
			}
		}

		if (this._layers.length >= Slide.LAYER_NUM_MAX - (this._layers.indexOf(layer) != -1 ? 1 : 0)) {
			throw new Error("exceeds max layer num.");
		}

		var fromIndex: number = this._layers.indexOf(layer);
		var isAdd = (fromIndex == -1);

		if (!isAdd) {
			this._layers.splice(this._layers.indexOf(layer), 1);
		}
		if (index == -1) {
			this._layers.push(layer);
		} else {
			this._layers.splice(index, 0, layer);
		}

		if (isAdd) {
			//note:layer自身に設定する重要な部分
			{
				layer.addEventListener(PropertyEvent.UPDATE, this.onLayerUpdate);
				layer.parent = this;
			}

			this.dispatchEvent(new PropertyEvent(PropertyEvent.UPDATE, this, PropFlags.S_LAYER_ADD, { layer: layer }));
		} else {
			this.dispatchEvent(new PropertyEvent(PropertyEvent.UPDATE, this, PropFlags.S_LAYER_ORDER, { layer: layer, from: fromIndex, to: index }));
		}

		return layer;
	}

	public removeLayer(layer: Layer): Layer {
		if (!layer) return layer;
		if (this._layers.indexOf(layer) != -1) {
			this._layers.splice(this._layers.indexOf(layer), 1);
			//note:layer自身に設定する重要な部分
			{
				layer.parent = undefined;
				layer.removeEventListener(PropertyEvent.UPDATE, this.onLayerUpdate);
			}

			this.dispatchEvent(new PropertyEvent(PropertyEvent.UPDATE, this, PropFlags.S_LAYER_REMOVE, { layer: layer }));
		}
		return layer;
	}
	public indexOf(layer: Layer): number {
		return this._layers.indexOf(layer);
	}

	public contains(layer: Layer): boolean {
		if (!layer) return false;
		return this._layers.indexOf(layer) != -1;
	}
	public removeAllLayers() {
		while (this._layers.length > 0) {
			this.removeLayer(this._layers[0]);
		}
	}


	public fitLayer(layer: Layer): Layer {
		if (this._layers.indexOf(layer) == -1) return layer;
		if (layer.originWidth == 0 || layer.originHeight == 0) {
			return layer;
		}

		var scaleX, scaleY;
		if (layer.rotation == 90 || layer.rotation == -90) {
			scaleX = this._width / layer.originHeight;
			scaleY = this._height / layer.originWidth;
		} else {
			scaleX = this._width / layer.originWidth;
			scaleY = this._height / layer.originHeight;
		}

		var scale1: number = Math.min(scaleX, scaleY);
		var scale2: number = Math.max(scaleX, scaleY);

		if (layer.x == this.centerX && layer.y == this.centerY) {
			var compRatio: number = Math.pow(10, 10);
			if (Math.round(layer.scale * compRatio) == Math.round(scale1 * compRatio)) {
				layer.scale = scale2;
			} else {
				layer.scale = scale1;
			}
		} else {
			layer.scale = scale1;
			layer.x = this.centerX;
			layer.y = this.centerY;
		}

		return layer;
	}

	public arrangeLayer(layer: Layer, direction: Direction): Layer {
		if (this._layers.indexOf(layer) == -1) return layer;
		switch (direction) {
			case Direction.TOP:
				layer.y = layer.bounds.height >> 1;
				break;
			case Direction.RIGHT:
				layer.x = this._width - (layer.bounds.width >> 1);
				break;
			case Direction.BOTTOM:
				layer.y = this._height - (layer.bounds.height >> 1);
				break;
			case Direction.LEFT:
				layer.x = layer.bounds.width >> 1;
				break;
		}
		return layer;
	}

	public swapLayer(layer: Layer, indexDef: number): Layer {
		if (this._layers.indexOf(layer) == -1) return layer;
		var fromIndex: number = this._layers.indexOf(layer);
		var toIndex: number = fromIndex + indexDef;
		if (toIndex < 0) toIndex = 0;
		if (toIndex > this._layers.length - 1) toIndex = this._layers.length - 1;
		if (fromIndex == toIndex) return layer;
		this.addLayer(layer, toIndex);
		return layer;
	}


	//
	// event handlers
	//
	private onLayerUpdate = (pe: PropertyEvent) => {
		//note : 
		//Slideの子レイヤのUPDATEイベントについては、そのもののフラグにS_LAYERフラグを付加してスライドが発行する
		//レイヤではなくSlideが単一のViewを持っているCanvasSlideViewはこのイベントで再描画を行う
		this.dispatchEvent(new PropertyEvent(PropertyEvent.UPDATE, this, PropFlags.S_LAYER | pe.propFlags, { layer: pe.targe }));
	}


	//
	// getset
	//
	get id(): number {
		return this._id;
	}
	set id(value: number) {
		this._id = value;
	}
	public get uuid(): string {
		return this._uuid;
	}

	get width() {
		return this._width;
	}
	get height() {
		return this._height;
	}
	get centerX() {
		return this._width >> 1;
	}
	get centerY() {
		return this._height >> 1;
	}

	get durationRatio() { return this._durationRatio; }
	set durationRatio(value: number) {
		value = Math.max(value, 0.2);
		if (value == this._durationRatio) return;
		this._durationRatio = value;
		this.dispatchEvent(new PropertyEvent(PropertyEvent.UPDATE, this, PropFlags.S_DURATION));
	}

	set joining(value: boolean) {
		if (value == this._joining) return;
		this._joining = value;
		this.dispatchEvent(new PropertyEvent(PropertyEvent.UPDATE, this, PropFlags.S_JOIN));
	}
	get joining(): boolean { return this._joining; }

	set disabled(value: boolean) {
		if (value == this._disabled) return;
		this._disabled = value;
		this.dispatchEvent(new PropertyEvent(PropertyEvent.UPDATE, this, PropFlags.S_DISABLED));
	}
	get disabled(): boolean { return this._disabled; }

	get layers(): Layer[] {
		return this._layers;
	}
	set layers(value: Layer[]) {
		this.removeAllLayers();
		value.forEach(layer => {
			this.addLayer(layer);
		});
	}

	//


}