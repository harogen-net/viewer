import { EventDispatcher } from "./EventDispatcher";


export class LayerEvent extends Event {
	constructor(type:string, public readonly targe:EventDispatcher, public readonly props:object){
		super(type);
	}
}