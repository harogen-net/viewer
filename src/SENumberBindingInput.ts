import { EventDispatcher } from "./events/EventDispatcher";
import { TypeChecker } from "./utils/TypeChecker";
import { PropertyEvent } from "./events/LayerEvent";

declare var $:any;

export class PropertyInput {

	public locked:boolean = false;

	private isFocus:boolean;
	private _value:number = 0;
	private _disabled:boolean = false;

	private init:number = 0;
	private min:number = -Infinity;
	private max:number = Infinity;

	private _targetObject:EventDispatcher;
	private _targetKey:string = "";

	constructor(public obj:any, option:any = {}){

		if(!isNaN(parseFloat(option.init))) this.init = option.init;
		if(!isNaN(parseFloat(option.min))) this.min = option.min;
		if(!isNaN(parseFloat(option.max))) this.max = option.max;
		if(option.key != undefined && TypeChecker.isString(option.key)) this._targetKey = option.key; 

		this._value = this.init;

		this.obj.focus(()=>{
			this.isFocus = true;
			this.obj.select();
		});
		this.obj.blur(()=>{
			this.isFocus = false;
			this.value = parseFloat(this.obj.val());
			this.setProperty();
		});

		//var acceleration:number = option.acceleration || 1;
		var v:number = option.v || 10;

		this.obj.on("keydown.PropertyInput",(e:any)=>{
			if(this.disabled) return;
			if(!this.isFocus) return;

			if(e.keyCode == 13) {
				this.value = parseFloat(this.obj.val());
				this.setProperty();
				this.obj.select();
			}else if(e.keyCode == 38){
				if(option.type == "multiply"){
					this.value *= (1 + v);
				}else{
					this.value += v;
				}
				this.setProperty();
				this.obj.select();
			}else if(e.keyCode == 40){
				if(option.type == "multiply"){
					this.value /= (1 + v);
				}else{
					this.value -= v;
				}
				this.setProperty();
				this.obj.select();
			}
		});
		/*this.obj.on("mousedown.PropertyInput",(e:any)=>{
			$(window).off("mousemove.PropertyInput");
			$(window).off("mouseup.PropertyInput");

			var pressX:number = e.screenX;
			var currentValue:number = this._value;
			$(window).on("mousemove.PropertyInput",(e:any)=>{
				//this.obj.prop("readonly", true);
				var delta:number = (((e.screenX - pressX) * acceleration));
				if(v != 0) delta = Math.round(delta / v) * v;

				this.value = currentValue + delta;
				this.dispatchUpdate();
			});
			$(window).on("mouseup.PropertyInput",(e:any)=>{
				//this.obj.prop("readonly", false);
				$(window).off("mousemove.PropertyInput");
				$(window).off("mouseup.PropertyInput");
				this.obj.select();
			});

			
		});*/
		$(window).on("wheel.PropertyInput",(e:any)=>{
			if(this.disabled) return;
			if(!this.isFocus) return;

			var delta:number = -1 * (e.originalEvent.deltaY / Math.abs(e.originalEvent.deltaY)) * v;
			if(option.type == "multiply"){
				this.value *= (1 + delta);
			}else{
				this.value += delta;
			}
			this.setProperty();
		});
	}

	public destroy(){
		this.targetObject = null;

		this.obj.off("keydown.PropertyInput");
		this.obj.off("mousedown.PropertyInput");
		this.obj = null;
		
		$(window).off("mousemove.PropertyInput");
		$(window).off("mouseup.PropertyInput");
		$(window).off("wheel.PropertyInput");
	}

	public setTarget(newTarget:EventDispatcher, newKey:string) {
		this._targetKey = "";
		this.targetObject = newTarget;
		this.targetKey = newKey;

		// if(newTarget != null && key != "" && !(newTarget[key] instanceof Number)){
		// 	throw new Error();
		// }
		// if(this._targetObject){
		// 	this._targetObject.removeEventListener(PropertyEvent.UPDATE, this.onPropertyUpdate);
		// }
		// this._targetObject = newTarget;
		// this._targetKey = key;

		// if(this._targetObject){
		// 	this.disabled = false;
		// 	this.update();
		// 	this._targetObject.addEventListener(PropertyEvent.UPDATE, this.onPropertyUpdate);
		// }else{
		// 	this.disabled = true;
		// }
	}

	private restrictValue(){
		if(isNaN(this._value)) this._value = this.init;
		if(this._value > this.max) this._value = this.max;
		if(this._value < this.min) this._value = this.min;
	}

	private setProperty(){
		if(!this._targetObject) return;

		this.locked = true;
		this._targetObject[this._targetKey] = this._value;
		this.locked = false;
	//	this.dispatchEvent(new CustomEvent(PropertyEvent.UPDATE, {detail:{target:this, key:this.key, value:this._value}}));
	}

	private update() {
		this.value = this._targetObject[this._targetKey];
	}

	//
	//	get set
	//
	public set targetObject(value:EventDispatcher) {
		if(this._targetObject){
			this._targetObject.removeEventListener(PropertyEvent.UPDATE, this.onPropertyUpdate);
		}
		this._targetObject = value;

		if(this._targetObject && this._targetKey != "" && value[this._targetKey] != undefined && TypeChecker.isNumber(value[this._targetKey])){
			this.disabled = false;
			this.update();
			this._targetObject.addEventListener(PropertyEvent.UPDATE, this.onPropertyUpdate);
		}else{
			this.disabled = true;
		}
	}

	public set targetKey(value:string) {
		if(this._targetObject){
			if(value != "" && !TypeChecker.isNumber(value[this._targetKey])){
				throw new Error("target object has no [" + value + "] key.");
			}
		}
		this._targetKey = value;
	}

	private set value(val:number){
		this._value = val;
		this.restrictValue();
		this.obj.val(Math.floor(this._value * 100)/100);
	}
	private get value():number {
		return this._value;
	}
	private set disabled(value:boolean){
		if(this._disabled == value) return;
		
		this._disabled = value;
		this.obj.prop("disabled", this._disabled);
		if(this._disabled){
			this.obj.val("");
		}else{
			this.value = this.value;
		}
	}

	//
	// event handlers
	//
	private onPropertyUpdate = (pe:PropertyEvent)=>{
		if(this.locked) return;
		if(this._targetKey == "") return;
		if(pe.targe != this._targetObject) return;
		if(pe.propKeys.length == 0 || pe.propKeys.indexOf(this._targetKey) != -1){
			this.update();
		}
	}
}