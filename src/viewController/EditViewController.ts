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
import { VMButton } from "../viewModel/VMUI";
import { EditLayerViewController } from "./edit/EditLayerViewController";

export class EditViewController extends EventDispatcher {
	public slideView: EditableSlideView;
	private layerDiv: EditLayerViewController;
	private observedLayer: Layer | null = null;

	private bindLegacyClick(selector: string, handler: (event: JQuery.ClickEvent) => void): void {
		$(selector).each((_index, element) => {
			const target = $(element);
			if (target.attr("data-react-controlled") === "true") return;
			target.on("click", handler);
		});
	}

	private bindLegacyChange(selector: string, handler: (event: JQuery.ChangeEvent) => void): void {
		$(selector).each((_index, element) => {
			const target = $(element);
			if (target.attr("data-react-controlled") === "true") return;
			target.on("change", handler);
		});
	}

	private setLegacyDisabled(selector: string, disabled: boolean): void {
		$(selector).each((_index, element) => {
			const target = $(element);
			if (target.attr("data-react-controlled") === "true") return;
			target.prop("disabled", disabled);
		});
	}

	private requestEditCommand(command: string): void {
		this.dispatchEvent(new CustomEvent("requestEditCommand", { detail: { command } }));
	}

	constructor(public obj: any) {
		super();
		this.obj.addClass("slideCanvas");

		this.slideView = new EditableSlideView(new Slide(), $("<div />").appendTo(this.obj));
		this.layerDiv = new EditLayerViewController($(".layer"));

		//

		var rectEditButton = new VMButton(
			$(".menu button.same"),
			EditableSlideView,
			() => {
				this.requestEditCommand("toggleRectEdit");
			}
		);
		rectEditButton.target = this.slideView;

		var vms: IVMUI[] = [
			new VMButton($("#main button.cut"), Layer, () => {
				this.requestEditCommand("cutSelectedLayer");
			}),
			new VMButton($("#main button.copy"), Layer, () => {
				this.requestEditCommand("copySelectedLayer");
			}),
			new VMButton($("#main button.rotateL"), Layer, () => {
				this.requestEditCommand("rotateSelectedLayerLeft");
			}),
			new VMButton($("#main button.rotateR"), Layer, () => {
				this.requestEditCommand("rotateSelectedLayerRight");
			}),

			new VMButton($("#main button.toAnyWhere"), Layer, () => {
				var subButtons = $("#main .buttonGroup > button.at");
				subButtons.toggle();
			}),
			new VMButton($("#main button.toTop"), Layer, () => {
				var subButtons = $("#main .buttonGroup > button.at");
				subButtons.hide();
				this.requestEditCommand("arrangeSelectedLayerTop");
			}),
			new VMButton($("#main button.toRight"), Layer, () => {
				var subButtons = $("#main .buttonGroup > button.at");
				subButtons.hide();
				this.requestEditCommand("arrangeSelectedLayerRight");
			}),
			new VMButton($("#main button.toBottom"), Layer, () => {
				var subButtons = $("#main .buttonGroup > button.at");
				subButtons.hide();
				this.requestEditCommand("arrangeSelectedLayerBottom");
			}),
			new VMButton($("#main button.toLeft"), Layer, () => {
				var subButtons = $("#main .buttonGroup > button.at");
				subButtons.hide();
				this.requestEditCommand("arrangeSelectedLayerLeft");
			}),
			new VMButton($("#main button.mirrorH"), Layer, () => {
				this.requestEditCommand("toggleSelectedLayerMirrorH");
			}),
			new VMButton($("#main button.mirrorV"), Layer, () => {
				this.requestEditCommand("toggleSelectedLayerMirrorV");
			}),
			new VMButton($("#main button.isText"), ImageLayer, () => {
				this.requestEditCommand("toggleSelectedLayerIsText");
			}),
			new VMButton($("#main button.copyTrans"), Layer, () => {
				this.requestEditCommand("copySelectedLayerTransform");
			}),
			new VMButton($("#main button.pasteTrans"), Layer, () => {
				this.requestEditCommand("pasteLayerTransform");
			}),
			new VMButton($("#main button.fit"), Layer, () => {
				this.requestEditCommand("fitSelectedLayer");
			}),
			new VMButton($("#main button.imageRef"), ImageLayer, () => {
				const imageRefInput = $("input.imageRef").get(0) as HTMLInputElement | undefined;
				imageRefInput?.click();
			}),
			new VMButton($("#main button.download"), ImageLayer, () => {
				this.requestEditCommand("downloadSelectedImage");
			}),

			new VMButton($("#main button.up"), Layer, () => {
				this.requestEditCommand("moveSelectedLayerUp");
			}),
			new VMButton($("#main button.down"), Layer, () => {
				this.requestEditCommand("moveSelectedLayerDown");
			}),
			new VMButton($("#main button.top"), Layer, () => {
				this.requestEditCommand("moveSelectedLayerToTop");
			}),
			new VMButton($("#main button.bottom"), Layer, () => {
				this.requestEditCommand("moveSelectedLayerToBottom");
			}),
			new VMButton($("#main button.spread"), Layer, () => {
				this.requestEditCommand("spreadSelectedLayer");
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

		this.bindLegacyClick(".undo", () => {
			this.requestEditCommand("undo");
		});
		this.bindLegacyClick(".redo", () => {
			this.requestEditCommand("redo");
		});
		HistoryManager.shared.addEventListener(PropertyEvent.UPDATE, () => {
			this.setLegacyDisabled(".undo", !HistoryManager.shared.canUndo);
			this.setLegacyDisabled(".redo", !HistoryManager.shared.canRedo);
		});

		//

		this.bindLegacyClick(".paste", () => {
			this.requestEditCommand("pasteLayer");
		});
		this.bindLegacyClick(".zoomIn", () => {
			this.requestEditCommand("zoomInCanvas");
		});
		this.bindLegacyClick(".showAll", () => {
			this.requestEditCommand("resetCanvasZoom");
		});
		this.bindLegacyClick(".zoomOut", () => {
			this.requestEditCommand("zoomOutCanvas");
		});
		this.bindLegacyClick(".slideDownload", () => {
			this.requestEditCommand("downloadSelectedSlide");
		});
		this.bindLegacyClick(".text", () => {
			this.requestEditCommand("requestTextLayerInput");
		});

		this.bindLegacyClick("label[for='cb_imageRef']", () => {
			$("input#cb_imageRef").prop("checked", !$("input#cb_imageRef").prop("checked"));
			return false;
		});
		this.bindLegacyChange("input.imageRef", async (e) => {
			const file = (e.target as HTMLInputElement)?.files?.[0];
			if (!file) return;
			await this.replaceSelectedImage(file, $("input#cb_imageRef").prop("checked"));
			//初期化
			$(e.currentTarget).val(null);
		});

		this.bindLegacyClick("#main .close", () => {
			this.requestEditCommand("closeEditMode");
		});
	}

	//

	initialize() {
		this.setSlide(new Slide());
		// this.slideView.slide = new Slide();
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
		this.syncLegacyRectEditButton();
		this.dispatchEvent(
			new CustomEvent("canvasStateChanged", {
				detail: {
					scale: this.slideView.scale,
					rectEdit: this.slideView.rectEdit,
				},
			})
		);
	}

	private syncLegacyRectEditButton(): void {
		$(".menu button.same").each((_index, element) => {
			const target = $(element);
			if (target.attr("data-react-controlled") === "true") return;
			target.toggleClass("on", Boolean(this.slideView.rectEdit));
		});
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
			shared: Boolean(layer.shared),
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

	private onObservedLayerUpdate = (pe: PropertyEvent) => {
		this.emitSelectedLayerState();
		if (pe.propFlags & (PropFlags.NAME | PropFlags.LOCKED | PropFlags.VISIBLE | PropFlags.SHARED)) {
			this.emitLayerListState();
		}
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
						shared: null,
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
					shared: layer.shared,
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

	public emitCurrentState(): void {
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
		this.emitCurrentState();
		return true;
	}

	public spreadSelectedLayer(): boolean {
		const layer = this.selectedLayer;
		if (!layer) return false;
		this.slideView.spreadLayers(layer);
		this.emitCurrentState();
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

	public toggleSelectedLayerShared(): boolean {
		const layer = this.slideView.editingLayer;
		if (!layer) return false;
		const from = layer.shared;
		const to = !from;
		HistoryManager.shared
			.record(
				new Command(
					() => {
						layer.shared = to;
					},
					() => {
						layer.shared = from;
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
		this.emitCurrentState();
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
		this.emitCurrentState();
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
		this.emitCurrentState();
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
		this.emitCurrentState();
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
		this.emitCurrentState();
		return true;
	}

	public moveSelectedLayerToIndex(toIndex: number): boolean {
		const layer = this.slideView.editingLayer;
		if (!layer) return false;
		const fromIndex = this.slide.indexOf(layer);
		if (fromIndex === -1 || toIndex < 0 || toIndex >= this.slide.layers.length || fromIndex === toIndex) {
			return false;
		}
		HistoryManager.shared
			.record(
				new Command(
					() => {
						this.slide.addLayer(layer, toIndex);
					},
					() => {
						this.slide.addLayer(layer, fromIndex);
					}
				)
			)
			.do();
		this.emitCurrentState();
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
		this.emitCurrentState();
		return true;
	}

	public pasteLayer(): boolean {
		this.slideView.paste();
		this.emitCurrentState();
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
		this.emitCurrentState();
		return true;
	}

	public getSelectedLayerRemovalRequest(): { layerName: string; shared: boolean } | null {
		const layer = this.slideView.editingLayer;
		if (!layer) return null;
		return {
			layerName: layer.name || "selected layer",
			shared: this.slideView.hasSharedLayerRemovalTargets(layer),
		};
	}

	public removeSelectedLayer(confirmedSharedRemoval = false): boolean {
		const layer = this.slideView.editingLayer;
		if (!layer) return false;
		const index = this.slide.indexOf(layer);
		this.slideView.runWithSharedLayerRemovalConfirmation(confirmedSharedRemoval, () => {
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
		});
		this.emitCurrentState();
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
		this.emitCurrentState();
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

	public setSelectedImageClip(
		top: number,
		right: number,
		bottom: number,
		left: number
	): boolean {
		const layer = this.slideView.editingLayer;
		if (!layer || layer.type != LayerType.IMAGE) return false;
		const values = [top, right, bottom, left];
		if (values.some((value) => !isFinite(value))) return false;
		const imageLayer = layer as ImageLayer;
		const from = imageLayer.clipRect.concat();
		const next = values.map((value) => Math.max(0, value));
		if (from.every((value, index) => value === next[index])) return true;
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
