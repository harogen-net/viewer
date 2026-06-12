import $ from "jquery";
import { EventDispatcher } from "../events/EventDispatcher";
import { PropertyEvent } from "../events/PropertyEvent";
import { IVMUI } from "../interface/IVMUI";
import { Layer, LayerType } from "../model/Layer";
import { ImageLayer } from "../model/layer/ImageLayer";
import { TextLayer } from "../model/layer/TextLayer";
import { PropFlags } from "../model/PropFlags";
import { Direction, Slide } from "../model/Slide";
import { ViewerDocument } from "../model/ViewerDocument";
import { Command, HistoryManager, Transaction } from "../utils/HistoryManager";
import { ImageManager } from "../utils/ImageManager";
import { EditableSlideView } from "../view/slide/EditableSlideView";
import { ViewerMode } from "../Viewer";
import {
    VMButton,
    VMHistoricalTextInput,
    VMHistoricalVariableInput,
    VMShowHideUI,
    VMToggleButton,
} from "../viewModel/VMUI";
import { EditLayerViewController } from "./edit/EditLayerViewController";

export class EditViewController extends EventDispatcher {
	public slideView: EditableSlideView;
	private layerDiv: EditLayerViewController;
	private observedLayer: Layer | null = null;

	constructor(public obj: any) {
		super();
		this.obj.addClass("slideCanvas");

		this.slideView = new EditableSlideView(new Slide(), $("<div />").appendTo(this.obj));
		this.layerDiv = new EditLayerViewController($(".layer"));

		//

		var rectEditButton = new VMToggleButton(
			$(".menu button.same"),
			EditableSlideView,
			"rectEdit",
			PropFlags.ESV_RECT
		);
		rectEditButton.target = this.slideView;

		var vms: IVMUI[] = [
			new VMButton($("#main button.cut"), Layer, () => {
				this.slideView.cut();
			}),
			new VMButton($("#main button.copy"), Layer, () => {
				this.slideView.copy();
			}),
			new VMButton($("#main button.rotateL"), Layer, (layer: Layer) => {
				HistoryManager.shared
					.record(
						new Command(
							() => {
								layer.rotateBy(-90);
							},
							() => {
								layer.rotateBy(90);
							}
						)
					)
					.do();
			}),
			new VMButton($("#main button.rotateR"), Layer, (layer: Layer) => {
				HistoryManager.shared
					.record(
						new Command(
							() => {
								layer.rotateBy(90);
							},
							() => {
								layer.rotateBy(-90);
							}
						)
					)
					.do();
			}),

			new VMButton($("#main button.toAnyWhere"), Layer, () => {
				var subButtons = $("#main .buttonGroup > button.at");
				subButtons.toggle();
			}),
			new VMButton($("#main button.toTop"), Layer, (layer: Layer) => {
				var subButtons = $("#main .buttonGroup > button.at");
				subButtons.hide();

				var y = layer.y;
				HistoryManager.shared
					.record(
						new Command(
							() => {
								this.slide.arrangeLayer(this.slideView.editingLayer, Direction.TOP);
							},
							() => {
								layer.y = y;
							}
						)
					)
					.do();
			}),
			new VMButton($("#main button.toRight"), Layer, (layer: Layer) => {
				var subButtons = $("#main .buttonGroup > button.at");
				subButtons.hide();

				var x = layer.x;
				HistoryManager.shared
					.record(
						new Command(
							() => {
								this.slide.arrangeLayer(this.slideView.editingLayer, Direction.RIGHT);
							},
							() => {
								layer.x = x;
							}
						)
					)
					.do();
			}),
			new VMButton($("#main button.toBottom"), Layer, (layer: Layer) => {
				var subButtons = $("#main .buttonGroup > button.at");
				subButtons.hide();

				var y = layer.y;
				HistoryManager.shared
					.record(
						new Command(
							() => {
								this.slide.arrangeLayer(this.slideView.editingLayer, Direction.BOTTOM);
							},
							() => {
								layer.y = y;
							}
						)
					)
					.do();
			}),
			new VMButton($("#main button.toLeft"), Layer, (layer: Layer) => {
				var subButtons = $("#main .buttonGroup > button.at");
				subButtons.hide();

				var x = layer.x;
				HistoryManager.shared
					.record(
						new Command(
							() => {
								this.slide.arrangeLayer(this.slideView.editingLayer, Direction.LEFT);
							},
							() => {
								layer.x = x;
							}
						)
					)
					.do();
			}),
			new VMToggleButton($("#main button.mirrorH"), Layer, "mirrorH", PropFlags.MIRROR_H),
			new VMToggleButton($("#main button.mirrorV"), Layer, "mirrorV", PropFlags.MIRROR_V),
			new VMToggleButton($("#main button.isText"), ImageLayer, "isText", PropFlags.IMG_TEXT),
			new VMButton($("#main button.copyTrans"), Layer, () => {
				this.slideView.copyTrans();
			}),
			new VMButton($("#main button.pasteTrans"), Layer, () => {
				this.slideView.pasteTrans();
			}),
			new VMButton($("#main button.fit"), Layer, (layer: Layer) => {
				var transform = layer.transform;
				HistoryManager.shared
					.record(
						new Command(
							() => {
								this.slide.fitLayer(layer);
							},
							() => {
								layer.transform = transform;
							}
						)
					)
					.do();
			}),
			new VMButton($("#main button.imageRef"), ImageLayer, () => {
				$("input.imageRef")[0].click();
			}),
			new VMButton($("#main button.download"), ImageLayer, (layer: ImageLayer) => {
				var a = document.createElement("a");
				a.href = ImageManager.shared.getSrcById(layer.imageId);
				a.target = "_blank";
				a.download = this.selectedLayer.name;
				a.click();
				window.URL.revokeObjectURL(a.href);
			}),

			new VMButton($("#main button.up"), Layer, (layer: Layer) => {
				HistoryManager.shared
					.record(
						new Command(
							() => {
								this.slide.swapLayer(layer, 1);
							},
							() => {
								this.slide.swapLayer(layer, -1);
							}
						)
					)
					.do();
			}),
			new VMButton($("#main button.down"), Layer, (layer: Layer) => {
				HistoryManager.shared
					.record(
						new Command(
							() => {
								this.slide.swapLayer(layer, -1);
							},
							() => {
								this.slide.swapLayer(layer, 1);
							}
						)
					)
					.do();
			}),
			new VMButton($("#main button.top"), Layer, (layer: Layer) => {
				var index = this.slide.indexOf(layer);
				HistoryManager.shared
					.record(
						new Command(
							() => {
								this.slide.swapLayer(layer, Slide.LAYER_NUM_MAX);
							},
							() => {
								this.slide.addLayer(layer, index);
							}
						)
					)
					.do();
			}),
			new VMButton($("#main button.bottom"), Layer, (layer: Layer) => {
				var index = this.slide.indexOf(layer);
				HistoryManager.shared
					.record(
						new Command(
							() => {
								this.slide.swapLayer(layer, -Slide.LAYER_NUM_MAX);
							},
							() => {
								this.slide.addLayer(layer, index);
							}
						)
					)
					.do();
			}),
			new VMButton($("#main button.spread"), Layer, () => {
				if (window.confirm("spread layer to all slides. are you sure?")) {
					this.slideView.spreadLayers(this.selectedLayer);
				}
			}),

			new VMHistoricalVariableInput($(".property .position input").eq(0), Layer, "x", PropFlags.X, {
				v: -25,
			}),
			new VMHistoricalVariableInput($(".property .position input").eq(1), Layer, "y", PropFlags.X, {
				v: -25,
			}),
			new VMHistoricalVariableInput(
				$(".property .scale input"),
				Layer,
				"scale",
				PropFlags.SCALE_X | PropFlags.SCALE_Y,
				{ init: 1, min: 0.1, max: 20, type: "multiply", v: 0.1 }
			),
			new VMHistoricalVariableInput(
				$(".property .rotation input"),
				Layer,
				"rotation",
				PropFlags.ROTATION,
				{ min: -180, max: 180, v: 5 }
			),
			new VMButton($("#main button.resetRotation"), Layer, (layer: ImageLayer) => {
				if (layer.rotation == 0) return;
				var rotation = layer.rotation;
				HistoryManager.shared
					.record(
						new Command(
							() => {
								layer.rotation = 0;
							},
							() => {
								layer.rotation = rotation;
							}
						)
					)
					.do();
			}),
			new VMHistoricalVariableInput(
				$(".property .opacity input"),
				Layer,
				"opacity",
				PropFlags.OPACITY,
				{ min: 0, max: 1, v: 0.05 }
			),
			new VMButton($("#main button.resetOpacity"), Layer, (layer: ImageLayer) => {
				if (layer.opacity == 1) return;
				var opacity = layer.opacity;
				HistoryManager.shared
					.record(
						new Command(
							() => {
								layer.opacity = 1;
							},
							() => {
								layer.opacity = opacity;
							}
						)
					)
					.do();
			}),

			new VMHistoricalVariableInput(
				$(".property .clip input").eq(0),
				ImageLayer,
				"clipT",
				PropFlags.IMG_CLIP,
				{ v: -25, min: 0 }
			),
			new VMHistoricalVariableInput(
				$(".property .clip input").eq(1),
				ImageLayer,
				"clipR",
				PropFlags.IMG_CLIP,
				{ v: -25, min: 0 }
			),
			new VMHistoricalVariableInput(
				$(".property .clip input").eq(2),
				ImageLayer,
				"clipB",
				PropFlags.IMG_CLIP,
				{ v: -25, min: 0 }
			),
			new VMHistoricalVariableInput(
				$(".property .clip input").eq(3),
				ImageLayer,
				"clipL",
				PropFlags.IMG_CLIP,
				{ v: -25, min: 0 }
			),
			new VMButton($("#main button.resetClip"), ImageLayer, (layer: ImageLayer) => {
				if (!layer.isClipped) return;
				var clipRect = layer.clipRect.concat();
				HistoryManager.shared
					.record(
						new Command(
							() => {
								layer.clipRect = [0, 0, 0, 0];
							},
							() => {
								layer.clipRect = clipRect;
							}
						)
					)
					.do();
			}),

			new VMHistoricalTextInput(
				$("#main div.textEdit textarea"),
				TextLayer,
				"text",
				PropFlags.TXT_TEXT
			),

			new VMShowHideUI($("#main div.textEdit"), TextLayer),
			new VMShowHideUI($("#main dl.clip"), ImageLayer),
			new VMShowHideUI($("#main div.imageRef"), ImageLayer),
		];

		this.slideView.addEventListener(PropertyEvent.UPDATE, (pe: PropertyEvent) => {
			if (pe.propFlags & PropFlags.LV_SELECT) {
				try {
					vms.forEach((vmi) => {
						vmi.target = this.selectedLayer;
					});
				} catch (e) {
					console.log(e);
					vms.forEach((vmi) => {
						vmi.target = null;
					});
				}
				this.dispatchEvent(
					new CustomEvent("selectionChanged", {
						detail: {
							hasSelection: this.hasSelectedLayer(),
							layerType: this.selectedLayer?.type ?? null,
						},
					})
				);
				this.watchSelectedLayer();
				this.emitSelectedLayerState();
				this.emitLayerListState();
			}
		});

		//

		$(".undo").click(() => {
			HistoryManager.shared.undo();
		});
		$(".redo").click(() => {
			HistoryManager.shared.redo();
		});
		HistoryManager.shared.addEventListener(PropertyEvent.UPDATE, () => {
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
		$(".slideDownload").click(() => {
			this.dispatchEvent(new Event("download"));
		});
		$(".text").click(() => {
			var textLayer: TextLayer = new TextLayer(prompt("insert text layer:"));
			//textLayer.scale = 2;
			HistoryManager.shared
				.record(
					new Command(
						() => {
							this.slide.addLayer(textLayer);
							textLayer.moveTo(this.slide.centerX, this.slide.centerY);
						},
						() => {
							this.slide.removeLayer(textLayer);
						}
					)
				)
				.do();
		});

		$("label[for='cb_imageRef']").click((e) => {
			$("input#cb_imageRef").prop("checked", !$("input#cb_imageRef").prop("checked"));
			return false;
		});
		$("input.imageRef").on("change", async (e) => {
			if (this.selectedLayer == null || this.selectedLayer.type != LayerType.IMAGE) return;
			var targetImage: ImageLayer = this.selectedLayer as ImageLayer;
			var fromImageId: string = targetImage.imageId;
			var newImageId: string = await ImageManager.shared.registImageFromFile(e.target.files[0]);

			if ($("input#cb_imageRef").prop("checked")) {
				var transaction = new Transaction();

				ViewerDocument.shared.allLayers.forEach((layer) => {
					if (layer.type != LayerType.IMAGE) return;
					var imageLayer: ImageLayer = layer as ImageLayer;
					if (imageLayer.imageId == fromImageId) {
						transaction.record(
							() => {
								imageLayer.imageId = newImageId;
							},
							() => {
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

				if (transaction.length > 0) {
					HistoryManager.shared.record(transaction).do();
				}
			} else {
				HistoryManager.shared
					.record(
						new Command(
							() => {
								targetImage.imageId = newImageId;
							},
							() => {
								targetImage.imageId = fromImageId;
							}
						)
					)
					.do();
			}
			//初期化
			$("input.imageRef").val(null);
		});

		$("#main .close").click(() => {
			this.dispatchEvent(new Event("close"));
		});
	}

	//

	initialize() {
		this.setSlide(new Slide());
		// this.slideView.slide = new Slide();
		// $(".slideCanvas .menu span.name").text("");
	}

	setMode(mode: ViewerMode): void {
		switch (mode) {
			case ViewerMode.SELECT:
				this.slideView.isActive = false;
				break;
			case ViewerMode.EDIT:
				this.slideView.isActive = true;
				break;
		}
	}

	public setSlide(newSlide: Slide) {
		if (this.slide) {
			this.slide.removeEventListener(PropertyEvent.UPDATE, this.onSlideUpdate);
		}

		//HistoryManager.shared.initialize();
		this.slideView.slide = newSlide;
		$(".slideCanvas .menu span.name").text(newSlide.id);

		this.layerDiv.layerViews = this.slideView.layerViews;
		if (this.slide) {
			this.slide.addEventListener(PropertyEvent.UPDATE, this.onSlideUpdate);
		}
		this.watchSelectedLayer();
		this.dispatchEvent(
			new CustomEvent("selectionChanged", {
				detail: {
					hasSelection: this.hasSelectedLayer(),
					layerType: this.selectedLayer?.type ?? null,
				},
			})
		);
		this.emitSelectedLayerState();
		this.emitLayerListState();
	}

	private emitLayerListState(): void {
		const selected = this.slideView.selectedLayer;
		const layers = this.slide.layers.map((layer, index) => ({
			index,
			id: layer.id,
			name: layer.name ?? "",
			type: String(layer.type),
			locked: Boolean(layer.locked),
			visible: Boolean(layer.visible),
			selected: selected === layer,
		}));
		this.dispatchEvent(
			new CustomEvent("layerListChanged", {
				detail: {
					layers,
				},
			})
		);
	}

	private watchSelectedLayer(): void {
		const currentLayer = this.slideView.editingLayer;
		if (this.observedLayer === currentLayer) {
			return;
		}
		if (this.observedLayer) {
			this.observedLayer.removeEventListener(PropertyEvent.UPDATE, this.onObservedLayerUpdate);
		}
		this.observedLayer = currentLayer;
		if (this.observedLayer) {
			this.observedLayer.addEventListener(PropertyEvent.UPDATE, this.onObservedLayerUpdate);
		}
	}

	private onObservedLayerUpdate = () => {
		this.emitSelectedLayerState();
	};

	private emitSelectedLayerState(): void {
		const layer = this.slideView.editingLayer;
		if (!layer) {
			this.dispatchEvent(
				new CustomEvent("selectedLayerStateChanged", {
					detail: {
						hasSelection: false,
						name: null,
						visible: null,
						locked: null,
						clipTop: null,
						clipRight: null,
						clipBottom: null,
						clipLeft: null,
					},
				})
			);
			return;
		}
		const imageLayer = layer.type == LayerType.IMAGE ? (layer as ImageLayer) : null;
		this.dispatchEvent(
			new CustomEvent("selectedLayerStateChanged", {
				detail: {
					hasSelection: true,
					name: layer.name,
					visible: layer.visible,
					locked: layer.locked,
					layerType: layer.type,
					x: layer.x,
					y: layer.y,
					scale: layer.scale,
					rotation: layer.rotation,
					opacity: layer.opacity,
					mirrorH: layer.mirrorH,
					mirrorV: layer.mirrorV,
					clipTop: imageLayer ? imageLayer.clipT : null,
					clipRight: imageLayer ? imageLayer.clipR : null,
					clipBottom: imageLayer ? imageLayer.clipB : null,
					clipLeft: imageLayer ? imageLayer.clipL : null,
				},
			})
		);
	}

	public hasSelectedLayer(): boolean {
		return this.slideView.editingLayer != null;
	}

	public selectEditLayerByIndex(index: number): boolean {
		if (!Number.isInteger(index)) return false;
		const layer = this.slide.layers[index];
		if (!layer) return false;
		const layerView = this.slideView.layerViews.find((view) => view.data === layer);
		if (!layerView) return false;
		this.slideView.selectLayerView(layerView);
		this.watchSelectedLayer();
		this.emitSelectedLayerState();
		this.emitLayerListState();
		return true;
	}

	public toggleSelectedLayerVisible(): boolean {
		const layer = this.slideView.editingLayer;
		if (!layer) return false;
		const from = layer.visible;
		const to = !from;
		HistoryManager.shared
			.record(
				new Command(
					() => {
						layer.visible = to;
					},
					() => {
						layer.visible = from;
					}
				)
			)
			.do();
		this.emitSelectedLayerState();
		this.emitLayerListState();
		return true;
	}

	public toggleSelectedLayerLocked(): boolean {
		const layer = this.slideView.editingLayer;
		if (!layer) return false;
		const from = layer.locked;
		const to = !from;
		HistoryManager.shared
			.record(
				new Command(
					() => {
						layer.locked = to;
					},
					() => {
						layer.locked = from;
					}
				)
			)
			.do();
		this.emitSelectedLayerState();
		this.emitLayerListState();
		return true;
	}

	public setSelectedLayerName(name: string): boolean {
		const layer = this.slideView.editingLayer;
		if (!layer) return false;
		const next = (name ?? "").trim();
		if (!next) return false;
		const from = layer.name;
		if (from === next) return true;
		HistoryManager.shared
			.record(
				new Command(
					() => {
						layer.name = next;
					},
					() => {
						layer.name = from;
					}
				)
			)
			.do();
		this.emitSelectedLayerState();
		this.emitLayerListState();
		return true;
	}

	public rotateSelectedLayer(degree: number): boolean {
		const layer = this.slideView.editingLayer;
		if (!layer) return false;
		HistoryManager.shared
			.record(
				new Command(
					() => {
						layer.rotateBy(degree);
					},
					() => {
						layer.rotateBy(-degree);
					}
				)
			)
			.do();
		this.emitSelectedLayerState();
		return true;
	}

	public toggleSelectedLayerMirrorH(): boolean {
		const layer = this.slideView.editingLayer;
		if (!layer) return false;
		const from = layer.mirrorH;
		const to = !from;
		HistoryManager.shared
			.record(
				new Command(
					() => {
						layer.mirrorH = to;
					},
					() => {
						layer.mirrorH = from;
					}
				)
			)
			.do();
		this.emitSelectedLayerState();
		return true;
	}

	public toggleSelectedLayerMirrorV(): boolean {
		const layer = this.slideView.editingLayer;
		if (!layer) return false;
		const from = layer.mirrorV;
		const to = !from;
		HistoryManager.shared
			.record(
				new Command(
					() => {
						layer.mirrorV = to;
					},
					() => {
						layer.mirrorV = from;
					}
				)
			)
			.do();
		this.emitSelectedLayerState();
		return true;
	}

	public fitSelectedLayer(): boolean {
		const layer = this.slideView.editingLayer;
		if (!layer) return false;
		const from = layer.transform;
		HistoryManager.shared
			.record(
				new Command(
					() => {
						this.slide.fitLayer(layer);
					},
					() => {
						layer.transform = from;
					}
				)
			)
			.do();
		this.emitSelectedLayerState();
		return true;
	}

	public arrangeSelectedLayer(direction: Direction): boolean {
		const layer = this.slideView.editingLayer;
		if (!layer) return false;
		const x = layer.x;
		const y = layer.y;
		HistoryManager.shared
			.record(
				new Command(
					() => {
						this.slide.arrangeLayer(layer, direction);
					},
					() => {
						layer.x = x;
						layer.y = y;
					}
				)
			)
			.do();
		this.emitSelectedLayerState();
		return true;
	}

	public swapSelectedLayer(offset: number): boolean {
		const layer = this.slideView.editingLayer;
		if (!layer) return false;
		HistoryManager.shared
			.record(
				new Command(
					() => {
						this.slide.swapLayer(layer, offset);
					},
					() => {
						this.slide.swapLayer(layer, -offset);
					}
				)
			)
			.do();
		this.emitSelectedLayerState();
		return true;
	}

	public moveSelectedLayerToTop(): boolean {
		const layer = this.slideView.editingLayer;
		if (!layer) return false;
		const index = this.slide.indexOf(layer);
		HistoryManager.shared
			.record(
				new Command(
					() => {
						this.slide.swapLayer(layer, Slide.LAYER_NUM_MAX);
					},
					() => {
						this.slide.addLayer(layer, index);
					}
				)
			)
			.do();
		this.emitSelectedLayerState();
		return true;
	}

	public moveSelectedLayerToBottom(): boolean {
		const layer = this.slideView.editingLayer;
		if (!layer) return false;
		const index = this.slide.indexOf(layer);
		HistoryManager.shared
			.record(
				new Command(
					() => {
						this.slide.swapLayer(layer, -Slide.LAYER_NUM_MAX);
					},
					() => {
						this.slide.addLayer(layer, index);
					}
				)
			)
			.do();
		this.emitSelectedLayerState();
		return true;
	}

	public copySelectedLayer(): boolean {
		if (!this.slideView.editingLayer) return false;
		this.slideView.copy();
		return true;
	}

	public cutSelectedLayer(): boolean {
		if (!this.slideView.editingLayer) return false;
		this.slideView.cut();
		return true;
	}

	public pasteLayer(): boolean {
		this.slideView.paste();
		this.emitSelectedLayerState();
		return true;
	}

	public copySelectedLayerTransform(): boolean {
		if (!this.slideView.editingLayer) return false;
		this.slideView.copyTrans();
		return true;
	}

	public pasteLayerTransform(): boolean {
		if (!this.slideView.editingLayer) return false;
		this.slideView.pasteTrans();
		this.emitSelectedLayerState();
		return true;
	}

	public removeSelectedLayer(): boolean {
		const layer = this.slideView.editingLayer;
		if (!layer) return false;
		const index = this.slide.indexOf(layer);
		HistoryManager.shared
			.record(
				new Command(
					() => {
						this.slide.removeLayer(layer);
					},
					() => {
						this.slide.addLayer(layer, index);
					}
				)
			)
			.do();
		this.emitSelectedLayerState();
		return true;
	}

	public addTextLayer(text: string): boolean {
		const normalizedText = (text ?? "").trim();
		if (!normalizedText) return false;
		const textLayer = new TextLayer(normalizedText);
		HistoryManager.shared
			.record(
				new Command(
					() => {
						this.slide.addLayer(textLayer);
						textLayer.moveTo(this.slide.centerX, this.slide.centerY);
					},
					() => {
						this.slide.removeLayer(textLayer);
					}
				)
			)
			.do();
		this.emitSelectedLayerState();
		return true;
	}

	public nudgeSelectedLayer(dx: number, dy: number): boolean {
		const layer = this.slideView.editingLayer;
		if (!layer) return false;
		const fromX = layer.x;
		const fromY = layer.y;
		const toX = fromX + dx;
		const toY = fromY + dy;
		HistoryManager.shared
			.record(
				new Command(
					() => {
						layer.x = toX;
						layer.y = toY;
					},
					() => {
						layer.x = fromX;
						layer.y = fromY;
					}
				)
			)
			.do();
		this.emitSelectedLayerState();
		return true;
	}

	public setSelectedLayerPosition(x: number, y: number): boolean {
		const layer = this.slideView.editingLayer;
		if (!layer) return false;
		if (!isFinite(x) || !isFinite(y)) return false;
		const fromX = layer.x;
		const fromY = layer.y;
		if (fromX === x && fromY === y) return true;
		HistoryManager.shared
			.record(
				new Command(
					() => {
						layer.x = x;
						layer.y = y;
					},
					() => {
						layer.x = fromX;
						layer.y = fromY;
					}
				)
			)
			.do();
		this.emitSelectedLayerState();
		return true;
	}

	public scaleSelectedLayer(factor: number): boolean {
		const layer = this.slideView.editingLayer;
		if (!layer) return false;
		if (!isFinite(factor) || factor <= 0) return false;
		const from = layer.scale;
		const to = from * factor;
		HistoryManager.shared
			.record(
				new Command(
					() => {
						layer.scale = to;
					},
					() => {
						layer.scale = from;
					}
				)
			)
			.do();
		this.emitSelectedLayerState();
		return true;
	}

	public setSelectedLayerScale(scale: number): boolean {
		const layer = this.slideView.editingLayer;
		if (!layer) return false;
		if (!isFinite(scale) || scale <= 0) return false;
		const from = layer.scale;
		if (from === scale) return true;
		HistoryManager.shared
			.record(
				new Command(
					() => {
						layer.scale = scale;
					},
					() => {
						layer.scale = from;
					}
				)
			)
			.do();
		this.emitSelectedLayerState();
		return true;
	}

	public adjustSelectedLayerRotation(delta: number): boolean {
		const layer = this.slideView.editingLayer;
		if (!layer) return false;
		const from = layer.rotation;
		const to = from + delta;
		HistoryManager.shared
			.record(
				new Command(
					() => {
						layer.rotation = to;
					},
					() => {
						layer.rotation = from;
					}
				)
			)
			.do();
		this.emitSelectedLayerState();
		return true;
	}

	public setSelectedLayerRotation(rotation: number): boolean {
		const layer = this.slideView.editingLayer;
		if (!layer) return false;
		if (!isFinite(rotation)) return false;
		const from = layer.rotation;
		if (from === rotation) return true;
		HistoryManager.shared
			.record(
				new Command(
					() => {
						layer.rotation = rotation;
					},
					() => {
						layer.rotation = from;
					}
				)
			)
			.do();
		this.emitSelectedLayerState();
		return true;
	}

	public resetSelectedLayerRotation(): boolean {
		const layer = this.slideView.editingLayer;
		if (!layer) return false;
		if (layer.rotation == 0) return true;
		const from = layer.rotation;
		HistoryManager.shared
			.record(
				new Command(
					() => {
						layer.rotation = 0;
					},
					() => {
						layer.rotation = from;
					}
				)
			)
			.do();
		this.emitSelectedLayerState();
		return true;
	}

	public adjustSelectedLayerOpacity(delta: number): boolean {
		const layer = this.slideView.editingLayer;
		if (!layer) return false;
		const from = layer.opacity;
		const to = Math.max(0, Math.min(1, from + delta));
		HistoryManager.shared
			.record(
				new Command(
					() => {
						layer.opacity = to;
					},
					() => {
						layer.opacity = from;
					}
				)
			)
			.do();
		this.emitSelectedLayerState();
		return true;
	}

	public setSelectedLayerOpacity(opacity: number): boolean {
		const layer = this.slideView.editingLayer;
		if (!layer) return false;
		if (!isFinite(opacity)) return false;
		const clamped = Math.max(0, Math.min(1, opacity));
		const from = layer.opacity;
		if (from === clamped) return true;
		HistoryManager.shared
			.record(
				new Command(
					() => {
						layer.opacity = clamped;
					},
					() => {
						layer.opacity = from;
					}
				)
			)
			.do();
		this.emitSelectedLayerState();
		return true;
	}

	public resetSelectedLayerOpacity(): boolean {
		const layer = this.slideView.editingLayer;
		if (!layer) return false;
		if (layer.opacity == 1) return true;
		const from = layer.opacity;
		HistoryManager.shared
			.record(
				new Command(
					() => {
						layer.opacity = 1;
					},
					() => {
						layer.opacity = from;
					}
				)
			)
			.do();
		this.emitSelectedLayerState();
		return true;
	}

	public adjustSelectedImageClip(
		side: "top" | "right" | "bottom" | "left",
		delta: number
	): boolean {
		const layer = this.slideView.editingLayer;
		if (!layer || layer.type != LayerType.IMAGE) return false;
		const imageLayer = layer as ImageLayer;
		const from = imageLayer.clipRect.concat();
		const next = from.concat();
		const index = side == "top" ? 0 : side == "right" ? 1 : side == "bottom" ? 2 : 3;
		next[index] = Math.max(0, next[index] + delta);
		if (next[index] === from[index]) return true;
		HistoryManager.shared
			.record(
				new Command(
					() => {
						imageLayer.clipRect = next;
					},
					() => {
						imageLayer.clipRect = from;
					}
				)
			)
			.do();
		this.emitSelectedLayerState();
		return true;
	}

	public resetSelectedImageClip(): boolean {
		const layer = this.slideView.editingLayer;
		if (!layer || layer.type != LayerType.IMAGE) return false;
		const imageLayer = layer as ImageLayer;
		if (!imageLayer.isClipped) return true;
		const from = imageLayer.clipRect.concat();
		HistoryManager.shared
			.record(
				new Command(
					() => {
						imageLayer.clipRect = [0, 0, 0, 0];
					},
					() => {
						imageLayer.clipRect = from;
					}
				)
			)
			.do();
		this.emitSelectedLayerState();
		return true;
	}

	//
	// event handlers
	//
	private onSlideUpdate = (pe: PropertyEvent) => {
		var flag = pe.propFlags;
		if (flag & (PropFlags.S_LAYER_ADD | PropFlags.S_LAYER_REMOVE | PropFlags.S_LAYER_ORDER)) {
			this.layerDiv.layerViews = this.slideView.layerViews;
			this.emitLayerListState();
		}
	};

	//
	// getset
	//
	private get slide(): Slide {
		return this.slideView.slide;
	}
	private get selectedLayer(): Layer {
		return this.slideView.selectedLayer;
	}
}
