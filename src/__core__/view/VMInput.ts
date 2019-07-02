import { TypeChecker } from "../../utils/TypeChecker";
import { PropertyEvent } from "../../events/LayerEvent";

declare var $:any;

export class VMInput {

	protected _target:any;

	constructor(protected _obj:any, private targetClass:any){
		if(_obj.prop("tagName") != "INPUT" && _obj.prop("tagName") != "SELECT" && _obj.prop("tagName") != "BUTTON"){
			throw new Error("invalid jquery object.");
		}
		this._obj.prop("disabled", true);
	}

	protected setTarget(){
		this._obj.prop("disabled", false);
	}
	protected destroyTarget(){
		this._obj.prop("disabled", true);
	}

	//
	// get set
	//
	public set target(value:any){
//		 console.log("set target at VMI:")
		if(!(value instanceof this.targetClass)){
			value = null;
		}
		if(value == this._target) return;
		if(this._target){
			this.destroyTarget();
		}
		this._target = value;
		if(this._target){
			this.setTarget();
		}
	}

	public get target():any{
		return this._target;
	}
	public get obj():any{
		return this._obj;
	}
}

export class VMButton extends VMInput {
	constructor(protected _obj:any, targetClass:any, clickHandler:(target:any)=>void){
		super(_obj, targetClass);
		if(_obj.prop("tagName") != "BUTTON"){
			throw new Error("invalid jquery object. use button tag.");
		}

		_obj.on("click", ()=>{
			clickHandler(this._target);
		});
	}
}

export class VMToggleButton extends VMInput {
	constructor(protected _obj:any, targetClass:any, private targetPropKey:string){
		super(_obj, targetClass);
		if(_obj.prop("tagName") != "BUTTON"){
			throw new Error("invalid jquery object. use <button /> tag.");
		}

		_obj.on("click", ()=>{
			this._target[this.targetPropKey] = !this._target[this.targetPropKey];
			if(this._target[this.targetPropKey]){
				this._obj.addClass("on");
			}else{
				this._obj.removeClass("on");
			}
		});
	}

	protected setTarget(){
		if(this._target[this.targetPropKey] == undefined || !TypeChecker.isBoolean(this._target[this.targetPropKey])) {
			throw new Error("invalid target. set target that have key with boolean.");
		}
		super.setTarget();

		if(this._target[this.targetPropKey]){
			this._obj.addClass("on");
		}
	}
	protected destroyTarget(){
		super.destroyTarget();
		if(this._target[this.targetPropKey]){
			this._obj.removeClass("on");
		}
	}
}

export class VMVariableInput extends VMInput {

	private _value:number;

	private isFocus:boolean;
	private isLocked:boolean;
	private init:number = 0;
	private min:number = -Infinity;
	private max:number = Infinity;

	constructor(protected _obj:any, targetClass:any, private targetPropKey:string, private targetProFlag:number, options:any = {}){
		super(_obj, targetClass);
		if(_obj.prop("tagName") != "INPUT" || _obj.attr("type") != "text"){
			throw new Error("invalid jquery object. use <input type='text' /> tag.");
		}

		if(!isNaN(parseFloat(options.init))) this.init = options.init;
		if(!isNaN(parseFloat(options.min))) this.min = options.min;
		if(!isNaN(parseFloat(options.max))) this.max = options.max;

		this._value = this.init;

		this.obj.focus(()=>{
			this.isFocus = true;
			this.obj.select();
		});
		this.obj.blur(()=>{
			this.isFocus = false;
			this.value = parseFloat(this.obj.val());
			this.setValueToTarget();
		});

		var v:number = options.v || 10;

		this.obj.on("keydown.PropertyInput",(e:any)=>{
			//if(this.disabled) return;
			if(!this.isFocus) return;

			if(e.keyCode == 13) {
				this.value = parseFloat(this.obj.val());
				this.setValueToTarget();
				this.obj.select();
			}else if(e.keyCode == 38){
				if(options.type == "multiply"){
					this.value *= (1 + v);
				}else{
					this.value += v;
				}
				this.setValueToTarget();
				this.obj.select();
			}else if(e.keyCode == 40){
				if(options.type == "multiply"){
					this.value /= (1 + v);
				}else{
					this.value -= v;
				}
				this.setValueToTarget();
				this.obj.select();
			}
		});
		$(window).on("wheel.PropertyInput",(e:any)=>{
			//if(this.disabled) return;
			if(!this.isFocus) return;

			var delta:number = -1 * (e.originalEvent.deltaY / Math.abs(e.originalEvent.deltaY)) * v;
			if(options.type == "multiply"){
				this.value *= (1 + delta);
			}else{
				this.value += delta;
			}
			this.setValueToTarget();
		});
	}

	//

	protected setTarget(){
		super.setTarget();
		if(this._target[this.targetPropKey] == undefined || !TypeChecker.isNumber(this._target[this.targetPropKey])){
			throw new Error("invalid target.");
		}
		this.updateValueFromTarget();
		this._target.addEventListener(PropertyEvent.UPDATE, this.onPropertyUpdate);
	}
	protected destroyTarget(){
		super.destroyTarget();

		this.obj.val("");
		this._target.removeEventListener(PropertyEvent.UPDATE, this.onPropertyUpdate);
	}

	//

	private restrictValue(){
		if(isNaN(this._value)) this._value = this.init;
		if(this._value > this.max) this._value = this.max;
		if(this._value < this.min) this._value = this.min;
	}

	private updateValueFromTarget(){
		this.value = this._target[this.targetPropKey]
	}

	private setValueToTarget(){
		this.isLocked = true;
		this._target[this.targetPropKey] = this.value;
		this.isLocked = false;
	}

	//
	// setget
	//
	private set value(val:number){
		this._value = val;
		this.restrictValue();
		this.obj.val(Math.floor(this._value * 100)/100);
	}
	private get value():number {
		return this._value;
	}


	//
	// event handler
	//
	private onPropertyUpdate = (pe:PropertyEvent)=>{
		if(this.isLocked) return;
		if(pe.targe != this._target) return;
		if(this.targetProFlag & pe.propFlags){
			this.updateValueFromTarget();
		}
	}
}