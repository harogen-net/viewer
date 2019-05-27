import {EventDispatcher} from "../events/EventDispatcher";
import {IDroppable} from "../interface/IDroppable";

declare var $:any;
declare var jsSHA:any;
//declare function require(x: string): any;

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
		obj.on("drop.dropManager", (e:any) => {
            if(!target.isActive) return;
            
			e.preventDefault();
			e.stopImmediatePropagation();
			obj.removeClass("fileOver");

			var files:any[] = [];
			$.each(e.originalEvent.dataTransfer.files, (index:number, file:any) => {
				files.push(file);
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

			let loadFile = (file:any) => {
                var reader = new FileReader();
				reader.addEventListener('load', (e:any) => {
					var imgObj = $('<img src="' + reader.result + '" />');

 					var shaObj = new jsSHA("SHA-256","TEXT");
					shaObj.update(reader.result);
					//var sha256digest = shaObj.getHash("HEX"); 

					imgObj.bind("load",()=>{
						imgObj.unbind("load");
						$("body").append(imgObj);
						imgObj.ready(()=>{
						//	setTimeout(()=>{
								var e:CustomEvent = new CustomEvent(DropHelper.EVENT_DROP_COMPLETE, {detail:imgObj});
								this.dispatchEvent(e);
								
								if(files.length > 0){
									loadFile(files.shift());
								}else{
									console.log("drop complete");
								}
						//	},10);
                        });
					});
					//imgのjqueryオブジェクトに画像バイナリデータから生成したハッシュ値を固有IDとしてセット
					imgObj.data("imageId",shaObj.getHash("HEX"));
					imgObj.data("name",file.name);
				});
				try{
					reader.readAsDataURL(file);
				}
				catch(e){
					
				}
			}
			loadFile(files.shift());
		});

    }


}