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
				const imageRefInput = $("input.imageRef").get(0) as HTMLInputElement | undefined;
				imageRefInput?.click();
			}),
			new VMButton($("#main button.download"), ImageLayer, () => {
				this.downloadSelectedImage();
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

			// VMHistoricalVariableInput entries removed: React (RuntimeShell) owns
			// position/scale/rotation/opacity/clip editing via bridge commands.
			// Legacy inputs in .property / .clip remain in DOM but are no longer
			// managed here, so they will stay disabled.

			// VMHistoricalTextInput removed: React setSelectedLayerText owns text editing.
			// VMShowHideUI removed: React controls visibility based on layerType from bridge.
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
			if (pe.propFlags & (PropFlags.DSV_SCALE | PropFlags.ESV_RECT)) {
				this.emitCanvasState();
			}
		});

		//

		$(".undo").click((event) => {
			if ((event.currentTarget as HTMLElement)?.dataset?.reactControlled === "true") return;
			HistoryManager.shared.undo();
		});
		$(".redo").click((event) => {
			if ((event.currentTarget as HTMLElement)?.dataset?.reactControlled === "true") return;
			HistoryManager.shared.redo();
		});
		HistoryManager.shared.addEventListener(PropertyEvent.UPDATE, () => {
			$(".undo").prop("disabled", !HistoryManager.shared.canUndo);
			$(".redo").prop("disabled", !HistoryManager.shared.canRedo);
		});

		//

		$(".paste").click((event) => {
			if ((event.currentTarget as HTMLElement)?.dataset?.reactControlled === "true") return;
			this.slideView.paste();
		});
		$(".zoomIn").click((event) => {
			if ((event.currentTarget as HTMLElement)?.dataset?.reactControlled === "true") return;
			this.zoomInCanvas();
		});
		$(".showAll").click((event) => {
			if ((event.currentTarget as HTMLElement)?.dataset?.reactControlled === "true") return;
			this.resetCanvasZoom();
		});
		$(".zoomOut").click((event) => {
			if ((event.currentTarget as HTMLElement)?.dataset?.reactControlled === "true") return;
			this.zoomOutCanvas();
		});
		$(".slideDownload").click((event) => {
			if ((event.currentTarget as HTMLElement)?.dataset?.reactControlled === "true") return;
			this.dispatchEvent(new Event("download"));
		});
		// Legacy .text button: React-side addTextLayer is now the primary path.
		// Fallback prompt is kept for standalone (non-React) usage only.
		$(".text").click((event) => {
			if ((event.currentTarget as HTMLElement)?.dataset?.reactControlled === "true") return;
			const text = prompt("insert text layer:");
			if (text == null) return;
			this.addTextLayer(text);
		});

		$("label[for='cb_imageRef']").click((e) => {
			$("input#cb_imageRef").prop("checked", !$("input#cb_imageRef").prop("checked"));
			return false;
		});
		$("input.imageRef").on("change", async (e) => {
			const file = (e.target as HTMLInputElement)?.files?.[0];
			if (!file) return;
			await this.replaceSelectedImage(file, $("input#cb_imageRef").prop("checked"));
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
		this.emitCanvasState();
	}

	private emitCanvasState(): void {
		this.dispatchEvent(
			new CustomEvent("canvasStateChanged", {
				detail: {
					scale: this.slideView.scale,
					rectEdit: this.slideView.rectEdit,
				},
			})
		);
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
					isText: imageLayer ? imageLayer.isText : null,
					textContent: layer.type === LayerType.TEXT ? (layer as TextLayer).text : null,
					clipTop: imageLayer ? imageLayer.clipT : null,
					clipRight: imageLayer ? imageLayer.clipR : null,
					clipBottom: imageLayer ? imageLayer.clipB : null,
					clipLeft: imageLayer ? imageLayer.clipL : null,
				},
			})
		);
	}

	public toggleSelectedLayerIsText(): boolean {
		const layer = this.slideView.editingLayer;
		if (!layer || layer.type != LayerType.IMAGE) return false;
		const imageLayer = layer as ImageLayer;
		HistoryManager.shared
			.record(
				new Command(
					() => {
						imageLayer.isText = !imageLayer.isText;
					},
					() => {
						imageLayer.isText = !imageLayer.isText;
					}
				)
			)
			.do();
		this.emitSelectedLayerState();
		return true;
	}

	public spreadSelectedLayer(): boolean {
		const layer = this.selectedLayer;
		if (!layer) return false;
		if (!window.confirm("spread layer to all slides. are you sure?")) return false;
		this.slideView.spreadLayers(layer);
		return true;
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

	public setSelectedLayerText(text: string): boolean {
		const layer = this.slideView.editingLayer;
		if (!layer || layer.type !== LayerType.TEXT) return false;
		const textLayer = layer as TextLayer;
		const from = textLayer.text;
		const next = text ?? "";
		if (from === next) return true;
		HistoryManager.shared
			.record(
				new Command(
					() => {
						textLayer.text = next;
					},
					() => {
						textLayer.text = from;
					}
				)
			)
			.do();
		this.emitSelectedLayerState();
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

	public async replaceSelectedImage(file: File, applyAllReferences: boolean): Promise<boolean> {
		const layer = this.slideView.editingLayer;
		if (!layer || layer.type != LayerType.IMAGE || !file) return false;
		const targetImage = layer as ImageLayer;
		const fromImageId = targetImage.imageId;
		const newImageId = await ImageManager.shared.registImageFromFile(file);
		if (!newImageId) return false;

		if (applyAllReferences) {
			const transaction = new Transaction();
			ViewerDocument.shared.allLayers.forEach((tmpLayer) => {
				if (tmpLayer.type != LayerType.IMAGE) return;
				const imageLayer = tmpLayer as ImageLayer;
				if (imageLayer.imageId != fromImageId) return;
				transaction.record(
					() => {
						imageLayer.imageId = newImageId;
					},
					() => {
						imageLayer.imageId = fromImageId;
					}
				);
			});
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

		this.emitSelectedLayerState();
		return true;
	}

	public downloadSelectedImage(): boolean {
		const layer = this.slideView.editingLayer;
		if (!layer || layer.type != LayerType.IMAGE) return false;
		const imageLayer = layer as ImageLayer;
		const src = ImageManager.shared.getSrcById(imageLayer.imageId);
		if (!src) return false;
		const a = document.createElement("a");
		a.href = src;
		a.target = "_blank";
		a.download = this.selectedLayer?.name || "image";
		a.click();
		window.URL.revokeObjectURL(a.href);
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

	public zoomInCanvas(): void {
		this.setCanvasScale(this.slideView.scale * 1.1);
	}

	public zoomOutCanvas(): void {
		this.setCanvasScale(this.slideView.scale / 1.1);
	}

	public resetCanvasZoom(): void {
		this.setCanvasScale(EditableSlideView.SCALE_DEFAULT);
	}

	public setCanvasScale(scale: number): boolean {
		if (!isFinite(scale) || scale <= 0) return false;
		const next = Math.max(0.1, Math.min(20, scale));
		if (next === this.slideView.scale) return true;
		this.slideView.scale = next;
		this.emitCanvasState();
		return true;
	}

	public toggleRectEdit(): void {
		this.setRectEdit(!this.slideView.rectEdit);
	}

	public setRectEdit(enabled: boolean): void {
		if (this.slideView.rectEdit === enabled) return;
		this.slideView.rectEdit = enabled;
		this.emitCanvasState();
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
