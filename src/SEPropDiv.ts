import { EventDispatcher } from "./events/EventDispatcher";
import { PropertyInput } from "./PropertyInput";


export class SEPropDiv extends EventDispatcher {

	private inputTransX:PropertyInput;
	private inputTransY:PropertyInput;
	private inputScaleX:PropertyInput;
	private inputScaleY:PropertyInput;
	private inputRotation:PropertyInput;
	private inputOpacity:PropertyInput;
	private inputClip1:PropertyInput;
	private inputClip2:PropertyInput;
	private inputClip3:PropertyInput;
	private inputClip4:PropertyInput;

	private propertyInputs:PropertyInput[];
	
	constructor(){
		super();

	}

}