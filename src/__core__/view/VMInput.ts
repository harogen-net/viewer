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
		console.log("set target at VMI,")
		console.log(value);
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