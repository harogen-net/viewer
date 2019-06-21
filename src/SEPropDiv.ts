import { PropertyInput } from "./SENumberBindingInput";
import { SlideView } from "./__core__/view/SlideView";
import { Layer } from "./__core__/model/Layer";

declare var $:any;

export class SEPropDiv {

	private inputTransX:PropertyInput;
	private inputTransY:PropertyInput;
	private inputScaleX:PropertyInput;
	private inputScaleY:PropertyInput;
	private inputRotation:PropertyInput;
	private inputOpacity:PropertyInput;
	private inputClip1:PropertyInput;
	private inputClip2:PropertyInput;
	private inputClip3:PropertyInput;
	private inputClip4:PropertyInput;

	private propertyInputs:PropertyInput[];

	private _targetLayer:Layer = null;
	
	constructor(obj:any){

		this.inputTransX = new PropertyInput(obj.find(".position input").eq(0), {key:"x", v:-25});
		this.inputTransY = new PropertyInput(obj.find(".position input").eq(1), {key:"y", v:-25});
		this.inputScaleX = new PropertyInput(obj.find(".scale input").eq(0), {key:"scale", init:1, min:0.1, max:20, type:"multiply", v:0.1});
		/*this.inputScaleY = new PropertyInput(obj.find(".scale input").eq(1), "scaleY", 1,10,-10,{type:"multipy"});*/
		this.inputRotation = new PropertyInput(obj.find(".rotation input").eq(0), {key:"rotation", min:-180, max:180, v:5});
		this.inputOpacity = new PropertyInput(obj.find(".opacity input").eq(0), {key:"opacity", min:0, max:1, v:0.1});

		this.inputClip1 = new PropertyInput(obj.find(".clip input").eq(0), {key:"clipT", v:-25, min:0});
		this.inputClip2 = new PropertyInput(obj.find(".clip input").eq(1), {key:"clipR", v:-25, min:0});
		this.inputClip3 = new PropertyInput(obj.find(".clip input").eq(2), {key:"clipB", v:-25, min:0});
		this.inputClip4 = new PropertyInput(obj.find(".clip input").eq(3), {key:"clipL", v:-25, min:0});

		this.propertyInputs = [this.inputTransX, this.inputTransY, this.inputScaleX, this.inputRotation, this.inputOpacity, this.inputClip1, this.inputClip2, this.inputClip3, this.inputClip4];
//		this.propertyInputs = [this.inputTransX, this.inputTransY, this.inputScaleX, this.inputScaleY, this.inputRotation, this.inputOpacity];
		// $.each(this.propertyInputs, (number, input:PropertyInput)=>{
		// 	input.addEventListener("update", this.onPropertyUpdate);
		// });

		//

		// slideView.addEventListener("select", (any)=>{
		// 	this.updateMenuSelection();
		// 	setTimeout(()=>{
		// 		this.updateProperty();
		// 	},2);
		// });
		// slideView.addEventListener("update",(any)=>{
		// 	this.updateProperty();
		// });
	}

	// private updateProperty(key:string = ""){
	// 	this.propertyInputs.forEach(input=>{
	// 		input.disabled = (this._targetLayer == null) || (this._targetLayer[input.key] == undefined);

	// 		if(key == "" || (key != "" && key == input.key)){
	// 			input.value = this._targetLayer[input.key];
	// 		}
	// 	});
	// }

	// private onPropertyUpdate = (ce:CustomEvent)=>{
	// 	if(this._targetLayer == null) return;
		
	// 	var input:PropertyInput = ce.detail.target;
	// 	var key:string = ce.detail.key;
	// 	var value:any = ce.detail.value;
	// 	if(this._targetLayer[key] == undefined) return;

	// 	input.locked = true;
	// 	this._targetLayer[key] = value;
	// 	input.locked = false;
	// };

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