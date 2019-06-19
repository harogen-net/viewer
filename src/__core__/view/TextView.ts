//import { ILayer } from "../layerModel/ILayer";
import { LayerView } from "./LayerView";
import { TextLayer } from "../model/TextLayer";
import { Layer } from "../model/Layer";

declare var $:any;

export class TextView extends LayerView {

	public textObj:any;


	constructor(protected _textData:TextLayer, public obj:any) {
		super(_textData, obj);

		this._data.addEventListener("textUpdate", this.onTextUpdate);
		this.textObj = $('<div class="text" contenteditable="false" spellcheck="false"></div>');
		this.obj.append(this.textObj);

		this.opacityObj = this.textObj;
		this.opacityObj.css("opacity",this._data.opacity);

		this.updateText();
	}

	public destroy(){
		this._data.removeEventListener("textUpdate", this.onTextUpdate);
		this.textObj.remove();
		this.textObj = null;

		super.destroy();
	}


	protected updateView():void {
		super.updateView();
		//updateTextを入れると循環するので別口で
	}

	private updateText() {
		this.textObj.html(this._textData.text);
		this._data.originWidth = this.textObj.width();
		this._data.originHeight = this.textObj.height();
	}


	//
	// set get
	//
	private get textData():TextLayer {
		return this._data as TextLayer;
	}


	//
	// event handlers
	//
	private onTextUpdate = ()=>{
		this.updateText();
	};
}