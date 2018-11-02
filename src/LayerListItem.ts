import {Image} from "./__core__/Image";
import { EventDispatcher } from "./events/EventDispatcher";

declare var $:any;

export class LayerListItem extends EventDispatcher {
	
	public obj:any;

	private _image:Image;

	private lockBtn:any;
	private eyeBtn:any;
	private deleteBtn:any;

	constructor(){
		super();

		this.obj = $('<li><img /><span></span></li>');

		this.lockBtn = $('<button class="lock"><i class="fas fa-lock"></i></button>');
		this.lockBtn.click((e:any)=>{
			if(this._image == null) return;

			if(this.lockBtn.hasClass("on")){
				var cb:CustomEvent = new CustomEvent("update",{detail:{subType:"lock_off",target:this}});
				this.dispatchEvent(cb);
			}else{
				var cb:CustomEvent = new CustomEvent("update",{detail:{subType:"lock_on",target:this}});
				this.dispatchEvent(cb);
			}
			e.stopImmediatePropagation();
		});

		this.eyeBtn = $('<button class="eye"><i class="fas fa-eye-slash"></i></button>');
		this.eyeBtn.click((e:any)=>{
			if(this._image == null) return;
			
			if(this.eyeBtn.hasClass("on")){
				var cb:CustomEvent = new CustomEvent("update",{detail:{subType:"eye_off",target:this}});
				this.dispatchEvent(cb);
			}else{
				var cb:CustomEvent = new CustomEvent("update",{detail:{subType:"eye_on",target:this}});
				this.dispatchEvent(cb);
			}
			e.stopImmediatePropagation();
		});

		this.deleteBtn = $('<button class="delete"><i class="fas fa-times"></i></button>');
		this.deleteBtn.click((e:any)=>{
			if(this._image == null) return;
			
			var cb:CustomEvent = new CustomEvent("update",{detail:{subType:"delete",target:this}});
			this.dispatchEvent(cb);
			e.stopImmediatePropagation();
		});

		this.obj.prepend(this.lockBtn);
		this.obj.prepend(this.eyeBtn);
		this.obj.append(this.deleteBtn);

		this.obj.click(()=>{
			if(this._image == null)return;
			if(this._image.locked) return;
			if(!this._image.visible) return;
			var cb:CustomEvent = new CustomEvent("update",{detail:{subType:"select",target:this}});
			this.dispatchEvent(cb);
		});

/*		this.obj.find("span").editable("dblclick",(e:any)=>{

		});*/
	}	
	
	public update(){
		if(!this._image) return;

		if(this._image.name != ""){
			this.obj.find("span").text(this._image.name);
		}else{
			this.obj.find("span").text("イメージ");
		}

		if(this._image.locked){
			this.lockBtn.addClass("on");
		}else{
			this.lockBtn.removeClass("on");
		}
		if(!this._image.visible){
			this.eyeBtn.addClass("on");
		}else{
			this.eyeBtn.removeClass("on");
		}
		if(this._image.selected){
			this.obj.addClass("selected");
		}else{
			this.obj.removeClass("selected");
		}
	}

	//

	public set name(value:string){
		this.obj.find("span").text(value);
	}
	
	public set image(value:Image){
		this._image = value;
		
		this.update();
		if(this._image != null){
			this.obj.find("img").attr("src",this._image.data.src);
		}
	}
	public get image():Image{
		return this._image;
	}

}