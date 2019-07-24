import { EventDispatcher } from "../events/EventDispatcher";
import { PropertyEvent } from "../events/PropertyEvent";

export class HistoryManager extends EventDispatcher {
	private static _instance:HistoryManager;
	public static get instance():HistoryManager {
		return this._instance;
	}
	public static get shared():HistoryManager {
		return this._instance;
	}
	
	public static init() {
		this._instance = new HistoryManager();
	}

	//

	private readonly MAX_STEP:number = 100;
	private undoStack:ICommand[];
	private redoStack:ICommand[];
//	private onTransaction:boolean = false;

	constructor(){
		super();
		this.initialize();
	}

	public initialize(){
		this.undoStack = [];
		this.redoStack = [];
		this.dispatchEvent(new PropertyEvent(PropertyEvent.UPDATE));
//		this.onTransaction = false;
	}

	public record(command:ICommand):ICommand {
		this.undoStack.push(command);
		if(this.undoStack.length > this.MAX_STEP) {this.undoStack.shift();}
		this.redoStack = [];
		this.dispatchEvent(new PropertyEvent(PropertyEvent.UPDATE));
		return command;
	}

	public undo() {
		if(!this.canUndo) return;
		var command = this.undoStack.pop();
		command.rev();
		this.redoStack.push(command);
		this.dispatchEvent(new PropertyEvent(PropertyEvent.UPDATE));
	}

	public redo() {
		if(!this.canRedo) return;
		var command = this.redoStack.pop();
		command.fwd();
		this.undoStack.push(command);
		this.dispatchEvent(new PropertyEvent(PropertyEvent.UPDATE));
	}

	//
	// get set
	//
	public get canUndo():boolean {
		return this.undoStack.length > 0;
	}
	public get canRedo():boolean {
		return this.redoStack.length > 0;
	}
}

export interface ICommand {
	fwd:()=>void;
	rev:()=>void;
	do:()=>void;
}

export class Command implements ICommand {
	constructor(public fwd:()=>void, public rev:()=>void){}
	public do(){this.fwd();}
}
export class Transaction implements ICommand {

	private fwds:(()=>void)[] = [];
	private revs:(()=>void)[] = [];

	constructor(){}

	public record(aFwd:()=>void, aRev:()=>void) {
		this.fwds.push(aFwd);
		this.revs.push(aRev);
	}

	public fwd() {
		this.fwds.forEach(aFwd => {
			aFwd();
		});
	}
	public rev() {
		this.revs.forEach(aRev => {
			aRev();
		});
	}
	public do(){this.fwd();}
	public get length():number {
		return this.fwds.length;
	}
}
