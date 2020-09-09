import { EventDispatcher } from "../events/EventDispatcher";
import { EditableSlideView } from "../view/slide/EditableSlideView";
import { ImageLayer } from "../model/layer/ImageLayer";
import { ImageManager } from "../utils/ImageManager";
import { Viewer,ViewerMode } from "../Viewer";
import { LayerType, Layer } from "../model/Layer";
import { TextLayer } from "../model/layer/TextLayer";
import { Slide, Direction } from "../model/Slide";
import { EditLayerViewController } from "./edit/EditLayerViewController";
import { ViewerDocument } from "../model/ViewerDocument";
import { IVMUI } from "../interface/IVMUI";
import { VMButton, VMToggleButton, VMShowHideUI, VMHistoricalTextInput, VMHistorycalVariableInput } from "../viewModel/VMUI";
import { PropFlags } from "../model/PropFlags";
import { PropertyEvent } from "../events/PropertyEvent";
import { HistoryManager, Command, Transaction } from "../utils/HistoryManager";
import $ from "jquery";

export class EditViewController extends EventDispatcher {

	public slideView:EditableSlideView;
	private layerDiv:EditLayerViewController;


	constructor(public obj:any){
		super();
		this.obj.addClass("slideCanvas");

		this.slideView = new EditableSlideView(new Slide(), $('<div />').appendTo(this.obj));
		this.layerDiv = new EditLayerViewController($(".layer"));

		//

		var rectEditButton = new VMToggleButton($(".menu button.same"), EditableSlideView, "rectEdit", PropFlags.ESV_RECT);
		rectEditButton.target = this.slideView;

		
		var vms:IVMUI[] = [
			new VMButton($("#main button.cut"), Layer, ()=>{
				this.slideView.cut();
			}),
			new VMButton($("#main button.copy"), Layer, ()=>{
				this.slideView.copy();
			}),
			new VMButton($("#main button.rotateL"), Layer, (layer:Layer)=>{
				HistoryManager.shared.record(new Command(
					()=>{
						layer.rotateBy(-90);
					},
					()=>{
						layer.rotateBy(90);
					}
				)).do();
			}),
			new VMButton($("#main button.rotateR"), Layer, (layer:Layer)=>{
				HistoryManager.shared.record(new Command(
					()=>{
						layer.rotateBy(90);
					},
					()=>{
						layer.rotateBy(-90);
					}
				)).do();
			}),


			new VMButton($("#main button.toAnyWhere"), Layer, ()=>{
				var subButtons = $("#main .buttonGroup > button.at");
				subButtons.toggle();
			}),
			new VMButton($("#main button.toTop"), Layer, (layer:Layer)=>{
				var subButtons = $("#main .buttonGroup > button.at");
				subButtons.hide();

				var y = layer.y;
				HistoryManager.shared.record(new Command(
					()=>{
						this.slide.arrangeLayer(this.slideView.editingLayer, Direction.TOP);
					},
					()=>{
						layer.y = y;
					}
				)).do();
			}),
			new VMButton($("#main button.toRight"), Layer, (layer:Layer)=>{
				var subButtons = $("#main .buttonGroup > button.at");
				subButtons.hide();

				var x = layer.x;
				HistoryManager.shared.record(new Command(
					()=>{
						this.slide.arrangeLayer(this.slideView.editingLayer, Direction.RIGHT);
					},
					()=>{
						layer.x = x;
					}
				)).do();
			}),
			new VMButton($("#main button.toBottom"), Layer, (layer:Layer)=>{
				var subButtons = $("#main .buttonGroup > button.at");
				subButtons.hide();

				var y = layer.y;
				HistoryManager.shared.record(new Command(
					()=>{
						this.slide.arrangeLayer(this.slideView.editingLayer, Direction.BOTTOM);
					},
					()=>{
						layer.y = y;
					}
				)).do();
			}),
			new VMButton($("#main button.toLeft"), Layer, (layer:Layer)=>{
				var subButtons = $("#main .buttonGroup > button.at");
				subButtons.hide();

				var x = layer.x;
				HistoryManager.shared.record(new Command(
					()=>{
						this.slide.arrangeLayer(this.slideView.editingLayer, Direction.LEFT);
					},
					()=>{
						layer.x = x;
					}
				)).do();
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
			new VMButton($("#main button.fit"), Layer, (layer:Layer)=>{
				var transform = layer.transform;
				HistoryManager.shared.record(new Command(
					()=>{
						this.slide.fitLayer(layer);
					},
					()=>{
						layer.transform = transform;
					}
				)).do();
			}),
			new VMButton($("#main button.imageRef"), ImageLayer, ()=>{
				$("input.imageRef")[0].click();
			}),
			new VMButton($("#main button.download"), ImageLayer, (layer:ImageLayer)=>{
				var a = document.createElement("a");
				a.href = ImageManager.shared.getSrcById(layer.imageId);
				a.target = '_blank';
				a.download = this.selectedLayer.name;
				a.click();
				window.URL.revokeObjectURL(a.href);
			}),

			new VMButton($("#main button.up"), Layer, (layer:Layer)=>{
				HistoryManager.shared.record(new Command(
					()=>{
						this.slide.swapLayer(layer, 1);
					},
					()=>{
						this.slide.swapLayer(layer, -1);
					}
				)).do();
			}),
			new VMButton($("#main button.down"), Layer, (layer:Layer)=>{
				HistoryManager.shared.record(new Command(
					()=>{
						this.slide.swapLayer(layer, -1);
					},
					()=>{
						this.slide.swapLayer(layer, 1);
					}
				)).do();
			}),
			new VMButton($("#main button.top"), Layer, (layer:Layer)=>{
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
			new VMButton($("#main button.bottom"), Layer, (layer:Layer)=>{
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

			new VMHistorycalVariableInput($(".property .position input").eq(0), Layer, "x", PropFlags.X, {v:-25}),
			new VMHistorycalVariableInput($(".property .position input").eq(1), Layer, "y", PropFlags.X, {v:-25}),
			new VMHistorycalVariableInput($(".property .scale input"), Layer, "scale", PropFlags.SCALE_X|PropFlags.SCALE_Y, {init:1, min:0.1, max:20, type:"multiply", v:0.1}),
			new VMHistorycalVariableInput($(".property .rotation input"), Layer, "rotation", PropFlags.ROTATION, {min:-180, max:180, v:5}),
			new VMHistorycalVariableInput($(".property .opacity input"), Layer, "opacity", PropFlags.OPACITY, {min:0, max:1, v:0.05}),

			new VMHistorycalVariableInput($(".property .clip input").eq(0), ImageLayer, "clipT", PropFlags.IMG_CLIP, {v:-25, min:0}),
			new VMHistorycalVariableInput($(".property .clip input").eq(1), ImageLayer, "clipR", PropFlags.IMG_CLIP, {v:-25, min:0}),
			new VMHistorycalVariableInput($(".property .clip input").eq(2), ImageLayer, "clipB", PropFlags.IMG_CLIP, {v:-25, min:0}),
			new VMHistorycalVariableInput($(".property .clip input").eq(3), ImageLayer, "clipL", PropFlags.IMG_CLIP, {v:-25, min:0}),
			new VMButton($("#main button.resetClip"), ImageLayer, (layer:ImageLayer)=>{
				if (!layer.isClipped) return;
				var clipRect = layer.clipRect.concat();
				HistoryManager.shared.record(new Command(
					()=>{
						layer.clipRect = [0,0,0,0];
					},
					()=>{
						layer.clipRect = clipRect;
					}
				)).do();
			}),

			new VMHistoricalTextInput($("#main div.textEdit textarea"), TextLayer, "text", PropFlags.TXT_TEXT),

			new VMShowHideUI($("#main div.textEdit"), TextLayer),
			new VMShowHideUI($("#main dl.clip"), ImageLayer),
			new VMShowHideUI($("#main div.imageRef"), ImageLayer),
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

				ViewerDocument.shared.allLayers.forEach(layer=>{
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

				// ViewerDocument.shared.slides.forEach(slide=>{
				// 	slide.layers.forEach(layer=>{
				// 		if(layer.type != LayerType.IMAGE) return;
				// 		var imageLayer:ImageLayer = layer as ImageLayer;
				// 		if(imageLayer.imageId == fromImageId){
				// 			transaction.record(
				// 				()=>{
				// 					imageLayer.imageId = newImageId;
				// 				},
				// 				()=>{
				// 					imageLayer.imageId = fromImageId;
				// 				}
				// 			);
				// 		}
				// 	});
				// });

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


		$("#main .close").click(() => {
			this.dispatchEvent(new Event("close"));
		});
	}

	//

	initialize(){
		this.setSlide(new Slide());
		// this.slideView.slide = new Slide();
		// $(".slideCanvas .menu span.name").text("");
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
		}

		//HistoryManager.shared.initialize();
		this.slideView.slide = newSlide;
		$(".slideCanvas .menu span.name").text(newSlide.id);

		this.layerDiv.layerViews = this.slideView.layerViews;
		if(this.slide){
			this.slide.addEventListener(PropertyEvent.UPDATE, this.onSlideUpdate);
		}
	}

	//
	// event handlers
	//
	private onSlideUpdate = (pe:PropertyEvent)=>{
		var flag = pe.propFlags;
		if(flag & PropFlags.S_LAYER_ADD|PropFlags.S_LAYER_REMOVE|PropFlags.S_LAYER_ORDER){
			this.layerDiv.layerViews = this.slideView.layerViews;
		}
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