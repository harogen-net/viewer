import { Layer, LayerType } from "../Layer";
import { Viewer } from "../../Viewer";

declare var $: any;
declare var Matrix4: any;

export class TextLayer extends Layer {

	private textObj:any;


	constructor(private _text:string, transform:any = null, id:number = -1){
		super(transform, id);
		this._type = LayerType.TEXT;

		//


		var fontSize = 64;

		this.textObj = $('<div class="text" contenteditable="true" spellcheck="false">' + _text + "<br />" + _text + '</div>');
		this.textObj.css({
			"width":"auto",
			"height":"auto",
			"background-color":"rgba(0,0,0,0.1)",
			"border":"1px solid red",
			"font-family":"メイリオ",
			"font-weight":"bold",
			"text-shadow":"0 0 2px red, 0 0 20px red",
			"color":"white",
			"font-size": fontSize + "px",
			"line-height":fontSize + "px"
		});
		this.obj.append(this.textObj);

		this._originWidth = this.textObj.width();
		this._originHeight = this.textObj.height();
		this._scaleX_min = 1;
		this._scaleY_min = 1;

		this.opacityObj = this.textObj;
	}

	protected makeData():any {
		var ret = super.makeData();
		ret.text = this._text;
		return ret;
	}


}