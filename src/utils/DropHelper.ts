import {EventDispatcher} from "../events/EventDispatcher";
import {IDroppable} from "../interface/IDroppable";
import { ImageManager } from "./ImageManager";

declare var $:any;

export class DropHelper extends EventDispatcher {
	public static readonly EVENT_DROP_COMPLETE:string = "DropHelper.EVENT_DROP_COMPLETE";
	public static readonly EVENT_DROP_SLIDEDATA:string = "DropHelper.EVENT_DROP_SLIDEDATA";

    constructor(target:IDroppable){
        super();

        var obj:any = target.obj;

		obj.on("dragover.dropManager", (e:any) => {
            if(!target.isActive) return;

			e.preventDefault();
			e.stopImmediatePropagation();
			obj.addClass("fileOver");
		});
		obj.on("dragleave.dropManager", (e:any) => {
            if(!target.isActive) return;

			obj.removeClass("fileOver");
		});
		obj.on("drop.dropManager", async (e:any) => {
            if(!target.isActive) return;
            
			e.preventDefault();
			e.stopImmediatePropagation();
			obj.removeClass("fileOver");
			console.log(e.originalEvent);

			var files:File[] = [];
			//e.originalEvent.dataTransfer.files.forEach(file=>{
			$.each(e.originalEvent.dataTransfer.files, (index:number, file:File) => {
				files.push(file);
				console.log(file);
			});

			if(files.length > 1){
				var naturalSort = require("javascript-natural-sort");
				var dic:any = {};
				var names:string[] = [];
				for(var i:number = 0; i < files.length; i++){
					dic[files[i].name] = files[i];
					names.push(files[i].name);
				}
				var initIndex:number = names.indexOf(names.concat().sort(naturalSort)[0]);
				for(var i:number = 0; i < files.length; i++){
					files[i] = dic[names[(i + initIndex) % names.length]];
				}
			}

			//foreachだと同時に投げられてしまい、不具合が生じる
			//よって素直にForで回し、順番を保証する
			for(var i = 0; i < files.length; i++) {
				var file = files[i];
				try{
					var imageId:string = await ImageManager.shared.registImageFromFile(file);
					var ce:CustomEvent = new CustomEvent(DropHelper.EVENT_DROP_COMPLETE, {detail:imageId});
					this.dispatchEvent(ce);
				}
				catch(e){
					console.log(e);
				}
			}
			// files.forEach(async file=>{
			// });
		});

    }


}