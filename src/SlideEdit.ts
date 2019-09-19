import { EventDispatcher } from "./events/EventDispatcher";
import { EditableSlideView } from "./slide/EditableSlideView";
import { ImageLayer } from "./__core__/model/ImageLayer";
import { ImageManager } from "./utils/ImageManager";
import { Viewer,ViewerMode } from "./Viewer";
import { LayerType, Layer } from "./__core__/model/Layer";
import { TextLayer } from "./__core__/model/TextLayer";
import { Slide, Direction } from "./__core__/model/Slide";
import { SELayerDiv } from "./SELayerDiv";
import { VDoc } from "./__core__/model/VDoc";
import { VMUI, VMButton, VMToggleButton, VMVariableInput } from "./__core__/view/VMUI";
import { PropFlags } from "./__core__/model/PropFlags";
import { PropertyEvent } from "./events/PropertyEvent";
import { HistoryManager, Command, Transaction } from "./utils/HistoryManager";


declare var $:any;

export class SlideEdit extends EventDispatcher {

	public slideView:EditableSlideView;
	private layerDiv:SELayerDiv;


	constructor(public obj:any){
		super();
		this.obj.addClass("slideCanvas");

		HistoryManager.init();

		this.slideView = new EditableSlideView(new Slide(), $('<div />').appendTo(this.obj));
		this.layerDiv = new SELayerDiv($(".layer"));

		//

		var rectEditButton = new VMToggleButton($(".menu button.same"), EditableSlideView, "rectEdit", PropFlags.ESV_RECT);
		rectEditButton.target = this.slideView;

		var vms:VMUI[] = [
			new VMButton($("#main button.cut"), Layer, ()=>{
				this.slideView.cut();
			}),
			new VMButton($("#main button.copy"), Layer, ()=>{
				this.slideView.copy();
			}),
			new VMButton($("#main button.rotateL"), Layer, ()=>{
				var layer = this.slideView.editingLayer;
				HistoryManager.shared.record(new Command(
					()=>{
						layer.rotateBy(-90);
					},
					()=>{
						layer.rotateBy(90);
					}
				)).do();
//				this.slideView.editingLayer.rotateBy(-90);
			}),
			new VMButton($("#main button.rotateR"), Layer, ()=>{
				var layer = this.slideView.editingLayer;
				HistoryManager.shared.record(new Command(
					()=>{
						layer.rotateBy(90);
					},
					()=>{
						layer.rotateBy(-90);
					}
				)).do();

//				this.selectedLayer.rotateBy(90);
			}),
			new VMButton($("#main button.toTop"), Layer, ()=>{
				var layer = this.slideView.editingLayer;
				var y = layer.y;
				HistoryManager.shared.record(new Command(
					()=>{
						this.slide.arrangeLayer(this.slideView.editingLayer, Direction.TOP);
					},
					()=>{
						layer.y = y;
					}
				)).do();
//				this.slide.arrangeLayer(this.slideView.editingLayer, Direction.TOP);
			}),
			new VMButton($("#main button.toRight"), Layer, ()=>{
				var layer = this.slideView.editingLayer;
				var x = layer.x;
				HistoryManager.shared.record(new Command(
					()=>{
						this.slide.arrangeLayer(this.slideView.editingLayer, Direction.RIGHT);
					},
					()=>{
						layer.x = x;
					}
				)).do();
				//this.slide.arrangeLayer(this.slideView.editingLayer, Direction.RIGHT);
			}),
			new VMButton($("#main button.toBottom"), Layer, ()=>{
				var layer = this.slideView.editingLayer;
				var y = layer.y;
				HistoryManager.shared.record(new Command(
					()=>{
						this.slide.arrangeLayer(this.slideView.editingLayer, Direction.BOTTOM);
					},
					()=>{
						layer.y = y;
					}
				)).do();
//				this.slide.arrangeLayer(this.slideView.editingLayer, Direction.BOTTOM);
			}),
			new VMButton($("#main button.toLeft"), Layer, ()=>{
				var layer = this.slideView.editingLayer;
				var x = layer.x;
				HistoryManager.shared.record(new Command(
					()=>{
						this.slide.arrangeLayer(this.slideView.editingLayer, Direction.LEFT);
					},
					()=>{
						layer.x = x;
					}
				)).do();
//				this.slide.arrangeLayer(this.slideView.editingLayer, Direction.LEFT);
			}),
			new VMToggleButton($("#main button.mirrorH"), Layer, "mirrorH", PropFlags.MIRROR_H),
			new VMToggleButton($("#main button.mirrorV"), Layer, "mirrorV", PropFlags.MIRROR_V),
			new VMToggleButton($("#main button.isText"), ImageLayer, "isText", PropFlags.IMG_TEXT),
			new VMButton($("#main button.copyTrans"), Layer, ()=>{
				this.slideView.copyTrans();
			}),
			new VMButton($("#main button.pasteTrans"), Layer, ()=>{
				this.slideView.pasteTrans();
			}),
			new VMButton($("#main button.fit"), Layer, ()=>{
				this.slide.fitLayer(this.selectedLayer);
			}),
			new VMButton($("#main button.imageRef"), ImageLayer, ()=>{
				$("input.imageRef")[0].click();
			}),
			new VMButton($("#main button.download"), ImageLayer, ()=>{
				if(this.selectedLayer == null) return;
				if(this.selectedLayer.type != LayerType.IMAGE) return;
	
				var a = document.createElement("a");
				a.href = ImageManager.shared.getSrcById((this.selectedLayer as ImageLayer).imageId);
				a.target = '_blank';
				a.download = this.selectedLayer.name;
				a.click();
				window.URL.revokeObjectURL(a.href);
			}),

			new VMButton($("#main button.up"), Layer, ()=>{
				//this.slide.swapLayer(this.selectedLayer, 1);
				var layer = this.slideView.editingLayer;
				HistoryManager.shared.record(new Command(
					()=>{
						this.slide.swapLayer(layer, 1);
					},
					()=>{
						this.slide.swapLayer(layer, -1);
					}
				)).do();
			}),
			new VMButton($("#main button.down"), Layer, ()=>{
				//this.slide.swapLayer(this.selectedLayer, -1);
				var layer = this.slideView.editingLayer;
				HistoryManager.shared.record(new Command(
					()=>{
						this.slide.swapLayer(layer, -1);
					},
					()=>{
						this.slide.swapLayer(layer, 1);
					}
				)).do();
			}),
			new VMButton($("#main button.top"), Layer, ()=>{
				//this.slide.swapLayer(this.selectedLayer, Slide.LAYER_NUM_MAX);
				var layer = this.slideView.editingLayer;
				var index = this.slide.indexOf(layer);
				HistoryManager.shared.record(new Command(
					()=>{
						this.slide.swapLayer(layer, Slide.LAYER_NUM_MAX);
					},
					()=>{
						this.slide.addLayer(layer, index);
					}
				)).do();
			}),
			new VMButton($("#main button.bottom"), Layer, ()=>{
				//this.slide.swapLayer(this.selectedLayer, -Slide.LAYER_NUM_MAX);
				var layer = this.slideView.editingLayer;
				var index = this.slide.indexOf(layer);
				HistoryManager.shared.record(new Command(
					()=>{
						this.slide.swapLayer(layer, -Slide.LAYER_NUM_MAX);
					},
					()=>{
						this.slide.addLayer(layer, index);
					}
				)).do();
			}),
			new VMButton($("#main button.spread"), Layer, ()=>{
				this.slideView.spreadLayers(this.selectedLayer);
			}),

			new VMVariableInput($(".property .position input").eq(0), Layer, "x", PropFlags.X, {v:-25}),
			new VMVariableInput($(".property .position input").eq(1), Layer, "y", PropFlags.X, {v:-25}),
			new VMVariableInput($(".property .scale input"), Layer, "scale", PropFlags.SCALE_X|PropFlags.SCALE_Y, {init:1, min:0.1, max:20, type:"multiply", v:0.1}),
			new VMVariableInput($(".property .rotation input"), Layer, "rotation", PropFlags.ROTATION, {min:-180, max:180, v:5}),
			new VMVariableInput($(".property .opacity input"), Layer, "opacity", PropFlags.OPACITY, {min:0, max:1, v:0.05}),

			new VMVariableInput($(".property .clip input").eq(0), ImageLayer, "clipT", PropFlags.IMG_CLIP, {v:-25, min:0}),
			new VMVariableInput($(".property .clip input").eq(1), ImageLayer, "clipR", PropFlags.IMG_CLIP, {v:-25, min:0}),
			new VMVariableInput($(".property .clip input").eq(2), ImageLayer, "clipB", PropFlags.IMG_CLIP, {v:-25, min:0}),
			new VMVariableInput($(".property .clip input").eq(3), ImageLayer, "clipL", PropFlags.IMG_CLIP, {v:-25, min:0}),
		];


		


		this.slideView.addEventListener(PropertyEvent.UPDATE, (pe:PropertyEvent)=>{
			if(pe.propFlags|PropFlags.LV_SELECT){
				try{
					vms.forEach(vmi=>{
						vmi.target = this.selectedLayer;
					})
				}
				catch (e){
					console.log(e)
					vms.forEach(vmi=>{
						vmi.target = null;
					})
				}
			}
		});


		//

		$(".undo").click(()=>{
			HistoryManager.shared.undo();
		})
		$(".redo").click(()=>{
			HistoryManager.shared.redo();
		})
		HistoryManager.shared.addEventListener(PropertyEvent.UPDATE, ()=>{
			$(".undo").prop("disabled", !HistoryManager.shared.canUndo);
			$(".redo").prop("disabled", !HistoryManager.shared.canRedo);
		});

		//

		$(".paste").click(() => {
			this.slideView.paste();
		});
		$(".zoomIn").click(() => {
			this.slideView.scale *= 1.1;
		});
		$(".showAll").click(() => {
			this.slideView.scale = EditableSlideView.SCALE_DEFAULT;
		});
		$(".zoomOut").click(() => {
			this.slideView.scale /= 1.1;
		});
		$(".slideDownload").click(()=>{
			this.dispatchEvent(new Event("download"));
		});
		$(".text").click(()=>{
			var textLayer:TextLayer = new TextLayer(prompt("insert text layer:"));
			//textLayer.scale = 2;
			HistoryManager.shared.record(new Command(
				()=>{
					this.slide.addLayer(textLayer);
					textLayer.moveTo(this.slide.centerX, this.slide.centerY);
				},
				()=>{
					this.slide.removeLayer(textLayer);
				}
			)).do();
		});


		$("label[for='cb_imageRef']").click((e)=>{
			$("input#cb_imageRef").prop("checked", !$("input#cb_imageRef").prop("checked"));
			return false;
		});
		$("input.imageRef").on("change", async (e)=>{
			if(this.selectedLayer == null || this.selectedLayer.type != LayerType.IMAGE) return;
			var targetImage:ImageLayer = this.selectedLayer as ImageLayer;
			var fromImageId:string = targetImage.imageId;
			var newImageId:string = await ImageManager.shared.registImageFromFile(e.target.files[0]);

			if($("input#cb_imageRef").prop("checked")){
				var transaction = new Transaction();

				VDoc.shared.slides.forEach(slide=>{
					slide.layers.forEach(layer=>{
						if(layer.type != LayerType.IMAGE) return;
						var imageLayer:ImageLayer = layer as ImageLayer;
						if(imageLayer.imageId == fromImageId){
							transaction.record(
								()=>{
									imageLayer.imageId = newImageId;
								},
								()=>{
									imageLayer.imageId = fromImageId;
								}
							);
						}
					});
				});

				if(transaction.length > 0){
					HistoryManager.shared.record(transaction).do();
				}

			}else{
				HistoryManager.shared.record(new Command(
					()=>{
						targetImage.imageId = newImageId;
					},
					()=>{
						targetImage.imageId = fromImageId;
					}
				)).do();
			}
			//初期化
			$("input.imageRef").val(null);
		});


		$(".close").click(() => {
			this.dispatchEvent(new Event("close"));
		});
	}

