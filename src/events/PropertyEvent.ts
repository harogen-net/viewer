import { EventDispatcher } from "./EventDispatcher";

export class PropertyEvent extends Event {

	static readonly UPDATE:string = "PropertyEvent.UPDATE";

	constructor(type:string, public readonly targe:EventDispatcher = null, public readonly propFlags:number = 0, public readonly options:any = {}){
		super(type);
	}
}