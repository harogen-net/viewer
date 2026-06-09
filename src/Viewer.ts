import $ from "jquery";
import { PropertyEvent } from "./events/PropertyEvent";
import { Slide } from "./model/Slide";
import { ViewerDocument } from "./model/ViewerDocument";
import { FeatureGate } from "./runtime/featureGate";
import { showNotice } from "./runtime/notice";
import { createStorageAdapter } from "./storage/createStorageAdapter";
import { StorageEventType } from "./storage/StorageAdapter";
import { HVDataType } from "./storage/storageTypes";
import { DocumentStorageUseCase } from "./useCase/DocumentStorageUseCase";
import { isStorageActionFailure } from "./useCase/storageActionResult";
import { HistoryManager } from "./utils/HistoryManager";
import { ImageManager } from "./utils/ImageManager";
import { ProgressBar } from "./view/ProgressBar";
import { EditViewController } from "./viewController/EditViewController";
import { FileSelector } from "./viewController/file/FileSelector";
import { ListViewController } from "./viewController/ListViewController";
import { SlideShowViewController } from "./viewController/SlideShowViewController";

export const ViewerMode = {
	SELECT: 0,
	EDIT: 1,
	SLIDESHOW: 2,
} as const;

export type ViewerMode = (typeof ViewerMode)[keyof typeof ViewerMode];

export const ViewerStartUpMode = {
	VIEW_AND_EDIT: 0,
	VIEW_ONLY: 1,
} as const;

export type ViewerStartUpMode = (typeof ViewerStartUpMode)[keyof typeof ViewerStartUpMode];

export class Viewer {
	public static shared: Viewer;
	public static isStrictMode: boolean = true;
	public static startUpMode: ViewerStartUpMode = ViewerStartUpMode.VIEW_AND_EDIT;

	//スライドのサイズ基本値として必要
	public static readonly SCREEN_WIDTH = Math.max(window.screen.width, window.screen.height);
	public static readonly SCREEN_HEIGHT = Math.min(window.screen.width, window.screen.height);

	private editVC: EditViewController;
	private listVC: ListViewController;
	private slideShowVC: SlideShowViewController;
	private documentStorage: DocumentStorageUseCase;
	// private menu:Menu;

	private _mode: ViewerMode;

	private viewerDocument: ViewerDocument;
	IsDocumentModified: boolean;

