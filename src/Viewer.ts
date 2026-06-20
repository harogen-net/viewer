import $ from "jquery";
import { PropertyEvent } from "./events/PropertyEvent";
import { Slide } from "./model/Slide";
import { ViewerDocument } from "./model/ViewerDocument";
import { useViewerDocumentStore } from "./state/viewerDocumentStore";
import { HistoryManager } from "./utils/HistoryManager";
import { ImageManager } from "./utils/ImageManager";
import { HVDataType, SlideStorage } from "./utils/SlideStorage";
import { EditViewController } from "./viewController/EditViewController";
import { FileSelector } from "./viewController/file/FileSelector";
import { ListViewController } from "./viewController/ListViewController";
import { SlideShowViewController } from "./viewController/SlideShowViewController";


export enum ViewerMode {
	SELECT,
	EDIT,
	SLIDESHOW
}
export enum ViewerStartUpMode {
	VIEW_AND_EDIT,
	VIEW_ONLY
}

export class Viewer {
	public static shared: Viewer
	public static isStrictMode: boolean = true;
	public static startUpMode: ViewerStartUpMode = ViewerStartUpMode.VIEW_AND_EDIT;

	//スライドのサイズ基本値として必要
	public static readonly SCREEN_WIDTH = Math.max(window.screen.width, window.screen.height);
	public static readonly SCREEN_HEIGHT = Math.min(window.screen.width, window.screen.height);

	private editVC: EditViewController;
	private listVC: ListViewController;
	private slideShowVC: SlideShowViewController;
	private storage: SlideStorage;
	// private menu:Menu;

	private _mode: ViewerMode;

	private viewerDocument: ViewerDocument;
	IsDocumentModified: boolean;


	constructor(public obj: any, startUpMode: ViewerStartUpMode) {
		Viewer.shared = this;
		Viewer.startUpMode = startUpMode;

		ImageManager.init($('#images > .container'));

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

		//
		this.listVC = new ListViewController(obj.find(".list"));
		this.slideShowVC = new SlideShowViewController($("<div />").appendTo(obj));

		this.storage = SlideStorage.getInstance();
		this.storage.addEventListener("loading", (e: CustomEvent) => {
			useViewerDocumentStore.getState().setProgress(e.detail as number);
		});
		this.storage.addEventListener("loaded", (e: CustomEvent) => {
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
			})
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
			new FileSelector();

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
							if ((e.target as unknown as HTMLElement) == opener[0]) return;
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
					if (this.viewerDocument.slides.length == 0) return;
					if (!this.IsDocumentModified || !Viewer.isStrictMode || window.confirm('clear slides and new document. Are you sure?')) {
						this.newDocument();
					}
				});

				$(".export").click(() => {
					if (this.listVC.slides.length > 0) {
						var type: HVDataType;
						if ($("#saveFormat_png").prop("checked")) type = HVDataType.PNG;
						if ($("#saveFormat_hvz").prop("checked")) type = HVDataType.HVZ;
						if ($("#saveFormat_hvd").prop("checked")) type = HVDataType.HVD;

						this.storage.export(this.viewerDocument, type, {
							pages: (this.listVC.selectedSlideIndex != -1) ? [this.listVC.selectedSlideIndex] : undefined
						});
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
				if (this.listVC.slides.length == 0) return;
				let isOverride = window.confirm('override?');
				this.storage.save(this.viewerDocument, isOverride);
			});


			$("button.zip").click(() => {
				this.viewerDocument.downloadImage();
			});
			$("button.import").click(() => {
				if (!this.IsDocumentModified || !Viewer.isStrictMode || window.confirm('load slides. Are you sure?')) {
					$("input.import")[0].click();
				}
			});
			$("input.import").change((e) => {
				const target = e.target as HTMLInputElement;
				if (target.files![0]) {
					this.storage.import(target.files![0]);
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
				this.viewerDocument.bgColor = $("#bgColor").val().toString();
			});


		}

		//

		if (Viewer.startUpMode == ViewerStartUpMode.VIEW_AND_EDIT && process.env.NODE_ENV == "production") {
			window.addEventListener('beforeunload', (e) => {
				if ((this.viewerDocument.slides.length > 0 || !Viewer.isStrictMode)) {
					e.returnValue = "ページを離れます。よろしいですか？";
				}
			}, false);
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
		// 旧 class instance を seam で type に通す。class 撤去 (P5 想定) で as any も消える。
		useViewerDocumentStore.getState().setDocument(nextDocument as any);
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
}