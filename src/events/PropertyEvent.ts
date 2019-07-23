import { EventDispatcher } from "./EventDispatcher";

export class PropertyEvent extends Event {

	static readonly UPDATE:string = "PropertyEvent.UPDATE";

	constructor(type:string, public readonly targe:EventDispatcher, public readonly propFlags:number, public readonly options:any = {}){
		super(type);
	}
}