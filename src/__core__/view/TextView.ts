//import { ILayer } from "../layerModel/ILayer";
import { LayerView } from "./LayerView";
import { TextLayer } from "../model/TextLayer";
import { Layer } from "../model/Layer";
import { PropFlags } from "../model/PropFlags";

declare var $:any;

export class TextView extends LayerView {

	public textObj:any;


	constructor(protected _data:TextLayer, public obj:any) {
		super(_data, obj);
	}
	protected constructMain() {
		super.constructMain();
		
		this.textObj = $('<div class="text" style="display:inline-block;" contenteditable="false" spellcheck="false"><span></span></div>');
		this.obj.append(this.textObj);

		this.opacityObj = this.textObj;
		this.opacityObj.css("opacity",this._data.opacity);
	}

	public destroy(){
		this.textObj.remove();
		this.textObj = null;

		super.destroy();
	}


	protected updateView(flag:number = PropFlags.ALL):void {
		if(flag & PropFlags.TXT_TEXT){
			this.textObj.find("span").html(this._data.text);
			this._data.originWidth = this.textObj.find("span").width();
			this._data.originHeight = this.textObj.find("span").height();
		}

		//textを先に更新してほしいからsuperは後で
		super.updateView(flag);
	}


	//
	// set get
	//
	private get textData():TextLayer {
		return this._data as TextLayer;
	}


}