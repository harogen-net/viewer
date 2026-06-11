import $ from "jquery";
import { PropertyEvent } from "./events/PropertyEvent";
import { Slide } from "./model/Slide";
import { ViewerDocument } from "./model/ViewerDocument";
import { FeatureGate } from "./runtime/featureGate";
import { showNotice } from "./runtime/notice";
import { createStorageAdapter } from "./storage/createStorageAdapter";
import { HVDataType } from "./storage/storageTypes";
import { DocumentStorageUseCase, type StorageActionResult } from "./useCase/DocumentStorageUseCase";
import { handleStorageActionResult } from "./useCase/storageActionResult";
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

	private static readonly SEL = {
		PREF_BUTTON: "#pref > button",
		IMAGES_BUTTON: "#images > button",
		NEW: ".new",
		EXPORT: ".export",
		SAVE: ".save",
		ZIP: "button.zip",
		IMPORT_BUTTON: "button.import",
		IMPORT_INPUT: "input.import",
		START_SLIDESHOW: ".startSlideShow",
		MIRROR_H: "#cb_mirrorH",
		MIRROR_V: "#cb_mirrorV",
		BG_COLOR: "#bgColor",
		FULLSCREEN_LABEL: "label[for='cb_fullscreen']",
	} as const;

	private editVC: EditViewController;
	private listVC: ListViewController;
	private slideShowVC: SlideShowViewController;
	private documentStorage: DocumentStorageUseCase;
	private progressBar: ProgressBar;

	private _mode: ViewerMode;

	private viewerDocument: ViewerDocument;
	IsDocumentModified: boolean;

	private handleStorageResult(resultPromise: Promise<StorageActionResult>) {
		handleStorageActionResult(resultPromise, (message) => {
			showNotice(message);
		});
	}

	private showGateDenied(actionLabel: string): void {
		showNotice(actionLabel + "は現在のモードでは許可されていません。");
	}

	private ensureAllowed(canExecute: boolean, actionLabel: string): boolean {
		if (canExecute) {
			return true;
		}
		this.showGateDenied(actionLabel);
		return false;
	}

	private canProceedWithDiscard(confirmMessage: string): boolean {
		if (!this.IsDocumentModified || !Viewer.isStrictMode) {
			return true;
		}
		return window.confirm(confirmMessage);
	}

	private getPermissionPolicy(): FeatureGate {
		if (this.featureGate) {
			return this.featureGate;
		}

		const canMutate = Viewer.startUpMode == ViewerStartUpMode.VIEW_AND_EDIT;
		return {
			canEdit: canMutate,
			canSave: canMutate,
			canExport: canMutate,
			canImport: true,
			canDeleteSavedData: canMutate,
		};
	}

	private shouldOverrideSave(): boolean {
		return window.confirm("override?");
	}

	private initializeDocumentStorage(): void {
		this.documentStorage = new DocumentStorageUseCase(createStorageAdapter(), this.featureGate);
		this.documentStorage.onLoading((percentage) => {
			this.progressBar.go(percentage);
		});
		this.documentStorage.onLoaded((doc) => {
			this.newDocument(doc);
		});
		this.documentStorage.onError((error) => {
			showNotice(this.documentStorage.getErrorNoticeMessage(error));
		});
	}

	private setupPulldownMenus(): void {
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
	}

	private bindEditModeIOHandlers(): void {
		$(Viewer.SEL.PREF_BUTTON).click(() => {
			$("#pref > .menu").toggle();
		});
		$(Viewer.SEL.IMAGES_BUTTON).click(() => {
			$("#images > .container").toggle();
		});
		$(Viewer.SEL.NEW).click(() => {
			if (!this.ensureAllowed(this.canEdit(), "新規作成")) return;
			if (this.viewerDocument.slides.length == 0) return;
			if (this.canProceedWithDiscard("clear slides and new document. Are you sure?")) {
				this.newDocument();
			}
		});

		$(Viewer.SEL.EXPORT).click(() => {
			if (!this.ensureAllowed(this.canExport(), "書き出し")) return;
			if (this.listVC.slides.length > 0) {
				var type: HVDataType;
				if ($("#saveFormat_png").prop("checked")) type = HVDataType.PNG;
				if ($("#saveFormat_hvz").prop("checked")) type = HVDataType.HVZ;
				if ($("#saveFormat_hvd").prop("checked")) type = HVDataType.HVD;

				const result = this.documentStorage.exportResult(this.viewerDocument, type, {
					pages:
						this.listVC.selectedSlideIndex != -1 ? [this.listVC.selectedSlideIndex] : undefined,
				});
				this.handleStorageResult(result);
			}
		});
	}

	private bindCommonIOHandlers(): void {
		this.bindSlideShowHandlers();
		this.bindSaveAndExportHandlers();
		this.bindImportHandlers();
		this.bindBackgroundColorHandler();
	}

	private bindSlideShowHandlers(): void {
		$(Viewer.SEL.START_SLIDESHOW).click(() => {
			this.startSlideShowFromSelection();
		});
		$(Viewer.SEL.MIRROR_H).click(() => {
			this.slideShowVC.mirrorH = $(Viewer.SEL.MIRROR_H).prop("checked");
		});
		$(Viewer.SEL.MIRROR_V).click(() => {
			this.slideShowVC.mirrorV = $(Viewer.SEL.MIRROR_V).prop("checked");
		});
	}

	private bindSaveAndExportHandlers(): void {
		$(Viewer.SEL.SAVE).click(() => {
			if (!this.ensureAllowed(this.canSave(), "保存")) return;
			if (this.listVC.slides.length == 0) return;
			let isOverride = this.shouldOverrideSave();
			const result = this.documentStorage.saveResult(this.viewerDocument, isOverride);
			this.handleStorageResult(result);
		});

		$(Viewer.SEL.ZIP).click(() => {
			if (!this.ensureAllowed(this.canExport(), "画像出力")) return;
			this.viewerDocument.downloadImage();
		});
	}

	private bindImportHandlers(): void {
		$(Viewer.SEL.IMPORT_BUTTON).click(() => {
			if (!this.ensureAllowed(this.canImport(), "読み込み")) return;
			if (this.canProceedWithDiscard("load slides. Are you sure?")) {
				$(Viewer.SEL.IMPORT_INPUT)[0].click();
			}
		});
		$(Viewer.SEL.IMPORT_INPUT).change((e) => {
			if (!this.ensureAllowed(this.canImport(), "読み込み")) {
				$(Viewer.SEL.IMPORT_INPUT).val("");
				return;
			}
			const target = e.target as HTMLInputElement;
			if (target.files && target.files[0]) {
				this.handleStorageResult(this.documentStorage.importResult(target.files[0]));
				$(Viewer.SEL.IMPORT_INPUT).val("");
			}
		});
	}

	private bindBackgroundColorHandler(): void {
		$(Viewer.SEL.BG_COLOR).change((e) => {
			if (!this.canEdit()) {
				$(Viewer.SEL.BG_COLOR).val(this.viewerDocument.bgColor);
				return;
			}
			this.viewerDocument.bgColor = $(Viewer.SEL.BG_COLOR).val().toString();
		});
	}

	private buildSlideShowSlides(): { slides: Slide[]; startIndex: number } {
		var slides: Slide[] = [];
		var startIndex: number = 0;

		for (var i: number = 0; i < this.viewerDocument.slides.length; i++) {
			var slide: Slide = this.viewerDocument.slides[i];
			if (slide.disabled) continue;
			slides.push(slide.clone());
			if (i == this.listVC.selectedSlideIndex) startIndex = slides.length - 1;
		}

		return { slides, startIndex };
	}

	private startSlideShowFromSelection(): void {
		const { slides, startIndex } = this.buildSlideShowSlides();
		if (slides.length == 0) return;

		this.slideShowVC.setUp(slides);
		this.slideShowVC.run(startIndex);
	}

	private setupIOBindings(startUpMode: ViewerStartUpMode): void {
		new FileSelector(this.documentStorage);
		this.setupModeSpecificIOBindings(startUpMode);

		this.bindCommonIOHandlers();
	}

	private setupModeSpecificIOBindings(startUpMode: ViewerStartUpMode): void {
		if (startUpMode == ViewerStartUpMode.VIEW_AND_EDIT) {
			this.setupPulldownMenus();
			this.bindEditModeIOHandlers();
			return;
		}

		this.setupViewOnlyIOBindings();
	}

	private setupViewOnlyIOBindings(): void {
		$(Viewer.SEL.FULLSCREEN_LABEL).hide();
	}

	private initializeEditModeFeatures(startUpMode: ViewerStartUpMode): void {
		if (startUpMode != ViewerStartUpMode.VIEW_AND_EDIT) {
			return;
		}

		HistoryManager.init();
		HistoryManager.shared.addEventListener(PropertyEvent.UPDATE, (pe: PropertyEvent) => {
			this.IsDocumentModified = HistoryManager.shared.canUndo;
		});

		this.editVC = new EditViewController(this.obj.find(".canvas"));

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

	private initializeRuntime(startUpMode: ViewerStartUpMode): void {
		ImageManager.init($("#images > .container"));

		if (startUpMode == ViewerStartUpMode.VIEW_AND_EDIT) {
			$(document).on("drop dragover", (e: any) => {
				e.preventDefault();
				e.stopImmediatePropagation();
			});
		}

		this.progressBar = new ProgressBar($("<div />").appendTo(this.obj));
	}

	private initializeControllers(startUpMode: ViewerStartUpMode): void {
		this.listVC = new ListViewController(this.obj.find(".list"), this.canEdit());
		this.slideShowVC = new SlideShowViewController($("<div />").appendTo(this.obj));
		this.initializeDocumentStorage();
		this.initializeEditModeFeatures(startUpMode);
	}

	private initializeBindings(startUpMode: ViewerStartUpMode): void {
		this.setupIOBindings(startUpMode);
		this.registerBeforeUnloadWarning();
	}

	private shouldRegisterBeforeUnloadWarning(): boolean {
		return (
			Viewer.startUpMode == ViewerStartUpMode.VIEW_AND_EDIT &&
			process.env.NODE_ENV == "production"
		);
	}

	private registerBeforeUnloadWarning(): void {
		if (!this.shouldRegisterBeforeUnloadWarning()) {
			return;
		}

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

	private applySelectMode(): void {
		this.obj.addClass("select");
		this.obj.removeClass("edit");
		if (Viewer.startUpMode == ViewerStartUpMode.VIEW_AND_EDIT) {
			this.editVC.slideView.isActive = false;
		}
	}

	private applyEditMode(): void {
		this.obj.removeClass("select");
		this.obj.addClass("edit");
		if (Viewer.startUpMode == ViewerStartUpMode.VIEW_AND_EDIT) {
			this.editVC.slideView.isActive = true;
		}
	}

	constructor(
		public obj: JQuery,
		startUpMode: ViewerStartUpMode,
		private featureGate?: FeatureGate
	) {
		Viewer.shared = this;
		Viewer.startUpMode = startUpMode;

		this.initializeRuntime(startUpMode);
		this.initializeControllers(startUpMode);
		this.initializeBindings(startUpMode);

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
				this.applySelectMode();
				break;
			case ViewerMode.EDIT:
				this.applyEditMode();
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
		return this.getPermissionPolicy().canEdit;
	}

	private canSave(): boolean {
		return this.getPermissionPolicy().canSave;
	}

	private canExport(): boolean {
		return this.getPermissionPolicy().canExport;
	}

	private canImport(): boolean {
		return this.getPermissionPolicy().canImport;
	}
}
