import { EventDispatcher } from "./EventDispatcher";

export class PropertyEvent extends Event {

	static readonly UPDATE:string = "update";
	//static readonly UPDATE:string = "PropertyEvent.UPDATE";

	constructor(type:string, public readonly targe:EventDispatcher, public readonly propKeys:string[]){
		super(type);
	}
}