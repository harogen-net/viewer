import { Layer, LayerType } from "./Layer";
import { Viewer } from "../../Viewer";


export class TextLayer extends Layer {

	public textObj:any;

	constructor(private _text:string, transform:any = null, id:number = -1){
		super(transform, id);
		this._type = LayerType.TEXT;
 	}

	//
	// override
	//
	public clone(id:number = -1):this {
		var ret:this = new (this.constructor as any)(this._text, this.transform, this._id);
		ret.visible = this._visible;
		ret.locked = this._locked;
		ret.opacity = this._opacity;
		ret.shared = this._shared;
		return ret;
	}

	public getData():any {
		var ret:any = super.getData();
		ret.text = this._text;
		return ret;
	}

	//
	// getset
	//
	public get text():string{ return this._text; }
	public set text(value:string){
		this._text = value;
		this.dispatchEvent(new Event("textUpdate"));
	}
	public get plainText():string {
		return this._text.split("\n").join().split("\r").join();
	}
}