	constructor(
		public obj: any,
		startUpMode: ViewerStartUpMode,
		private featureGate?: FeatureGate
	) {
		Viewer.shared = this;
		Viewer.startUpMode = startUpMode;

		ImageManager.init($("#images > .container"));

		if (startUpMode == ViewerStartUpMode.VIEW_AND_EDIT) {
			$(document).on("drop dragover", (e: any) => {
				e.preventDefault();
				e.stopImmediatePropagation();
			});
		}
		// document.addEventListener("webkitfullscreenchange",()=>{
		// 	if(document["webkitFullscreenElement"]){
		// 		obj.addClass("slideShow");
		// 	}else{
		// 		obj.removeClass("slideShow");
		// 	}
		// });

		let progressBar = new ProgressBar($("<div />").appendTo(obj));

		//
		this.listVC = new ListViewController(obj.find(".list"), this.canEdit());
		this.slideShowVC = new SlideShowViewController($("<div />").appendTo(obj));

		this.documentStorage = new DocumentStorageUseCase(createStorageAdapter(), this.featureGate);
		this.documentStorage.addEventListener(StorageEventType.LOADING, (e: CustomEvent) => {
			let percentage = e.detail as number;
			progressBar.go(percentage);
		});
		this.documentStorage.addEventListener(StorageEventType.LOADED, (e: CustomEvent) => {
			this.newDocument(e.detail as ViewerDocument);
		});
		//

		if (startUpMode == ViewerStartUpMode.VIEW_AND_EDIT) {
			HistoryManager.init();
			HistoryManager.shared.addEventListener(PropertyEvent.UPDATE, (pe: PropertyEvent) => {
				this.IsDocumentModified = HistoryManager.shared.canUndo;
			});

			this.editVC = new EditViewController(obj.find(".canvas"));

			this.listVC.addEventListener("select", () => {
				if (this._mode == ViewerMode.SELECT) {
				} else if (this._mode == ViewerMode.EDIT) {
					if (this.listVC.selectedSlide) {
						this.editVC.setSlide(this.listVC.selectedSlide);
					} else {
						this.editVC.initialize();
					}
				}
			});
			this.listVC.addEventListener("edit", () => {
				if (this.listVC.selectedSlide) {
					this.setMode(ViewerMode.EDIT);
					setTimeout(() => {
						this.editVC.setSlide(this.listVC.selectedSlide);
					}, 301);
				}
			});

			this.editVC.addEventListener("close", () => {
				this.setMode(ViewerMode.SELECT);
				setTimeout(() => {
					this.editVC.initialize();
				}, 301);
			});
			this.listVC.addEventListener("close", () => {
				this.editVC.initialize();
				this.setMode(ViewerMode.SELECT);
			});

			this.editVC.addEventListener("download", () => {
				this.viewerDocument.downloadImage(this.listVC.selectedSlideIndex);
			});
		}

		//

		//IO section
		{
			new FileSelector(this.documentStorage);

			if (startUpMode == ViewerStartUpMode.VIEW_AND_EDIT) {
				//pulldown
				$(".pulldown").each(function (index, element) {
					var self = $(element);
					var opener = self.find(".pulldownOpener");
					var targetId = opener.attr("data-target");
					var target = $("#" + targetId);

					var key = "mouseup." + targetId;
					var isOpen = false;
					opener.click(function (e) {
						if (isOpen) {
							hide();
						} else {
							show();
						}
					});
					function show() {
						isOpen = true;
						target.slideDown(100);
						$(document).on(key, function (e) {
							if ((e.target as Node) == opener[0]) return;
							hide();
						});
					}
					function hide() {
						isOpen = false;
						target.slideUp(100);
						$(document).off(key);
					}
				});

				// $(".pulldown .pulldownOpener").click((e)=>{
				// 	var opener = $(e.target);
				// 	var targetId = opener.attr("data-target");
				// 	$("#" + targetId).toggle();
				// });

				$("#pref > button").click(() => {
					$("#pref > .menu").toggle();
				});
				$("#images > button").click(() => {
					$("#images > .container").toggle();
				});
				$(".new").click(() => {
					if (!this.canEdit()) return;
					if (this.viewerDocument.slides.length == 0) return;
					if (
						!this.IsDocumentModified ||
						!Viewer.isStrictMode ||
						window.confirm("clear slides and new document. Are you sure?")
					) {
						this.newDocument();
					}
				});

				$(".export").click(() => {
					if (!this.canExport()) return;
					if (this.listVC.slides.length > 0) {
						var type: HVDataType;
						if ($("#saveFormat_png").prop("checked")) type = HVDataType.PNG;
						if ($("#saveFormat_hvz").prop("checked")) type = HVDataType.HVZ;
						if ($("#saveFormat_hvd").prop("checked")) type = HVDataType.HVD;

						const result = this.documentStorage.exportResult(this.viewerDocument, type, {
							pages:
								this.listVC.selectedSlideIndex != -1 ? [this.listVC.selectedSlideIndex] : undefined,
						});
						if (isStorageActionFailure(result)) {
							showNotice(result.message);
						}
					}
				});
			} else {
				$("label[for='cb_fullscreen']").hide();
			}

			$(".startSlideShow").click(() => {
				var slides: Slide[] = [];
				var startIndex: number = 0;
				for (var i: number = 0; i < this.viewerDocument.slides.length; i++) {
					var slide: Slide = this.viewerDocument.slides[i];
					if (slide.disabled) continue;
					slides.push(slide.clone());
					if (i == this.listVC.selectedSlideIndex) startIndex = slides.length - 1;
				}
				if (slides.length == 0) return;
				this.slideShowVC.setUp(slides);
				this.slideShowVC.run(startIndex);
			});
			$("#cb_mirrorH").click(() => {
				this.slideShowVC.mirrorH = $("#cb_mirrorH").prop("checked");
			});
			$("#cb_mirrorV").click(() => {
				this.slideShowVC.mirrorV = $("#cb_mirrorV").prop("checked");
			});

			$(".save").click(() => {
				if (!this.canSave()) return;
				if (this.listVC.slides.length == 0) return;
				let isOverride = window.confirm("override?");
				const result = this.documentStorage.saveResult(this.viewerDocument, isOverride);
				if (isStorageActionFailure(result)) {
					showNotice(result.message);
				}
			});

			$("button.zip").click(() => {
				if (!this.canExport()) return;
				this.viewerDocument.downloadImage();
			});
			$("button.import").click(() => {
				if (!this.canImport()) return;
				if (
					!this.IsDocumentModified ||
					!Viewer.isStrictMode ||
					window.confirm("load slides. Are you sure?")
				) {
					$("input.import")[0].click();
				}
			});
			$("input.import").change((e) => {
				if (!this.canImport()) return;
				const target = e.target as HTMLInputElement;
				if (target.files && target.files[0]) {
					this.documentStorage.importResult(target.files[0]).then((result) => {
						if (isStorageActionFailure(result)) {
							showNotice(result.message);
						}
					});
					$("input.import").val("");
				}
			});

			// let selectInit = (obj:any,value:number)=>{
			// 	obj.find('option[value=' + value +']').prop("selected",true);
			// };
			// //selectInit($("#duration"),localStorage.duration);
			// $("#duration").change((any)=>{
			// 	//localStorage.duration = $("#duration").val();
			// });
			// //selectInit($("#interval"),localStorage.interval);
			// $("#interval").change((any)=>{
			// 	//localStorage.interval = $("#interval").val();
			// });

			$("#bgColor").change((e) => {
				if (!this.canEdit()) {
					$("#bgColor").val(this.viewerDocument.bgColor);
					return;
				}
				this.viewerDocument.bgColor = $("#bgColor").val().toString();
			});
		}

		//

		if (
			Viewer.startUpMode == ViewerStartUpMode.VIEW_AND_EDIT &&
			process.env.NODE_ENV == "production"
		) {
			window.addEventListener(
				"beforeunload",
				(e) => {
					if (this.viewerDocument.slides.length > 0 || !Viewer.isStrictMode) {
						e.returnValue = "ページを離れます。よろしいですか？";
					}
				},
				false
			);
		}

		this.newDocument();
	}

