import { TypeChecker } from "../utils/TypeChecker";
import { PropertyEvent } from "../events/PropertyEvent";
import { HistoryManager, Command } from "../utils/HistoryManager";
import { IVMUI } from "../interface/IVMUI";
import $ from "jquery";

export class VMUI implements IVMUI {

	protected _target:any;

	constructor(protected _obj:any, private targetClass:any){
		if(
			_obj.prop("tagName") != "INPUT" &&
			_obj.prop("tagName") != "SELECT" &&
			_obj.prop("tagName") != "TEXTAREA" &&
			_obj.prop("tagName") != "BUTTON"
		){
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
		if(value != null && !(value instanceof this.targetClass)){
			value = null;
			console.warn("different type target set.");
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

export class VMButton extends VMUI {
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

export class VMToggleButton extends VMUI {
	constructor(protected _obj:any, targetClass:any, private targetPropKey:string, private targetPropFlag:number){
		super(_obj, targetClass);
		if(_obj.prop("tagName") != "BUTTON"){
			throw new Error("invalid jquery object. use <button /> tag.");
		}

		var target;
		var propKey;
		var startValue;
		var endValue;
		_obj.on("click", ()=>{
			if(!this._target) return;

			target = this._target;
			propKey = this.targetPropKey;
			startValue = target[propKey];
			endValue = !startValue;
			HistoryManager.shared.record(new Command(
				()=>{
					target[propKey] = endValue;
				},
				()=>{
					target[propKey] = startValue;
				}
			)).do();
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
		this._target.addEventListener(PropertyEvent.UPDATE, this.onPropertyUpdate);
	}
	protected destroyTarget(){
		super.destroyTarget();
		if(this._target[this.targetPropKey]){
			this._obj.removeClass("on");
		}
		this._target.removeEventListener(PropertyEvent.UPDATE, this.onPropertyUpdate);
	}


	//
	// event handler
	//
	private onPropertyUpdate = (pe:PropertyEvent)=>{
		if(pe.targe != this._target) return;
		if(this.targetPropFlag & pe.propFlags){
			if(this._target[this.targetPropKey]){
				this._obj.addClass("on");
			}else{
				this._obj.removeClass("on");
			}
		}
	}
}

export class VMCheckBox extends VMUI {
	constructor(protected _obj:any, targetClass:any, protected targetPropKey:string, protected targetPropFlag:number, protected isInverse){
		super(_obj, targetClass);
		if(_obj.prop("tagName") != "INPUT" || _obj.attr("type") != "checkbox"){
			throw new Error("invalid jquery object. use <input type=\checkbox\" /> tag.");
		}

		_obj.prop("checked",this.isInverse);
		_obj.on("click", ()=>{
			if(!this._target) return;
			this.onCheckBoxClick();
		});
	}

	protected setTarget(){
		if(this._target[this.targetPropKey] == undefined || !TypeChecker.isBoolean(this._target[this.targetPropKey])) {
			throw new Error("invalid target. set target that have key with boolean.");
		}
		super.setTarget();

		if(this._target[this.targetPropKey]){
			this._obj.prop("checked",!this.isInverse);
		}
		this._target.addEventListener(PropertyEvent.UPDATE, this.onPropertyUpdate);
	}
	protected destroyTarget(){
		super.destroyTarget();
		if(this._target[this.targetPropKey]){
			this._obj.prop("checked",this.isInverse);
		}
		this._target.removeEventListener(PropertyEvent.UPDATE, this.onPropertyUpdate);
	}


	//
	// event handler
	//
	private onPropertyUpdate = (pe:PropertyEvent)=>{
		if(pe.targe != this._target) return;
		if(this.targetPropFlag & pe.propFlags){
			this._obj.prop("checked", this._target[this.targetPropKey] ^ this.isInverse);	//排他的論理和！
		}
	}
	protected onCheckBoxClick = ()=> {
		this._target[this.targetPropKey] = !this._target[this.targetPropKey];
	}
}
export class VMHistoricalCheckBox extends VMCheckBox {
	protected onCheckBoxClick = ()=> {
		var target;
		var propKey;
		var startValue;
		var endValue;

		target = this._target;
		propKey = this.targetPropKey;
		startValue = target[propKey];
		endValue = !startValue;
		HistoryManager.shared.record(new Command(
			()=>{
				target[propKey] = endValue;
			},
			()=>{
				target[propKey] = startValue;
			}
		)).do();
	}
}


export class VMVariableInput extends VMUI {

	protected _value:number;

	private isFocus:boolean;
	private isLocked:boolean;
	private init:number = 0;
	private min:number = -Infinity;
	private max:number = Infinity;

	constructor(protected _obj:any, targetClass:any, protected targetPropKey:string, protected targetPropFlag:number, options:any = {}){
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
		});

		var v:number = options.v || 10;

		this.obj.on("keydown.VMUI",(e:any)=>{
			//if(this.disabled) return;
			if(!this.isFocus) return;

			if(e.keyCode == 13) {	//ENTER
				this.value = parseFloat(this.obj.val());
				this.setValueToTarget();
				this.obj.select();
			}else if(e.keyCode == 38){	//UP
				if(options.type == "multiply"){
					this.value *= (1 + v);
				}else{
					this.value += v;
				}
				this.setValueToTarget();
				this.obj.select();
			}else if(e.keyCode == 40){	//DOWN
				if(options.type == "multiply"){
					this.value /= (1 + v);
				}else{
					this.value -= v;
				}
				this.setValueToTarget();
				this.obj.select();
			}
		});
		$(window).on("wheel.VMUI",(e:any)=>{
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
		if(this.targetPropFlag & pe.propFlags){
			this.updateValueFromTarget();
		}
	}
}

export class VMHistoricalVariableInput extends VMVariableInput {
	constructor(protected _obj:any, targetClass:any, protected targetPropKey:string, protected targetPropFlag:number, options:any = {}){
		super(_obj, targetClass, targetPropKey, targetPropFlag, options);

		var target;
		var propKey;
		var startValue;
		var endValue;

		this.obj.focus(()=>{
			target = this._target;
			propKey = this.targetPropKey;
			startValue = this._value;
			endValue = null;
		});
		this.obj.blur(()=>{
			endValue = this._value;

			if(target != null && endValue != null && startValue != endValue){
				HistoryManager.shared.record(new Command(
					()=>{
						target[propKey] = endValue;
					},
					()=>{
						target[propKey] = startValue;
					}
				));
			}
		});

	}
}



export class VMTextInput extends VMUI {
	constructor(protected _obj:any, targetClass:any, protected targetPropKey:string, protected targetPropFlag:number){
		super(_obj, targetClass);
		if(_obj.prop("tagName") != "TEXTAREA"){
			throw new Error("invalid jquery object. use <textarea /> tag.");
		}
		_obj.on("input.VMUI", ()=>{
			if(!this._target) return;
			this._target[this.targetPropKey] = this._obj.val();
		});
	}

	protected setTarget(){
		if(this._target[this.targetPropKey] == undefined || !TypeChecker.isString(this._target[this.targetPropKey])) {
			throw new Error("invalid target. set target that have key with string.");
		}
		super.setTarget();

		this._obj.val(this._target[this.targetPropKey]);
		this._target.addEventListener(PropertyEvent.UPDATE, this.onPropertyUpdate);
	}
	protected destroyTarget(){
		super.destroyTarget();
		this.obj.val("");
		this._target.removeEventListener(PropertyEvent.UPDATE, this.onPropertyUpdate);
	}


	//
	// event handler
	//
	private onPropertyUpdate = (pe:PropertyEvent)=>{
		if(pe.targe != this._target) return;
		if(this.targetPropFlag & pe.propFlags){
			this._obj.val(this._target[this.targetPropKey]);
		}
	}
}
export class VMHistoricalTextInput extends VMTextInput {

	private startValue:string = "";

	constructor(protected _obj:any, targetClass:any, protected targetPropKey:string, protected targetPropFlag:number){
		super(_obj, targetClass, targetPropKey, targetPropFlag);

		_obj.on("focus.VMUI", ()=>{
			if(!this._target) return;
			this.startValue = _obj.val();
		});
		_obj.on("blur.VMUI", ()=>{
			if(!this._target) return;
			var endValue = _obj.val();
			var startValue = this.startValue;
			var target = this._target;
			if(startValue == endValue) return;

			HistoryManager.shared.record(new Command(
				()=>{
					target[this.targetPropKey] = endValue;
				},
				()=>{
					target[this.targetPropKey] = startValue;
				}
			));
		});
	}
}

//

export class VMShowHideUI implements IVMUI {

	protected _target:any;

	constructor(protected _obj:any, private targetClass:any){
		this._obj.hide();
	}

	protected setTarget(){
		this._obj.show();
	}
	protected destroyTarget(){
		this._obj.hide();
	}

	//
	// get set
	//
	public set target(value:any){
		if(value != null && !(value instanceof this.targetClass)){
			value = null;
			console.warn("different type target set.");
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