	//

	initialize(){
		this.slideView.slide = new Slide();
		//HistoryManager.shared.initialize();
		$(".slideCanvas .menu span.name").text("");
	}

	setMode(mode:ViewerMode):void {
		switch(mode){
			case ViewerMode.SELECT:
				this.slideView.isActive = false;
			break;
			case ViewerMode.EDIT:
				this.slideView.isActive = true;
			break;
		}
	} 

	public setSlide(newSlide:Slide) {
		if(this.slide){
			this.slide.removeEventListener(PropertyEvent.UPDATE, this.onSlideUpdate);
			// this.slide.removeEventListener("update", ()=>{
			// 	this.layerDiv.update();
			// });
		}

		//HistoryManager.shared.initialize();
		this.slideView.slide = newSlide;
		$(".slideCanvas .menu span.name").text(newSlide.id);

		this.layerDiv.layerViews = this.slideView.layerViews;
		if(this.slide){
			this.slide.addEventListener(PropertyEvent.UPDATE, this.onSlideUpdate);
			// this.slide.addEventListener("update", ()=>{
			// 	this.layerDiv.update();
			// });
		}
	}

	//
	// event handlers
	//
	private onSlideUpdate = (pe:PropertyEvent)=>{
		var flag = pe.propFlags;
		if(flag & PropFlags.S_LAYER_ADD|PropFlags.S_LAYER_REMOVE|PropFlags.S_LAYER_ORDER){
			this.layerDiv.layerViews = this.slideView.layerViews;
			//this.layerDiv.update();
		}
		//console.log("slide update at slideEdit:", pe.propFlags.toString(2));
	}

	//
	// getset
	//
	private get slide():Slide {
		return this.slideView.slide;
	}
	private get selectedLayer():Layer {
		return this.slideView.selectedLayer;
	}

}