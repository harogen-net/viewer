import { ImageLayer } from "./__core__/model/ImageLayer";
import { Layer, LayerType } from "./__core__/model/Layer";
import { TextLayer } from "./__core__/model/TextLayer";
import { LayerView } from "./__core__/view/LayerView";
import { TextView } from "./__core__/view/TextView";
import { ImageManager } from "./utils/ImageManager";
import { ImageView } from "./__core__/view/ImageView";
import { PropertyEvent } from "./events/LayerEvent";
import { PropFlags } from "./__core__/model/PropFlags";

declare var $:any;

export class SELayerListItem {
	
	public obj:any;

	private _layerView:LayerView;

	private eyeBtn:any;
	private lockBtn:any;
	private shareBtn:any;
	private deleteBtn:any;
	private label:any;
	private thumbnail:any;

	constructor(){
		this.obj = $('<li><img /><span></span></li>');
		this.label = this.obj.find("span");
		this.thumbnail = this.obj.find("img");

		this.eyeBtn = $('<button class="eye"><i class="fas fa-eye"></i></button>');
		this.eyeBtn.click((e:any)=>{
			if(this._layerView == null) return;
			this._layerView.data.visible = !this._layerView.data.visible;
			//e.stopImmediatePropagation();
		});

		this.lockBtn = $('<button class="lock"><i class="fas fa-lock"></i></button>');
		this.lockBtn.click((e:any)=>{
			if(this._layerView == null) return;
			this._layerView.data.locked = !this._layerView.data.locked;
			//e.stopImmediatePropagation();
		});

		this.shareBtn = $('<button class="share"><i class="fas fa-exchange-alt"></i></button>');
		this.shareBtn.click((e:any)=>{
			if(this._layerView == null) return;
			this._layerView.data.shared = !this._layerView.data.shared;
		});


		this.deleteBtn = $('<button class="delete"><i class="fas fa-times"></i></button>');
		this.deleteBtn.click((e:any)=>{
			if(this._layerView == null) return;
			if(this._layerView.data.parent == null) return;
			this._layerView.data.parent.removeLayer(this._layerView.data);
		});

		this.obj.prepend(this.shareBtn);
		this.obj.prepend(this.lockBtn);
		this.obj.prepend(this.eyeBtn);
		this.obj.append(this.deleteBtn);

		this.obj.click(()=>{
			if(this._layerView == null) return;
			this._layerView.selected = true;
		});

/*		this.label.editable("dblclick",(e:any)=>{

		});*/
	}	
	
	private updateOnLayer(flag:number = PropFlags.ALL){
		if(!this._layerView) return;

		if(flag & PropFlags.IMG_IMAGEID) {
			this.thumbnail.attr("src", ImageManager.shared.getSrcById(((this._layerView as ImageView).data as ImageLayer).imageId));
		}
		if(flag & PropFlags.NAME){
			if(this._layerView.type == LayerType.IMAGE){
				if(this._layerView.data.name != ""){
					this.label.text(this._layerView.data.name);
				}else{
					this.label.text("イメージ");
				}
			}
		}
		if(flag & PropFlags.TXT_TEXT){
			if(this._layerView.type == LayerType.TEXT){
				this.label.text(((this._layerView as TextView).data as TextLayer).plainText);
			}
		}

		if(flag & PropFlags.LOCKED){
			if(this._layerView.data.locked){
				this.lockBtn.addClass("on");
			}else{
				this.lockBtn.removeClass("on");
			}
		}
		if(flag & PropFlags.SHARED){
			if(this._layerView.data.shared){
				this.shareBtn.addClass("on");
			}else{
				this.shareBtn.removeClass("on");
			}
		}
		if(flag & PropFlags.VISIBLE){
			if(this._layerView.data.visible){
				this.eyeBtn.addClass("on");
			}else{
				this.eyeBtn.removeClass("on");
			}
		}

	}

	private updateOnLayerView(){
		if(!this._layerView) return;

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
	

	//
	// set get
	//
	public set layerView(value:LayerView){
		if(this._layerView){
			this._layerView.removeEventListener("select", this.onLayerViewUpdate);
			this._layerView.removeEventListener("unselect", this.onLayerViewUpdate);
			this._layerView.data.removeEventListener(PropertyEvent.UPDATE, this.onLayerUpdate);
		}

		//value is nullable
		this._layerView = value;
		
		if(this._layerView){
			this._layerView.addEventListener("select", this.onLayerViewUpdate);
			this._layerView.addEventListener("unselect", this.onLayerViewUpdate);
			this._layerView.data.addEventListener(PropertyEvent.UPDATE, this.onLayerUpdate);

			switch(this._layerView.type){
				case LayerType.IMAGE:
					this.thumbnail.show();
				break;
				case LayerType.TEXT:
					this.thumbnail.attr("src","");
					this.thumbnail.hide();
				break;
				default:
				break;
			}

			this.updateOnLayer();
			this.updateOnLayerView();
		}
	}
	public get layerView():LayerView{
		return this._layerView;
	}

	//
	// event handlers
	//
	private onLayerUpdate = (pe:PropertyEvent)=>{
		this.updateOnLayer(pe.propFlags);
	};
	private onLayerViewUpdate = ()=>{
		this.updateOnLayerView();
	};

}