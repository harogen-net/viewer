//import { ILayer } from "../layerModel/ILayer";
import { LayerView } from "./LayerView";
import { TextLayer } from "../layerModel/TextLayer";
import { Layer } from "../layerModel/Layer";

declare var $:any;

export class TextView extends LayerView {

	public textObj:any;

	//private _textData:TextLayer;


	constructor(protected _textData:TextLayer, public obj:any) {
		super(_textData, obj);
//		this._textData = (_data as TextLayer);

		this.textObj = $('<div class="text" contenteditable="false" spellcheck="false"></div>');
		this.obj.append(this.textObj);
		this.opacityObj = this.textObj;
		this._data.opacity = this._data.opacity;

		this.setText();
	}



	private setText() {
		this.textObj.html(this._textData.text);

		this._data.originWidth = this.textObj.width();
		this._data.originHeight = this.textObj.height();
		// this._data.scaleX_min = 1;
		// this._data.scaleY_min = 1;
	}

	public get text():string{ return this._textData.text; }
	public set text(value:string){
		this._textData.text = value;
		this.setText();
	}

	public get plainText():string {
		return this.textObj.text();
	}


}