	//priate methods
	private newDocument(nextDocument?: ViewerDocument) {
		if (this.viewerDocument) {
			this.viewerDocument = null;

			this.listVC.initialize();
			if (Viewer.startUpMode == ViewerStartUpMode.VIEW_AND_EDIT) {
				this.setMode(ViewerMode.SELECT);
				this.editVC.initialize();
				HistoryManager.shared.initialize();
			}
		}

		this.setMode(ViewerMode.SELECT);
		if (!nextDocument) {
			//nextDocumentがnullでない⇒slideStorageがdocumentを生成してImageManagerをリセット＆登録済みなので
			ImageManager.shared.initialize();
			nextDocument = new ViewerDocument();
		}
		this.viewerDocument = nextDocument;
		this.listVC.slides = this.viewerDocument.slides;
		this.IsDocumentModified = false;
	}

	public setMode(mode: ViewerMode) {
		if (mode == this._mode) return;
		this._mode = mode;

		switch (this._mode) {
			case ViewerMode.SELECT:
				this.obj.addClass("select");
				this.obj.removeClass("edit");
				if (Viewer.startUpMode == ViewerStartUpMode.VIEW_AND_EDIT) {
					this.editVC.slideView.isActive = false;
				}
				break;
			case ViewerMode.EDIT:
				this.obj.removeClass("select");
				this.obj.addClass("edit");
				if (Viewer.startUpMode == ViewerStartUpMode.VIEW_AND_EDIT) {
					this.editVC.slideView.isActive = true;
				}
				break;
			/*			case ViewerMode.SLIDESHOW:
						break;*/
		}
		this.listVC.setMode(this._mode);
		if (Viewer.startUpMode == ViewerStartUpMode.VIEW_AND_EDIT) {
			this.editVC.setMode(this._mode);
		}
	}

	private canEdit(): boolean {
		if (this.featureGate) return this.featureGate.canEdit;
		return Viewer.startUpMode == ViewerStartUpMode.VIEW_AND_EDIT;
	}

	private canSave(): boolean {
		if (this.featureGate) return this.featureGate.canSave;
		return Viewer.startUpMode == ViewerStartUpMode.VIEW_AND_EDIT;
	}

	private canExport(): boolean {
		if (this.featureGate) return this.featureGate.canExport;
		return Viewer.startUpMode == ViewerStartUpMode.VIEW_AND_EDIT;
	}

	private canImport(): boolean {
		if (this.featureGate) return this.featureGate.canImport;
		return true;
	}
}
