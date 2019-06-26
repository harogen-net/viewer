import { PropertyInput } from "./SENumberBindingInput";
import { Layer } from "./__core__/model/Layer";
import { PropFlags } from "./__core__/model/PropFlags";

declare var $:any;

export class SEPropDiv {

	private propertyInputs:PropertyInput[];

	private _targetLayer:Layer = null;
	
	constructor(obj:any){
		this.propertyInputs = [
			new PropertyInput(obj.find(".position input").eq(0), {flag:PropFlags.X, key:"x", v:-25}),
			new PropertyInput(obj.find(".position input").eq(1), {flag:PropFlags.Y, key:"y", v:-25}),
			new PropertyInput(obj.find(".scale input").eq(0), {flag:PropFlags.SCALE_X|PropFlags.SCALE_Y, key:"scale", init:1, min:0.1, max:20, type:"multiply", v:0.1}),
			new PropertyInput(obj.find(".rotation input").eq(0), {flag:PropFlags.ROTATION, key:"rotation", min:-180, max:180, v:5}),
			new PropertyInput(obj.find(".opacity input").eq(0), {flag:PropFlags.OPACITY, key:"opacity", min:0, max:1, v:0.1}),

			new PropertyInput(obj.find(".clip input").eq(0), {flag:PropFlags.IMG_CLIP, key:"clipT", v:-25, min:0}),
			new PropertyInput(obj.find(".clip input").eq(1), {flag:PropFlags.IMG_CLIP, key:"clipR", v:-25, min:0}),
			new PropertyInput(obj.find(".clip input").eq(2), {flag:PropFlags.IMG_CLIP, key:"clipB", v:-25, min:0}),
			new PropertyInput(obj.find(".clip input").eq(3), {flag:PropFlags.IMG_CLIP, key:"clipL", v:-25, min:0})
		];
	}



	//
	// get set
	//
	public set targetLayer(value:Layer) {
		if(this._targetLayer){
			// this._targetLayer.removeEventListener("update", this.onLayerUpdate);
		}

		//value is nullable
		this._targetLayer = value;
		this.propertyInputs.forEach(input=>{
			input.targetObject = this._targetLayer;
		});

		if(this._targetLayer){
			// this._targetLayer.addEventListener("update", this.onLayerUpdate);
		}
		// this.updateProperty();
	}

	//
	// event handlers
	//
	// private onLayerUpdate = (ce:CustomEvent)=>{
	// 	this.updateProperty();
	// };
}