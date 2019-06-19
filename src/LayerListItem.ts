import { ImageLayer } from "./__core__/model/ImageLayer";
import { EventDispatcher } from "./events/EventDispatcher";
import { Layer, LayerType } from "./__core__/model/Layer";
import { TextLayer } from "./__core__/model/TextLayer";
import { LayerView } from "./__core__/view/LayerView";
import { TextView } from "./__core__/view/TextView";
import { ImageManager } from "./utils/ImageManager";
import { ImageView } from "./__core__/view/ImageView";

declare var $:any;

export class LayerListItem extends EventDispatcher {
	
	public obj:any;

	private _layerView:LayerView;

	private eyeBtn:any;
	private lockBtn:any;
	private shareBtn:any;
	private deleteBtn:any;
	private label:any;
	private thumbnail:any;

	constructor(){
		super();

		this.obj = $('<li><img /><span></span></li>');
		this.label = this.obj.find("span");
		this.thumbnail = this.obj.find("img");

		this.eyeBtn = $('<button class="eye"><i class="fas fa-eye"></i></button>');
		this.eyeBtn.click((e:any)=>{
			if(this._layerView == null) return;
			
			if(this.eyeBtn.hasClass("on")){
				var cb:CustomEvent = new CustomEvent("update",{detail:{subType:"eye_off",target:this}});
				this.dispatchEvent(cb);
			}else{
				var cb:CustomEvent = new CustomEvent("update",{detail:{subType:"eye_on",target:this}});
				this.dispatchEvent(cb);
			}
			e.stopImmediatePropagation();
		});

		this.lockBtn = $('<button class="lock"><i class="fas fa-lock"></i></button>');
		this.lockBtn.click((e:any)=>{
			if(this._layerView == null) return;

			if(this.lockBtn.hasClass("on")){
				var cb:CustomEvent = new CustomEvent("update",{detail:{subType:"lock_off",target:this}});
				this.dispatchEvent(cb);
			}else{
				var cb:CustomEvent = new CustomEvent("update",{detail:{subType:"lock_on",target:this}});
				this.dispatchEvent(cb);
			}
			e.stopImmediatePropagation();
		});

		this.shareBtn = $('<button class="share"><i class="fas fa-exchange-alt"></i></button>');
		this.shareBtn.click((e:any)=>{
			if(this._layerView == null) return;
			
			if(this.shareBtn.hasClass("on")){
				var cb:CustomEvent = new CustomEvent("update",{detail:{subType:"share_off",target:this}});
				this.dispatchEvent(cb);
			}else{
				var cb:CustomEvent = new CustomEvent("update",{detail:{subType:"share_on",target:this}});
				this.dispatchEvent(cb);
			}
			e.stopImmediatePropagation();
		});


		this.deleteBtn = $('<button class="delete"><i class="fas fa-times"></i></button>');
		this.deleteBtn.click((e:any)=>{
			if(this._layerView == null) return;
			
			var cb:CustomEvent = new CustomEvent("update",{detail:{subType:"delete",target:this}});
			this.dispatchEvent(cb);
			e.stopImmediatePropagation();
		});

		this.obj.prepend(this.shareBtn);
		this.obj.prepend(this.lockBtn);
		this.obj.prepend(this.eyeBtn);
		this.obj.append(this.deleteBtn);

		this.obj.click(()=>{
			if(this._layerView == null)return;
//			if(this._image.locked) return;
//			if(!this._image.visible) return;
			var cb:CustomEvent = new CustomEvent("update",{detail:{subType:"select",target:this}});
			this.dispatchEvent(cb);
		});

/*		this.label.editable("dblclick",(e:any)=>{

		});*/
	}	
	
	public update(){
		if(!this._layerView) return;

		switch(this._layerView.type){
			case LayerType.IMAGE:
				if(this._layerView.data.name != ""){
					this.label.text(this._layerView.data.name);
				}else{
					this.label.text("イメージ");
				}
			break;
			case LayerType.TEXT:
				this.label.text(((this._layerView as TextView).data as TextLayer).text);
				//this.label.text((this._layer as TextLayer).plainText);
			break;
		}

		if(this._layerView.data.locked){
			this.lockBtn.addClass("on");
		}else{
			this.lockBtn.removeClass("on");
		}
		if(this._layerView.data.shared){
			this.shareBtn.addClass("on");
		}else{
			this.shareBtn.removeClass("on");
		}
		
		if(this._layerView.data.visible){
			this.eyeBtn.addClass("on");
		}else{
			this.eyeBtn.removeClass("on");
		}
		if(this._layerView.selected){
			this.obj.addClass("selected");
		}else{
			this.obj.removeClass("selected");
		}
	}

	//

	// public set name(value:string){
	// 	this.label.text(value);
	// }
	
	public set layerView(value:LayerView){
		this._layerView = value;
		
		this.update();

		if(this._layerView != null){
			switch(this._layerView.type){
				case LayerType.IMAGE:
					this.thumbnail.attr("src", ImageManager.shared.getSrcById(((this._layerView as ImageView).data as ImageLayer).imageId));
					this.thumbnail.show();
				break;
				case LayerType.TEXT:
					this.thumbnail.attr("src","");
					this.thumbnail.hide();
				break;
				default:

				break;
			}
		}
	}
	public get layerView():LayerView{
		return this._layerView;
	}

}