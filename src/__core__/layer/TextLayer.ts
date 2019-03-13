import { Layer, LayerType } from "../Layer";
import { Viewer } from "../../Viewer";

declare var $: any;
declare var Matrix4: any;

export class TextLayer extends Layer {

	public textObj:any;


	constructor(private _text:string, transform:any = null, id:number = -1){
		super(transform, id);
		this._type = LayerType.TEXT;

		//


		var fontSize = 64;

		this.textObj = $('<div class="text" contenteditable="false" spellcheck="false">' + _text + '</div>');
/*		this.textObj.css({
			"width":"auto",
			"height":"auto",
			"background-color":"rgba(0,0,0,0.1)",
			"border":"1px solid red",
			"font-family":"メイリオ",
			"font-weight":"bold",
			"text-shadow":"-1px -1px 20px red, -1px 1px 20px red, 1px -1px 20px red, 1px 1px 20px red",
			"color":"white",
			"font-size": fontSize + "px",
			"line-height":fontSize + "px"
		});*/
		this.obj.append(this.textObj);
		this.textObj.on("focusout", ()=>{
			if(this.textObj.text() != this._text){
				this._text = this.textObj.text();
			}
		});

		this._originWidth = this.textObj.width();
		this._originHeight = this.textObj.height();
		this._scaleX_min = 1;
		this._scaleY_min = 1;
//		this.scale = 2;

		this.opacityObj = this.textObj;
	}

	public set text(value:string){
		this._text = value;
		this.textObj.text(this._text);
	}
	public get text():string{
		return this._text;
	}

	protected makeData():any {
		var ret = super.makeData();
		ret.text = this._text;
		return ret;
	}


	public clone(id:number = -1):TextLayer {
		var ret:TextLayer = new TextLayer(this._text, this.transform, id);
		ret.visible = this._visible;
		ret.locked = this._locked;
		ret.opacity = this._opacity;
		ret.shared = this._shared;
		return ret;
	}
}