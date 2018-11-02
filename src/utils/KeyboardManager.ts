import { EventDispatcher } from "../events/EventDispatcher";

export class KeyboardManager extends EventDispatcher {

	private static _instance:KeyboardManager;

	/** インスタンスの取得 */
	public static get instance():KeyboardManager {
	if (!this._instance) {
	  this._instance = new KeyboardManager();
	}

	// 生成済みのインスタンスを返す
	return this._instance;
	}

	public static isDown(code:number):boolean{
		if(!this._instance) KeyboardManager.instance;
		
		return this._instance.input_key_buffer[code] as boolean;
	}

	public static addEventListener(type:string, callback:Function, priolity?:number) {
		if(!this._instance) this._instance = new KeyboardManager();
		this._instance.addEventListener(type,callback,priolity);
	}
	
	//

	public input_key_buffer:any[];

	private readonly ctrlKey:number = 17;
	private readonly cmdKey:number = 91;
	private readonly vKey:number = 86;
	private readonly cKey:number = 67;
	private readonly xKey:number = 88;

	private constructor() {
		super();
		this.input_key_buffer = [];

		document.onkeydown = (e)=>{
			this.input_key_buffer[e.keyCode] = true;

			if(e.keyCode == this.cKey){
				if(e.ctrlKey){
				//if(this.input_key_buffer[this.ctrlKey]){
					this.dispatchEvent(new Event("copy"));
				}
			}else if(e.keyCode == this.vKey){
				if(e.ctrlKey){
//				if(this.input_key_buffer[this.ctrlKey]){
					this.dispatchEvent(new Event("paste"));
				}
			}else if(e.keyCode == this.xKey){
				if(e.ctrlKey){
//				if(this.input_key_buffer[this.ctrlKey]){
					this.dispatchEvent(new Event("cut"));
				}
			}
		};
		document.onkeyup = (e)=>{
			this.input_key_buffer[e.keyCode] = false;
		};
	}
}