import { EventDispatcher } from "./events/EventDispatcher";
import { TypeChecker } from "./utils/TypeChecker";

declare var $:any;


export class SEBoolBindingBtn {

	// public locked:boolean = false;

	// private _value:boolean = false;
	// private _disabled:boolean = false;

	// private _targetObject:EventDispatcher;
	// private _targetKey:string = "";


	// constructor(public obj:any, option:any = {}){
	// 	if(option.key != undefined && TypeChecker.isBoolean(option.key)) this._targetKey = option.key; 

	// 	this.obj.on("click.SEBoolBindingBtn",(e:any)=>{
	// 		if(this.disabled) return;
	// 	});
	// }

	// public destroy(){
	// 	this.targetObject = null;

	// 	this.obj.on("keydown.PropertyInput");
	// 	this.obj.off("mousedown.PropertyInput");
	// 	this.obj = null;
		
	// 	$(window).off("mousemove.PropertyInput");
	// 	$(window).off("mouseup.PropertyInput");
	// 	$(window).off("wheel.PropertyInput");
	// }

	// public setTarget(newTarget:EventDispatcher, newKey:string) {
	// 	this._targetKey = "";
	// 	this.targetObject = newTarget;
	// 	this.targetKey = newKey;
	// }

	// private setProperty(){
	// 	if(!this._targetObject) return;

	// 	this.locked = true;
	// 	this._targetObject[this._targetKey] = this._value;
	// 	this.locked = false;
	// //	this.dispatchEvent(new CustomEvent("update", {detail:{target:this, key:this.key, value:this._value}}));
	// }

	// private update() {
	// 	this.value = this._targetObject[this._targetKey];
	// }

	// //
	// //	get set
	// //
	// public set targetObject(value:EventDispatcher) {
	// 	if(value != null && this._targetKey != "" && !TypeChecker.isBoolean(value[this._targetKey])){
	// 		//throw new Error("target object has no [" + this._targetKey + "] key.");
	// 		this._targetKey = "";
	// 	}
	// 	if(this._targetObject){
	// 		this._targetObject.removeEventListener("update", this.onPropertyUpdate);
	// 	}
	// 	this._targetObject = value;

	// 	if(this._targetObject && this._targetKey != ""){
	// 		this.disabled = false;
	// 		this.update();
	// 		this._targetObject.addEventListener("update", this.onPropertyUpdate);
	// 	}else{
	// 		this.disabled = true;
	// 	}
	// }

	// public set targetKey(value:string) {
	// 	if(this._targetObject){
	// 		if(value != "" && !TypeChecker.isNumber(value[this._targetKey])){
	// 			throw new Error("target object has no [" + value + "] key.");
	// 		}
	// 	}
	// 	this._targetKey = value;
	// }

	// private set value(val:number){
	// 	this._value = val;
	// 	this.restrictValue();
	// 	this.obj.val(Math.floor(this._value * 100)/100);
	// }
	// private get value():number {
	// 	return this._value;
	// }
	// private set disabled(value:boolean){
	// 	if(this._disabled == value) return;
		
	// 	this._disabled = value;
	// 	this.obj.prop("disabled", this._disabled);
	// 	if(this._disabled){
	// 		this.obj.val("");
	// 	}else{
	// 		this.value = this.value;
	// 	}
	// }

	// //
	// // event handlers
	// //
	// private onPropertyUpdate = (ce:CustomEvent)=>{
	// 	this.update();
	// }

}