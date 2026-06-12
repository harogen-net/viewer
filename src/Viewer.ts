import $ from "jquery";
import { ViewerBridge } from "./bridge/ViewerBridge";
import { PropertyEvent } from "./events/PropertyEvent";
import { Direction, Slide } from "./model/Slide";
import { ViewerDocument } from "./model/ViewerDocument";
import { FeatureGate } from "./runtime/featureGate";
import { showNotice } from "./runtime/notice";
import { getImagesContainerElement, getSaveFormat } from "./runtime/reactDomRegistry";
import { createStorageAdapter } from "./storage/createStorageAdapter";
import { HVDataType } from "./storage/storageTypes";
import { DocumentStorageUseCase, type StorageActionResult } from "./useCase/DocumentStorageUseCase";
import { handleStorageActionResult } from "./useCase/storageActionResult";
import { HistoryManager } from "./utils/HistoryManager";
import { ImageManager } from "./utils/ImageManager";
import { ProgressBar } from "./view/ProgressBar";
import { EditViewController } from "./viewController/EditViewController";
import { ListViewController } from "./viewController/ListViewController";
import { SlideShowPlaybackSettings, SlideShowViewController } from "./viewController/SlideShowViewController";

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
	private progressBar: ProgressBar;

	private _mode: ViewerMode;
	private selectedSavedFileId: string | null = null;
	private importInput: HTMLInputElement | null = null;
	private slideShowDuration = 2000;
	private slideShowInterval = 6000;
	private slideShowBgColor = "#999999";
	private slideShowFullscreen = false;
	private slideShowMirrorH = false;
	private slideShowMirrorV = false;

	private viewerDocument: ViewerDocument;
	private _isDocumentModified = false;
	/** Per-slide cleanup functions for slide meta-property listeners */
	private _slideMetaUnsubscribers: Array<() => void> = [];

	get IsDocumentModified(): boolean {
		return this._isDocumentModified;
	}
	set IsDocumentModified(value: boolean) {
		this._isDocumentModified = value;
		ViewerBridge.emit("modifiedChanged", { modified: value });
	}

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
		this.documentStorage.onUpdated(() => {
			const titles = this.documentStorage.getTitles();
			ViewerBridge.emit("savedFilesChanged", {
				titles,
			});
			if (this.findSavedFileIndex(this.selectedSavedFileId) === -1) {
				this.setSavedFileSelection(titles.length > 0 ? String(titles[0].id) : null);
			}
		});
		this.documentStorage.onError((error) => {
			showNotice(this.documentStorage.getErrorNoticeMessage(error));
		});
	}

	private emitSlideShowSettings(): void {
		ViewerBridge.emit("slideshowSettingsChanged", {
			duration: this.slideShowDuration,
			interval: this.slideShowInterval,
			bgColor: this.slideShowBgColor,
			fullscreen: this.slideShowFullscreen,
			mirrorH: this.slideShowMirrorH,
			mirrorV: this.slideShowMirrorV,
		});
	}

	private getSlideShowPlaybackSettings(): SlideShowPlaybackSettings {
		return {
			duration: this.slideShowDuration,
			interval: this.slideShowInterval,
		};
	}

	private emitHistoryState(): void {
		if (Viewer.startUpMode != ViewerStartUpMode.VIEW_AND_EDIT) {
			ViewerBridge.emit("historyChanged", { canUndo: false, canRedo: false });
			return;
		}
		ViewerBridge.emit("historyChanged", {
			canUndo: HistoryManager.shared.canUndo,
			canRedo: HistoryManager.shared.canRedo,
		});
	}

	private emitEditSelectionState(): void {
		if (
			Viewer.startUpMode != ViewerStartUpMode.VIEW_AND_EDIT ||
			this._mode != ViewerMode.EDIT ||
			!this.editVC
		) {
			ViewerBridge.emit("editSelectionChanged", { hasSelection: false });
			return;
		}
		ViewerBridge.emit("editSelectionChanged", {
			hasSelection: this.editVC.hasSelectedLayer(),
		});
	}

	private canRunEditOperations(actionLabel: string): boolean {
		if (!this.ensureAllowed(this.canEdit(), actionLabel)) {
			return false;
		}
		if (Viewer.startUpMode != ViewerStartUpMode.VIEW_AND_EDIT) {
			return false;
		}
		if (this._mode != ViewerMode.EDIT) {
			showNotice("編集モードで操作してください。");
			return false;
		}
		return true;
	}

	private runEditSelectionOperation(actionLabel: string, operation: () => boolean): void {
		if (!this.canRunEditOperations(actionLabel)) {
			return;
		}
		if (!operation()) {
			showNotice("レイヤーを選択してください。");
		}
		this.emitEditSelectionState();
	}

	private runEditOperation(actionLabel: string, operation: () => void): void {
		if (!this.canRunEditOperations(actionLabel)) {
			return;
		}
		operation();
		this.emitEditSelectionState();
	}

	private runEditSelectionOperationSilently(actionLabel: string, operation: () => boolean): void {
		if (!this.canRunEditOperations(actionLabel)) {
			return;
		}
		operation();
		this.emitEditSelectionState();
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

		this.slideShowVC.setUp(slides, this.getSlideShowPlaybackSettings());
		this.slideShowVC.run(startIndex);
	}

	private setSavedFileSelection(fileId: string | null): void {
		const nextId = fileId == null || fileId === "-1" ? null : String(fileId);
		this.selectedSavedFileId = nextId;
		ViewerBridge.emit("savedFileSelectionChanged", { selectedId: nextId });
	}

	private findSavedFileIndex(selectedId: string | null): number {
		if (!selectedId) return -1;
		const titles = this.documentStorage.getTitles();
		return titles.findIndex((t) => String(t.id) === selectedId);
	}

	private ensureSelectedSavedFileId(): string | null {
		if (this.selectedSavedFileId && this.findSavedFileIndex(this.selectedSavedFileId) !== -1) {
			return this.selectedSavedFileId;
		}
		const titles = this.documentStorage.getTitles();
		if (titles.length === 0) {
			this.setSavedFileSelection(null);
			return null;
		}
		const firstId = String(titles[0].id);
		this.setSavedFileSelection(firstId);
		return firstId;
	}

	private initializeEditModeFeatures(startUpMode: ViewerStartUpMode): void {
		if (startUpMode != ViewerStartUpMode.VIEW_AND_EDIT) {
			return;
		}

		HistoryManager.init();
		HistoryManager.shared.addEventListener(PropertyEvent.UPDATE, (pe: PropertyEvent) => {
			this.IsDocumentModified = HistoryManager.shared.canUndo;
			this.emitHistoryState();
		});
		this.emitHistoryState();

		this.editVC = new EditViewController(this.obj.find(".canvas"));
		this.editVC.addEventListener("selectionChanged", () => {
			this.emitEditSelectionState();
		});
		this.editVC.addEventListener("canvasStateChanged", (e: CustomEvent) => {
			ViewerBridge.emit("editCanvasStateChanged", {
				scale: typeof e.detail?.scale == "number" ? e.detail.scale : 1,
				rectEdit: Boolean(e.detail?.rectEdit),
			});
		});
		this.editVC.addEventListener("layerListChanged", (e: CustomEvent) => {
			ViewerBridge.emit("editLayersChanged", {
				layers: Array.isArray(e.detail?.layers) ? e.detail.layers : [],
			});
		});
		this.editVC.addEventListener("selectedLayerStateChanged", (e: CustomEvent) => {
			ViewerBridge.emit("editLayerStateChanged", {
				hasSelection: Boolean(e.detail?.hasSelection),
				name: typeof e.detail?.name == "string" ? e.detail.name : null,
				visible: typeof e.detail?.visible == "boolean" ? e.detail.visible : null,
				locked: typeof e.detail?.locked == "boolean" ? e.detail.locked : null,
				shared: typeof e.detail?.shared == "boolean" ? e.detail.shared : null,
				x: typeof e.detail?.x == "number" ? e.detail.x : null,
				y: typeof e.detail?.y == "number" ? e.detail.y : null,
				scale: typeof e.detail?.scale == "number" ? e.detail.scale : null,
				rotation: typeof e.detail?.rotation == "number" ? e.detail.rotation : null,
				opacity: typeof e.detail?.opacity == "number" ? e.detail.opacity : null,
				layerType: typeof e.detail?.layerType == "string" ? e.detail.layerType : null,
				mirrorH: typeof e.detail?.mirrorH == "boolean" ? e.detail.mirrorH : null,
				mirrorV: typeof e.detail?.mirrorV == "boolean" ? e.detail.mirrorV : null,
				isText: typeof e.detail?.isText == "boolean" ? e.detail.isText : null,
				textContent: typeof e.detail?.textContent == "string" ? e.detail.textContent : null,
				clipTop: typeof e.detail?.clipTop == "number" ? e.detail.clipTop : null,
				clipRight: typeof e.detail?.clipRight == "number" ? e.detail.clipRight : null,
				clipBottom: typeof e.detail?.clipBottom == "number" ? e.detail.clipBottom : null,
				clipLeft: typeof e.detail?.clipLeft == "number" ? e.detail.clipLeft : null,
			});
		});

		this.listVC.addEventListener("select", () => {
			ViewerBridge.emit("selectionChanged", { selectedIndex: this.listVC.selectedSlideIndex });
			ViewerBridge.emit("slidesChanged", {
				slides: this.viewerDocument?.slides ?? [],
				selectedIndex: this.listVC.selectedSlideIndex,
			});
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
				this.emitEditSelectionState();
			}, 301);
		});
		this.listVC.addEventListener("close", () => {
			this.editVC.initialize();
			this.setMode(ViewerMode.SELECT);
			this.emitEditSelectionState();
		});

		this.editVC.addEventListener("download", () => {
			this.viewerDocument.downloadImage(this.listVC.selectedSlideIndex);
		});
	}

	private initializeRuntime(startUpMode: ViewerStartUpMode): void {
		const imageContainer = getImagesContainerElement();
		if (imageContainer) {
			ImageManager.init(imageContainer);
		} else {
			const fallbackContainer = document.createElement("div");
			fallbackContainer.id = "images-panel-container";
			fallbackContainer.style.display = "none";
			document.body.appendChild(fallbackContainer);
			ImageManager.init(fallbackContainer);
		}

		if (startUpMode == ViewerStartUpMode.VIEW_AND_EDIT) {
			const preventDefault = (e: Event) => {
				e.preventDefault();
				e.stopImmediatePropagation();
			};
			document.addEventListener("drop", preventDefault);
			document.addEventListener("dragover", preventDefault);
		}

		this.progressBar = new ProgressBar($("<div />").appendTo(this.obj));
	}

	private initializeControllers(startUpMode: ViewerStartUpMode): void {
		this.listVC = new ListViewController(this.obj.find(".list"), this.canEdit());
		this.slideShowVC = new SlideShowViewController($("<div />").appendTo(this.obj));
		this.slideShowVC.addEventListener("settingsChanged", (e: CustomEvent) => {
			const detail = e.detail || {};
			if (typeof detail.fullscreen === "boolean") {
				this.commandSetFullscreen(detail.fullscreen);
			}
			if (typeof detail.mirrorH === "boolean") {
				this.commandSetMirrorH(detail.mirrorH);
			}
			if (typeof detail.mirrorV === "boolean") {
				this.commandSetMirrorV(detail.mirrorV);
			}
		});
		this.initializeDocumentStorage();
		this.initializeEditModeFeatures(startUpMode);
	}

	private initializeBindings(): void {
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
		this.initializeBindings();

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
		this.slideShowBgColor = this.viewerDocument.bgColor;
		this.slideShowVC.fullscreen = this.slideShowFullscreen;
		this.slideShowVC.mirrorH = this.slideShowMirrorH;
		this.slideShowVC.mirrorV = this.slideShowMirrorV;
		this.listVC.slides = this.viewerDocument.slides;
		this.IsDocumentModified = false;
		this.emitHistoryState();
		this.emitEditSelectionState();
		this.emitSlideShowSettings();
		this.rebindSlideMetaListeners();
		ViewerBridge.emit("slidesChanged", {
			slides: this.viewerDocument.slides,
			selectedIndex: this.listVC.selectedSlideIndex,
		});
		ViewerBridge.emit("savedFilesChanged", {
			titles: this.documentStorage.getTitles(),
		});
		const titles = this.documentStorage.getTitles();
		const currentSelectionExists = this.findSavedFileIndex(this.selectedSavedFileId) !== -1;
		if (currentSelectionExists) {
			this.setSavedFileSelection(this.selectedSavedFileId);
		} else {
			this.setSavedFileSelection(titles.length > 0 ? String(titles[0].id) : null);
		}
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

		const bridgeMode = this._mode === ViewerMode.EDIT ? "edit"
			: this._mode === ViewerMode.SLIDESHOW ? "slideshow" : "select";
		ViewerBridge.emit("modeChanged", { mode: bridgeMode });
		this.emitEditSelectionState();
	}

	public commandNewSlide(): void {
		if (!this.ensureAllowed(this.canEdit(), "スライド追加")) return;
		this.listVC.addNewSlideAndSelect();
	}

	public commandCloneSelectedSlide(): void {
		if (!this.ensureAllowed(this.canEdit(), "スライド複製")) return;
		this.listVC.cloneSelectedSlide();
	}

	public commandDeleteSelectedSlide(): void {
		if (!this.ensureAllowed(this.canEdit(), "スライド削除")) return;
		this.listVC.deleteSelectedSlide();
	}

	public commandToggleSelectedSlideJoining(): void {
		if (!this.ensureAllowed(this.canEdit(), "スライド結合切替")) return;
		const slide = this.listVC.selectedSlide;
		if (!slide) return;
		slide.joining = !slide.joining;
		this.emitCurrentSlides();
	}

	public commandToggleSelectedSlideDisabled(): void {
		if (!this.ensureAllowed(this.canEdit(), "スライド有効切替")) return;
		const slide = this.listVC.selectedSlide;
		if (!slide) return;
		slide.disabled = !slide.disabled;
		this.emitCurrentSlides();
	}

	public commandSetSelectedSlideDurationRatio(ratio: number): void {
		if (!this.ensureAllowed(this.canEdit(), "スライド長変更")) return;
		if (!isFinite(ratio) || ratio <= 0) return;
		const slide = this.listVC.selectedSlide;
		if (!slide) return;
		slide.durationRatio = ratio;
		this.emitCurrentSlides();
	}

	private emitCurrentSlides(): void {
		ViewerBridge.emit("slidesChanged", {
			slides: this.viewerDocument?.slides ?? [],
			selectedIndex: this.listVC.selectedSlideIndex,
		});
	}

	private rebindSlideMetaListeners(): void {
		for (const unsub of this._slideMetaUnsubscribers) {
			unsub();
		}
		this._slideMetaUnsubscribers = [];
		if (!this.viewerDocument) return;
		const handler = () => this.emitCurrentSlides();
		for (const slide of this.viewerDocument.slides) {
			slide.addEventListener(PropertyEvent.UPDATE, handler);
			this._slideMetaUnsubscribers.push(() =>
				slide.removeEventListener(PropertyEvent.UPDATE, handler)
			);
		}
	}

	public commandSelectPreviousSlide(): void {
		this.listVC.selectPreviousSlide();
	}

	public commandSelectNextSlide(): void {
		this.listVC.selectNextSlide();
	}

	public commandSelectSlideByIndex(index: number): void {
		this.listVC.selectSlideByIndex(index);
	}

	public commandEnterSelectMode(): void {
		this.setMode(ViewerMode.SELECT);
	}

	public commandEnterEditMode(): void {
		if (!this.canRunEditOperations("編集モード切替")) {
			return;
		}
		if (!this.listVC.selectedSlide) {
			showNotice("編集対象のスライドを選択してください。");
			return;
		}
		this.setMode(ViewerMode.EDIT);
		this.editVC.setSlide(this.listVC.selectedSlide);
	}

	public commandNewDocument(): void {
		if (!this.ensureAllowed(this.canEdit(), "新規作成")) return;
		if (this.viewerDocument.slides.length == 0) return;
		if (this.canProceedWithDiscard("clear slides and new document. Are you sure?")) {
			this.newDocument();
		}
	}

	public commandSaveDocument(): void {
		if (!this.ensureAllowed(this.canSave(), "保存")) return;
		if (this.listVC.slides.length == 0) return;
		const isOverride = this.shouldOverrideSave();
		this.handleStorageResult(this.documentStorage.saveResult(this.viewerDocument, isOverride));
	}

	public commandExportDocument(): void {
		if (!this.ensureAllowed(this.canExport(), "書き出し")) return;
		if (this.listVC.slides.length == 0) return;
		const fmt = getSaveFormat();
		const type = fmt === "hvz" ? HVDataType.HVZ : fmt === "hvd" ? HVDataType.HVD : HVDataType.PNG;

		const result = this.documentStorage.exportResult(this.viewerDocument, type, {
			pages: this.listVC.selectedSlideIndex != -1 ? [this.listVC.selectedSlideIndex] : undefined,
		});
		this.handleStorageResult(result);
	}

	public commandDeleteSavedFile(fileId: string): void {
		if (!this.ensureAllowed(this.getPermissionPolicy().canDeleteSavedData, "保存データ削除")) return;
		if (fileId == null || fileId === "-1") return;
		this.setSavedFileSelection(fileId);
		this.handleStorageResult(this.documentStorage.deleteResult(fileId));
	}

	public commandLoadSavedFile(fileId: string): void {
		if (fileId == null || fileId === "-1") return;
		this.setSavedFileSelection(fileId);
		this.handleStorageResult(this.documentStorage.loadResult(fileId));
	}

	public commandSelectSavedFile(fileId: string | null): void {
		this.setSavedFileSelection(fileId);
	}

	public commandLoadSelectedSavedFile(): void {
		const targetId = this.ensureSelectedSavedFileId();
		if (!targetId) return;
		this.handleStorageResult(this.documentStorage.loadResult(targetId));
	}

	public commandDeleteSelectedSavedFile(): void {
		if (!this.selectedSavedFileId) return;
		this.commandDeleteSavedFile(this.selectedSavedFileId);
	}

	public commandSelectNextSavedFile(): void {
		const titles = this.documentStorage.getTitles();
		if (titles.length === 0) return;
		let selectedIndex = this.findSavedFileIndex(this.selectedSavedFileId);
		if (selectedIndex === -1) selectedIndex = 0;
		const nextIndex = Math.min(selectedIndex + 1, titles.length - 1);
		this.setSavedFileSelection(String(titles[nextIndex].id));
	}

	public commandSelectPreviousSavedFile(): void {
		const titles = this.documentStorage.getTitles();
		if (titles.length === 0) return;
		let selectedIndex = this.findSavedFileIndex(this.selectedSavedFileId);
		if (selectedIndex === -1) selectedIndex = 0;
		const nextIndex = Math.max(selectedIndex - 1, 0);
		this.setSavedFileSelection(String(titles[nextIndex].id));
	}

	public commandOpenImportDialog(): void {
		if (!this.ensureAllowed(this.canImport(), "読み込み")) return;
		if (!this.canProceedWithDiscard("load slides. Are you sure?")) return;

		if (!this.importInput) {
			const input = document.createElement("input");
			input.type = "file";
			input.accept = ".png,.hvd,.hvz";
			input.style.display = "none";
			input.onchange = () => {
				const file = input.files?.[0];
				if (!file) return;
				this.handleStorageResult(this.documentStorage.importResult(file));
				input.value = "";
			};
			document.body.appendChild(input);
			this.importInput = input;
		}

		this.importInput.value = "";
		this.importInput.click();
	}

	public commandExportImages(): void {
		if (!this.ensureAllowed(this.canExport(), "画像出力")) return;
		this.viewerDocument.downloadImage();
	}

	public commandDownloadSelectedSlide(): void {
		this.viewerDocument.downloadImage(this.listVC.selectedSlideIndex);
	}

	public commandSetSlideShowDuration(duration: number): void {
		this.slideShowDuration = duration;
		this.emitSlideShowSettings();
	}

	public commandSetSlideShowInterval(interval: number): void {
		this.slideShowInterval = interval;
		this.emitSlideShowSettings();
	}

	public commandSetBackgroundColor(color: string): void {
		if (!this.ensureAllowed(this.canEdit(), "背景色変更")) return;
		this.slideShowBgColor = color;
		if (this.viewerDocument) {
			this.viewerDocument.bgColor = color;
		}
		this.emitSlideShowSettings();
	}

	public commandSetFullscreen(enabled: boolean): void {
		this.slideShowFullscreen = enabled;
		this.slideShowVC.fullscreen = enabled;
		this.emitSlideShowSettings();
	}

	public commandSetMirrorH(enabled: boolean): void {
		this.slideShowMirrorH = enabled;
		this.slideShowVC.mirrorH = enabled;
		this.emitSlideShowSettings();
	}

	public commandSetMirrorV(enabled: boolean): void {
		this.slideShowMirrorV = enabled;
		this.slideShowVC.mirrorV = enabled;
		this.emitSlideShowSettings();
	}

	public commandStartSlideshow(): void {
		this.startSlideShowFromSelection();
	}

	public commandUndo(): void {
		if (!this.ensureAllowed(this.canEdit(), "Undo")) return;
		if (Viewer.startUpMode != ViewerStartUpMode.VIEW_AND_EDIT) return;
		HistoryManager.shared.undo();
	}

	public commandRedo(): void {
		if (!this.ensureAllowed(this.canEdit(), "Redo")) return;
		if (Viewer.startUpMode != ViewerStartUpMode.VIEW_AND_EDIT) return;
		HistoryManager.shared.redo();
	}

	public commandRotateSelectedLayerLeft(): void {
		this.runEditSelectionOperation("レイヤー回転", () => this.editVC.rotateSelectedLayer(-90));
	}

	public commandRotateSelectedLayerRight(): void {
		this.runEditSelectionOperation("レイヤー回転", () => this.editVC.rotateSelectedLayer(90));
	}

	public commandToggleSelectedLayerMirrorH(): void {
		this.runEditSelectionOperation("水平反転", () => this.editVC.toggleSelectedLayerMirrorH());
	}

	public commandToggleSelectedLayerMirrorV(): void {
		this.runEditSelectionOperation("垂直反転", () => this.editVC.toggleSelectedLayerMirrorV());
	}

	public commandToggleSelectedLayerIsText(): void {
		this.runEditSelectionOperation("テキスト切替", () =>
			this.editVC.toggleSelectedLayerIsText()
		);
	}

	public commandSpreadSelectedLayer(): void {
		if (!this.canRunEditOperations("全スライド展開")) return;
		const ok = this.editVC.spreadSelectedLayer();
		if (!ok) {
			showNotice("レイヤーを選択してください。");
		}
	}

	public commandFitSelectedLayer(): void {
		this.runEditSelectionOperation("フィット", () => this.editVC.fitSelectedLayer());
	}

	public commandArrangeSelectedLayerTop(): void {
		this.runEditSelectionOperation("上揃え", () =>
			this.editVC.arrangeSelectedLayer(Direction.TOP)
		);
	}

	public commandArrangeSelectedLayerRight(): void {
		this.runEditSelectionOperation("右揃え", () =>
			this.editVC.arrangeSelectedLayer(Direction.RIGHT)
		);
	}

	public commandArrangeSelectedLayerBottom(): void {
		this.runEditSelectionOperation("下揃え", () =>
			this.editVC.arrangeSelectedLayer(Direction.BOTTOM)
		);
	}

	public commandArrangeSelectedLayerLeft(): void {
		this.runEditSelectionOperation("左揃え", () =>
			this.editVC.arrangeSelectedLayer(Direction.LEFT)
		);
	}

	public commandMoveSelectedLayerUp(): void {
		this.runEditSelectionOperation("レイヤー順序変更", () => this.editVC.swapSelectedLayer(1));
	}

	public commandMoveSelectedLayerDown(): void {
		this.runEditSelectionOperation("レイヤー順序変更", () => this.editVC.swapSelectedLayer(-1));
	}

	public commandMoveSelectedLayerToTop(): void {
		this.runEditSelectionOperation("最前面へ移動", () => this.editVC.moveSelectedLayerToTop());
	}

	public commandMoveSelectedLayerToBottom(): void {
		this.runEditSelectionOperation("最背面へ移動", () =>
			this.editVC.moveSelectedLayerToBottom()
		);
	}

	public commandCopySelectedLayer(): void {
		this.runEditSelectionOperation("レイヤーコピー", () => this.editVC.copySelectedLayer());
	}

	public commandCutSelectedLayer(): void {
		this.runEditSelectionOperation("レイヤーカット", () => this.editVC.cutSelectedLayer());
	}

	public commandPasteLayer(): void {
		this.runEditOperation("レイヤー貼り付け", () => {
			this.editVC.pasteLayer();
		});
	}

	public commandAddTextLayer(text: string): void {
		this.runEditOperation("テキストレイヤー追加", () => {
			this.editVC.addTextLayer(text);
		});
	}

	public commandCopySelectedLayerTransform(): void {
		this.runEditSelectionOperation("変形コピー", () => this.editVC.copySelectedLayerTransform());
	}

	public commandPasteLayerTransform(): void {
		this.runEditSelectionOperation("変形貼り付け", () => this.editVC.pasteLayerTransform());
	}

	public commandRemoveSelectedLayer(): void {
		this.runEditSelectionOperation("レイヤー削除", () => this.editVC.removeSelectedLayer());
	}

	public commandNudgeSelectedLayerLeft(): void {
		this.runEditSelectionOperationSilently("レイヤー移動", () =>
			this.editVC.nudgeSelectedLayer(-10, 0)
		);
	}

	public commandNudgeSelectedLayerRight(): void {
		this.runEditSelectionOperationSilently("レイヤー移動", () =>
			this.editVC.nudgeSelectedLayer(10, 0)
		);
	}

	public commandNudgeSelectedLayerUp(): void {
		this.runEditSelectionOperationSilently("レイヤー移動", () =>
			this.editVC.nudgeSelectedLayer(0, -10)
		);
	}

	public commandNudgeSelectedLayerDown(): void {
		this.runEditSelectionOperationSilently("レイヤー移動", () =>
			this.editVC.nudgeSelectedLayer(0, 10)
		);
	}

	public commandScaleSelectedLayerUp(): void {
		this.runEditSelectionOperationSilently("レイヤー拡大縮小", () =>
			this.editVC.scaleSelectedLayer(1.1)
		);
	}

	public commandScaleSelectedLayerDown(): void {
		this.runEditSelectionOperationSilently("レイヤー拡大縮小", () =>
			this.editVC.scaleSelectedLayer(1 / 1.1)
		);
	}

	public commandAdjustSelectedLayerRotationLeft(): void {
		this.runEditSelectionOperationSilently("レイヤー回転", () =>
			this.editVC.adjustSelectedLayerRotation(-5)
		);
	}

	public commandAdjustSelectedLayerRotationRight(): void {
		this.runEditSelectionOperationSilently("レイヤー回転", () =>
			this.editVC.adjustSelectedLayerRotation(5)
		);
	}

	public commandResetSelectedLayerRotation(): void {
		this.runEditSelectionOperationSilently("レイヤー回転", () =>
			this.editVC.resetSelectedLayerRotation()
		);
	}

	public commandDecreaseSelectedLayerOpacity(): void {
		this.runEditSelectionOperationSilently("透明度変更", () =>
			this.editVC.adjustSelectedLayerOpacity(-0.05)
		);
	}

	public commandIncreaseSelectedLayerOpacity(): void {
		this.runEditSelectionOperationSilently("透明度変更", () =>
			this.editVC.adjustSelectedLayerOpacity(0.05)
		);
	}

	public commandResetSelectedLayerOpacity(): void {
		this.runEditSelectionOperationSilently("透明度変更", () =>
			this.editVC.resetSelectedLayerOpacity()
		);
	}

	public commandSetSelectedLayerPosition(x: number, y: number): void {
		this.runEditSelectionOperationSilently("位置変更", () =>
			this.editVC.setSelectedLayerPosition(x, y)
		);
	}

	public commandSetSelectedLayerScale(scale: number): void {
		this.runEditSelectionOperationSilently("拡大縮小", () =>
			this.editVC.setSelectedLayerScale(scale)
		);
	}

	public commandSetSelectedLayerRotation(rotation: number): void {
		this.runEditSelectionOperationSilently("回転変更", () =>
			this.editVC.setSelectedLayerRotation(rotation)
		);
	}

	public commandSetSelectedLayerOpacity(opacity: number): void {
		this.runEditSelectionOperationSilently("透明度変更", () =>
			this.editVC.setSelectedLayerOpacity(opacity)
		);
	}

	public commandAdjustSelectedImageClip(
		side: "top" | "right" | "bottom" | "left",
		delta: number
	): void {
		this.runEditSelectionOperationSilently("クリップ変更", () =>
			this.editVC.adjustSelectedImageClip(side, delta)
		);
	}

	public commandResetSelectedImageClip(): void {
		this.runEditSelectionOperationSilently("クリップ変更", () =>
			this.editVC.resetSelectedImageClip()
		);
	}

	public commandSelectEditLayerByIndex(index: number): void {
		if (!this.canRunEditOperations("レイヤー選択")) {
			return;
		}
		if (!this.editVC.selectEditLayerByIndex(index)) {
			showNotice("対象レイヤーが見つかりません。");
		}
		this.emitEditSelectionState();
	}

	public commandToggleSelectedLayerVisible(): void {
		this.runEditSelectionOperationSilently("表示切替", () =>
			this.editVC.toggleSelectedLayerVisible()
		);
	}

	public commandToggleSelectedLayerLocked(): void {
		this.runEditSelectionOperationSilently("ロック切替", () =>
			this.editVC.toggleSelectedLayerLocked()
		);
	}

	public commandToggleSelectedLayerShared(): void {
		this.runEditSelectionOperationSilently("共有切替", () =>
			this.editVC.toggleSelectedLayerShared()
		);
	}

	public commandSetSelectedLayerName(name: string): void {
		this.runEditSelectionOperationSilently("レイヤー名変更", () =>
			this.editVC.setSelectedLayerName(name)
		);
	}

	public commandSetSelectedLayerText(text: string): void {
		this.runEditSelectionOperationSilently("テキスト変更", () =>
			this.editVC.setSelectedLayerText(text)
		);
	}

	public commandZoomInCanvas(): void {
		this.runEditOperation("キャンバス拡大", () => {
			this.editVC.zoomInCanvas();
		});
	}

	public commandZoomOutCanvas(): void {
		this.runEditOperation("キャンバス縮小", () => {
			this.editVC.zoomOutCanvas();
		});
	}

	public commandResetCanvasZoom(): void {
		this.runEditOperation("キャンバス倍率初期化", () => {
			this.editVC.resetCanvasZoom();
		});
	}

	public commandSetCanvasScale(scale: number): void {
		if (!isFinite(scale) || scale <= 0) {
			return;
		}
		this.runEditOperation("キャンバス倍率変更", () => {
			this.editVC.setCanvasScale(scale);
		});
	}

	public commandToggleRectEdit(): void {
		this.runEditOperation("同時編集切替", () => {
			this.editVC.toggleRectEdit();
		});
	}

	public commandSetRectEdit(enabled: boolean): void {
		this.runEditOperation("同時編集設定", () => {
			this.editVC.setRectEdit(Boolean(enabled));
		});
	}

	public async commandReplaceSelectedImage(
		file: File,
		applyAllReferences: boolean
	): Promise<void> {
		if (!this.canRunEditOperations("画像差し替え")) {
			return;
		}
		if (!file) {
			return;
		}
		const ok = await this.editVC.replaceSelectedImage(file, applyAllReferences);
		if (!ok) {
			showNotice("画像レイヤーを選択してください。");
		}
		this.emitEditSelectionState();
	}

	public commandDownloadSelectedImage(): void {
		this.runEditSelectionOperation("画像ダウンロード", () =>
			this.editVC.downloadSelectedImage()
		);
	}

	public getSavedFileTitles() {
		return this.documentStorage.getTitles();
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
