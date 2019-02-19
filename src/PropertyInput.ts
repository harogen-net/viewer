import { EventDispatcher } from "./events/EventDispatcher";

declare var $:any;

export class PropertyInput extends EventDispatcher {

	private isFocus:boolean;
	private _value:number = 0;
	private _disabled:boolean = false;

	private init:number = 0;
	private min:number = -Infinity;
	private max:number = Infinity;

	constructor(public obj:any, public key:string, option:any = {}){
		super();

		if(!isNaN(parseFloat(option.init))) this.init = option.init;
		if(!isNaN(parseFloat(option.min))) this.min = option.min;
		if(!isNaN(parseFloat(option.max))) this.max = option.max;

		this._value = this.init;

		this.obj.focus(()=>{
			this.isFocus = true;
			this.obj.select();
		});
		this.obj.blur(()=>{
			this.isFocus = false;
			this.value = parseFloat(this.obj.val());
			this.dispatchUpdate();
		});

		//var acceleration:number = option.acceleration || 1;
		var v:number = option.v || 10;

		this.obj.on("keydown.PropertyInput",(e:any)=>{
			if(this.disabled) return;
			if(!this.isFocus) return;

			if(e.keyCode == 13) {
				this.value = parseFloat(this.obj.val());
				this.dispatchUpdate();
				this.obj.select();
			}else if(e.keyCode == 38){
				if(option.type == "multiply"){
					this.value *= (1 + v);
				}else{
					this.value += v;
				}
				this.dispatchUpdate();
				this.obj.select();
			}else if(e.keyCode == 40){
				if(option.type == "multiply"){
					this.value /= (1 + v);
				}else{
					this.value -= v;
				}
				this.dispatchUpdate();
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
			this.dispatchUpdate();
		});
}

	public destroy(){
		this.obj.on("keydown.PropertyInput");
		this.obj.of("mousedown.PropertyInput");
		this.obj = null;
		$(window).off("mousemove.PropertyInput");
		$(window).off("mouseup.PropertyInput");
		$(window).off("wheel.PropertyInput");
	}

	private restrictValue(){
		if(isNaN(this._value)) this._value = this.init;
		if(this._value > this.max) this._value = this.max;
		if(this._value < this.min) this._value = this.min;
	}

	private dispatchUpdate(){
		this.dispatchEvent(new CustomEvent("update", {detail:{target:this, key:this.key, value:this._value}}));
	}

	//

	public set value(val:number){
		this._value = val;
		this.restrictValue();
		this.obj.val(Math.floor(this._value * 100)/100);
	}
	public get value():number {
		return this._value;
	}

	public set disabled(value:boolean){
		if(this._disabled == value) return;
		
		this._disabled = value;
		this.obj.prop("disabled", this._disabled);
		if(this._disabled){
			this.obj.val("");
		}else{
			this.value = this.value;
		}
	}
}