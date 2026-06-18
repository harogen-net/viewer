import $ from "jquery";
import { setActiveViewer } from "./bridge/activeViewer";
import { ViewerBridge } from "./bridge/ViewerBridge";
import { PropertyEvent } from "./events/PropertyEvent";
import { getScreenSlideSize, Slide } from "./model/Slide";
import { createViewerDocument, type ViewerDocument } from "./model/ViewerDocument";
import { EditCanvasRuntime } from "./runtime/EditCanvasRuntime";
import { FeatureGate } from "./runtime/featureGate";
import { showNotice } from "./runtime/notice";
import { getSaveFormat } from "./runtime/reactDomRegistry";
import { SlideShowRuntime } from "./runtime/SlideShowRuntime";
import { ViewerMode, ViewerStartUpMode } from "./runtime/viewerMode";
import { createLayerActions } from "./state/layerActions";
import { layerStore } from "./state/layerStore";
import { slideStore } from "./state/slideStore";
import { uiStore } from "./state/uiStore";
import { viewerDocumentStore } from "./state/viewerDocumentStore";
import { createStorageAdapter } from "./storage/createStorageAdapter";
import { HVDataType } from "./storage/storageTypes";
import { DocumentStorageUseCase, type StorageActionResult } from "./useCase/DocumentStorageUseCase";
import {
	downloadAllSlidesAsZip,
	downloadSlideAsPNG,
	type ImageExportContext,
} from "./useCase/ImageExportUseCase";
import {
	createSavedFileNavigationUseCase,
	type SavedFileNavigationUseCase,
} from "./useCase/SavedFileNavigationUseCase";
import {
	createSlideCommandsUseCase,
	type SlideCommandsUseCase,
} from "./useCase/SlideCommandsUseCase";
import {
	createSlideHistoryUseCase,
	type SlideHistoryUseCase,
} from "./useCase/SlideHistoryUseCase";
import { createSlideshowUseCase, type SlideshowUseCase } from "./useCase/SlideshowUseCase";
import { handleStorageActionResult } from "./useCase/storageActionResult";
import { DateUtil } from "./utils/DateUtil";
import { HistoryManager } from "./utils/HistoryManager";
import { ImageManager } from "./utils/ImageManager";

export class Viewer {
	public static isStrictMode: boolean = true;
	public static startUpMode: ViewerStartUpMode = ViewerStartUpMode.VIEW_AND_EDIT;

	private editCanvasRuntime: EditCanvasRuntime;
	private slideShowRuntime: SlideShowRuntime;
	private slideshowUseCase: SlideshowUseCase;
	private documentStorage: DocumentStorageUseCase;
	private savedFileNav: SavedFileNavigationUseCase;
	private slideHistory: SlideHistoryUseCase = createSlideHistoryUseCase({
		getStartUpMode: () => Viewer.startUpMode,
		rebindSlideMetaListeners: () => this.rebindSlideMetaListeners(),
	});
	private slideCommands: SlideCommandsUseCase = createSlideCommandsUseCase({
		getSlides: () => this.slides,
		getSelectedSlide: () => this.selectedSlide,
		getSelectedSlideIndex: () => this.selectedSlideIndex,
		getViewerDocumentSize: () => {
			const { width, height } = viewerDocumentStore.getState();
			return { width, height };
		},
		ensureAllowed: (canExecute, label) => this.ensureAllowed(canExecute, label),
		canEdit: () => this.canEdit(),
		canEnterEditMode: (label) => this.canEnterEditMode(label),
		slideHistory: this.slideHistory,
		addSlide: (slide, index) => this.addSlide(slide, index),
		removeSlide: (slide, destroy) => this.removeSlide(slide, destroy),
		selectSlideInstance: (slide) => this.selectSlideInstance(slide),
		selectSlideByIndex: (index) => this.selectSlideByIndex(index),
		selectSlideByOffset: (offset) => this.selectSlideByOffset(offset),
		moveSelectedSlideByOffset: (offset) => this.moveSelectedSlideByOffset(offset),
		moveSelectedSlideToIndex: (toIndex) => this.moveSelectedSlideToIndex(toIndex),
		setMode: (mode) => this.setMode(mode),
		getEditCanvasRuntime: () => this.editCanvasRuntime,
		publishEditSelectionState: () => layerStore.getState().commands?.publishEditSelectionState(),
	});

	private _mode: ViewerMode;

	private viewerDocument: ViewerDocument;
	private _isDocumentModified = false;
	/** Per-slide cleanup functions for slide meta-property listeners */
	private _slideMetaUnsubscribers: Array<() => void> = [];

	get IsDocumentModified(): boolean {
		return this._isDocumentModified;
	}
	set IsDocumentModified(value: boolean) {
		this._isDocumentModified = value;
		uiStore.getState().setModified(value);
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

	private canProceedWithDiscard(): boolean {
		if (!this.IsDocumentModified || !Viewer.isStrictMode) {
			return true;
		}
		return false;
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
		return false;
	}

	private initializeDocumentStorage(): void {
		this.documentStorage = new DocumentStorageUseCase(createStorageAdapter(), this.featureGate);
		this.savedFileNav = createSavedFileNavigationUseCase(this.documentStorage);
		this.documentStorage.onLoading((percentage) => {
			uiStore.getState().setStorageProgress(percentage);
		});
		this.documentStorage.onLoaded((doc) => {
			this.newDocument(doc);
		});
		this.documentStorage.onUpdated(() => {
			const titles = this.documentStorage.getTitles();
			uiStore.getState().setStorageTitles(titles);
			if (this.savedFileNav.findIndex(this.savedFileNav.getSelectedId()) === -1) {
				this.savedFileNav.setSelection(titles.length > 0 ? String(titles[0].id) : null);
			}
		});
		this.documentStorage.onError((error) => {
			showNotice(this.documentStorage.getErrorNoticeMessage(error));
		});
	}

	private canEnterEditMode(actionLabel: string): boolean {
		if (!this.ensureAllowed(this.canEdit(), actionLabel)) {
			return false;
		}
		return Viewer.startUpMode == ViewerStartUpMode.VIEW_AND_EDIT;
	}

	private initializeEditModeFeatures(startUpMode: ViewerStartUpMode): void {
		if (startUpMode != ViewerStartUpMode.VIEW_AND_EDIT) {
			return;
		}

		HistoryManager.init();
		HistoryManager.shared.addEventListener(PropertyEvent.UPDATE, (pe: PropertyEvent) => {
			this.IsDocumentModified = HistoryManager.shared.canUndo;
			this.slideHistory.publishHistoryState();
			layerStore.getState().commands?.publishCurrentEditState();
		});
		this.slideHistory.publishHistoryState();

		this.editCanvasRuntime = new EditCanvasRuntime(this.obj.find(".canvas"));
	}

	private handleSlideSelectionChanged(): void {
		if (!this.editCanvasRuntime || this._mode != ViewerMode.EDIT) return;
		if (this.selectedSlide) {
			this.editCanvasRuntime.setSlide(this.selectedSlide);
		} else {
			this.editCanvasRuntime.initialize();
		}
	}

	private handleSlideSelectionClosed(): void {
		if (this.editCanvasRuntime) {
			this.editCanvasRuntime.initialize();
		}
		this.setMode(ViewerMode.SELECT);
		layerStore.getState().commands?.publishEditSelectionState();
	}

	private get slides(): Slide[] {
		return slideStore.getState().slides as Slide[];
	}

	private get selectedSlide(): Slide | null {
		return slideStore.getState().selectedSlide;
	}

	private get selectedSlideIndex(): number {
		return slideStore.getState().selectedIndex;
	}

	private createDocumentSnapshot(
		overrides: Partial<Omit<ViewerDocument, "slides">> = {}
	): ViewerDocument {
		const documentState = viewerDocumentStore.getState();
		return createViewerDocument([...this.slides], {
			title: overrides.title ?? documentState.title,
			createTime: overrides.createTime ?? documentState.createTime,
			editTime: overrides.editTime ?? documentState.editTime,
			isSensitive: overrides.isSensitive ?? documentState.isSensitive,
			duration: overrides.duration ?? documentState.duration,
			interval: overrides.interval ?? documentState.interval,
			width: overrides.width ?? documentState.width,
			height: overrides.height ?? documentState.height,
			bgColor: overrides.bgColor ?? documentState.bgColor,
		});
	}

	private bindViewerDocument(document: ViewerDocument, slides: Slide[]): void {
		viewerDocumentStore.getState().setDocument({
			document,
			title: document.title,
			createTime: document.createTime,
			editTime: document.editTime,
			isSensitive: document.isSensitive,
			duration: document.duration,
			interval: document.interval,
			width: document.width,
			height: document.height,
			bgColor: document.bgColor,
			slides,
		});
	}

	private createDefaultViewerDocument(): ViewerDocument {
		const now = new Date().getTime();
		const screenSize = getScreenSlideSize();
		return createViewerDocument([], {
			title: DateUtil.getDateString(),
			createTime: now,
			editTime: now,
			isSensitive: false,
			width: screenSize.width,
			height: screenSize.height,
			bgColor: "#000000",
		});
	}

	private hasEnabledSlides(): boolean {
		return this.slides.some((slide) => !slide.disabled);
	}

	private getImageExportContext(): ImageExportContext {
		const { title, width, height, bgColor } = viewerDocumentStore.getState();
		return { title, width, height, bgColor };
	}

	private setSlides(slides: Slide[], selectedIndex = -1): void {
		slideStore.getState().setSlides(slides, selectedIndex);
	}

	private addSlide(slide: Slide, index = -1): Slide {
		slideStore.getState().addSlide(slide, index);
		return slide;
	}

	private removeSlide(slide: Slide, destroySlide = true): Slide {
		const index = this.slides.indexOf(slide);
		if (index === -1) return slide;
		const wasSelected = slide === this.selectedSlide;
		const nextSlide = wasSelected
			? index < this.slides.length - 1
				? this.slides[index + 1]
				: index > 0
					? this.slides[index - 1]
					: null
			: null;

		slideStore.getState().removeSlide(slide);
		if (destroySlide) {
			slide.removeAllLayers();
			slide.clearEventListener();
		}
		if (nextSlide) {
			this.selectSlideInstance(nextSlide);
		} else if (wasSelected) {
			slideStore.getState().setSelectedIndex(-1);
			this.handleSlideSelectionClosed();
		}
		return slide;
	}

	private selectSlideInstance(slide: Slide | null): void {
		if (slide && this.slides.indexOf(slide) === -1) return;
		slideStore.getState().setSelectedSlide(slide);
		this.handleSlideSelectionChanged();
	}

	private selectSlideByIndex(index: number): void {
		if (index < 0 || index >= this.slides.length) return;
		this.selectSlideInstance(this.slides[index]);
	}

	private selectSlideByOffset(offset: number): void {
		if (offset === 0 || this.selectedSlideIndex === -1) return;
		const index = Math.max(0, Math.min(this.slides.length - 1, this.selectedSlideIndex + offset));
		if (index === this.selectedSlideIndex) return;
		this.selectSlideByIndex(index);
	}

	private moveSelectedSlideToIndex(toIndex: number): boolean {
		if (!Number.isInteger(toIndex)) return false;
		if (!slideStore.getState().moveSelectedSlideToIndex(toIndex)) return false;
		this.handleSlideSelectionChanged();
		return true;
	}

	private moveSelectedSlideByOffset(offset: number): boolean {
		if (!Number.isInteger(offset) || offset === 0 || this.selectedSlideIndex === -1) return false;
		return this.moveSelectedSlideToIndex(this.selectedSlideIndex + offset);
	}

	private initializeRuntime(startUpMode: ViewerStartUpMode): void {
		ImageManager.init();

		if (startUpMode == ViewerStartUpMode.VIEW_AND_EDIT) {
			const preventDefault = (e: Event) => {
				e.preventDefault();
				e.stopImmediatePropagation();
			};
			document.addEventListener("drop", preventDefault);
			document.addEventListener("dragover", preventDefault);
		}
	}

	private initializeRuntimes(startUpMode: ViewerStartUpMode): void {
		this.slideShowRuntime = new SlideShowRuntime($("<div />").appendTo(this.obj), {
			onPlaybackChanged: ({ isRun, isPause }) => {
				this.slideshowUseCase?.handlePlaybackChanged(isRun, isPause);
			},
		});
		this.slideshowUseCase = createSlideshowUseCase({
			runtime: this.slideShowRuntime,
			getSlides: () => this.slides,
			getSelectedSlideIndex: () => this.selectedSlideIndex,
			getMode: () => this._mode,
			setMode: (mode) => this.setMode(mode),
		});
		this.initializeDocumentStorage();
		this.initializeEditModeFeatures(startUpMode);
	}

	private initializeBindings(): void {
		this.registerBeforeUnloadWarning();
	}

	private shouldRegisterBeforeUnloadWarning(): boolean {
		return (
			Viewer.startUpMode == ViewerStartUpMode.VIEW_AND_EDIT && process.env.NODE_ENV == "production"
		);
	}

	private registerBeforeUnloadWarning(): void {
		if (!this.shouldRegisterBeforeUnloadWarning()) {
			return;
		}

		window.addEventListener(
			"beforeunload",
			(e) => {
				if (this.slides.length > 0 || !Viewer.isStrictMode) {
					e.returnValue = "ページを離れます。よろしいですか？";
				}
			},
			false
		);
	}

	private applySelectMode(): void {
		$("body").removeClass("slideShow");
		this.obj.addClass("select");
		this.obj.removeClass("edit");
		if (Viewer.startUpMode == ViewerStartUpMode.VIEW_AND_EDIT) {
			this.editCanvasRuntime.slideView.isActive = false;
		}
	}

	private applyEditMode(): void {
		$("body").removeClass("slideShow");
		this.obj.removeClass("select");
		this.obj.addClass("edit");
		if (Viewer.startUpMode == ViewerStartUpMode.VIEW_AND_EDIT) {
			this.editCanvasRuntime.slideView.isActive = true;
		}
	}

	constructor(
		public obj: JQuery,
		startUpMode: ViewerStartUpMode,
		private featureGate?: FeatureGate
	) {
		setActiveViewer(this);
		Viewer.startUpMode = startUpMode;

		this.initializeRuntime(startUpMode);
		this.initializeRuntimes(startUpMode);
		this.initializeBindings();

		// R3.7/R3.8c: ストアにドメインコマンドを注入。layer は `state/layerActions` の
		// ファクトリで生成した instance を bindCommands で渡す（store は state slot のみ持つ）。
		layerStore.getState().bindCommands(
			createLayerActions({
				getStartUpMode: () => Viewer.startUpMode,
				getMode: () => this._mode,
				getEditCanvasRuntime: () => this.editCanvasRuntime,
				canEdit: () => this.canEdit(),
				canExport: () => this.canExport(),
				ensureAllowed: (canExecute, label) => this.ensureAllowed(canExecute, label),
				setDocumentModified: (value) => {
					this.IsDocumentModified = value;
				},
				slideHistory: this.slideHistory,
				notice: showNotice,
				historyManager: HistoryManager.shared,
				imageManager: ImageManager.shared,
			})
		);
		slideStore.getState().bindCommands(this.slideCommands);
		viewerDocumentStore.getState().bindCommands({
			storage: this.documentStorage,
			savedFileNav: this.savedFileNav,
			slideshow: this.slideshowUseCase,
			history: this.slideHistory,
		});

		this.newDocument();
	}

	//priate methods
	private newDocument(nextDocument?: ViewerDocument) {
		const nextSlides = nextDocument ? [...nextDocument.slides] : null;
		if (this.viewerDocument) {
			this.viewerDocument = null;

			this.setSlides([], -1);
			if (Viewer.startUpMode == ViewerStartUpMode.VIEW_AND_EDIT) {
				this.setMode(ViewerMode.SELECT);
				this.editCanvasRuntime.initialize();
				HistoryManager.shared.initialize();
			}
		}

		this.setMode(ViewerMode.SELECT);
		if (!nextDocument) {
			//nextDocumentがnullでない⇒slideStorageがdocumentを生成してImageManagerをリセット＆登録済みなので
			ImageManager.shared.initialize();
			nextDocument = this.createDefaultViewerDocument();
		}
		const slidesToBind = nextSlides ?? [...nextDocument.slides];
		this.viewerDocument = nextDocument;
		uiStore.getState().setSlideshowSettings({
			...uiStore.getState().slideshowSettings,
			bgColor: this.viewerDocument.bgColor,
		});
		this.slideshowUseCase.syncRuntimeFlags();
		this.bindViewerDocument(this.viewerDocument, slidesToBind);
		this.IsDocumentModified = false;
		this.slideHistory.publishHistoryState();
		layerStore.getState().commands?.publishEditSelectionState();
		this.rebindSlideMetaListeners();
		uiStore.getState().setStorageTitles(this.documentStorage.getTitles());
		const titles = this.documentStorage.getTitles();
		const currentId = this.savedFileNav.getSelectedId();
		const currentSelectionExists = this.savedFileNav.findIndex(currentId) !== -1;
		if (currentSelectionExists) {
			this.savedFileNav.setSelection(currentId);
		} else {
			this.savedFileNav.setSelection(titles.length > 0 ? String(titles[0].id) : null);
		}
	}

	public setMode(mode: ViewerMode) {
		if (mode == this._mode) {
			if (mode !== ViewerMode.SLIDESHOW) {
				$("body").removeClass("slideShow");
			}
			return;
		}
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
		if (Viewer.startUpMode == ViewerStartUpMode.VIEW_AND_EDIT) {
			this.editCanvasRuntime.setMode(this._mode);
		}

		const bridgeMode =
			this._mode === ViewerMode.EDIT
				? "edit"
				: this._mode === ViewerMode.SLIDESHOW
					? "slideshow"
					: "select";
		uiStore.getState().setMode(bridgeMode);
		layerStore.getState().commands?.publishEditSelectionState();
	}

	public commandNewSlide(): void {
		this.slideCommands.newSlide();
	}

	public commandCloneSelectedSlide(): void {
		this.slideCommands.cloneSelected();
	}

	public commandAddImageSlide(imageId: string, toIndex: number = -1): void {
		this.slideCommands.addImageSlide(imageId, toIndex);
	}

	public commandDeleteSelectedSlide(): void {
		this.slideCommands.deleteSelected();
	}

	public commandMoveSelectedSlideBackward(): void {
		this.slideCommands.moveSelectedBackward();
	}

	public commandMoveSelectedSlideForward(): void {
		this.slideCommands.moveSelectedForward();
	}

	public commandMoveSelectedSlideToIndex(toIndex: number): void {
		this.slideCommands.moveSelectedToIndex(toIndex);
	}

	public commandToggleSelectedSlideJoining(): void {
		this.slideCommands.toggleSelectedJoining();
	}

	public commandToggleAllSlidesJoining(): void {
		this.slideCommands.toggleAllJoining();
	}

	public commandUnjoinAllSlides(): void {
		this.slideCommands.unjoinAll();
	}

	public commandToggleSelectedSlideDisabled(): void {
		this.slideCommands.toggleSelectedDisabled();
	}

	public commandEnableAllSlides(): void {
		this.slideCommands.enableAll();
	}

	public commandDisableAllSlides(): void {
		this.slideCommands.disableAll();
	}

	public commandEnableOnlySelectedSlide(): void {
		this.slideCommands.enableOnlySelected();
	}

	public commandDeleteDisabledSlides(): void {
		this.slideCommands.deleteDisabled();
	}

	public commandSetSelectedSlideDurationRatio(ratio: number): void {
		this.slideCommands.setSelectedDurationRatio(ratio);
	}

	private rebindSlideMetaListeners(): void {
		for (const unsub of this._slideMetaUnsubscribers) {
			unsub();
		}
		this._slideMetaUnsubscribers = [];
		if (!this.viewerDocument) return;
		const handler = () => {
			this.slideHistory.publishSlides();
		};
		for (const slide of this.slides) {
			slide.addEventListener(PropertyEvent.UPDATE, handler);
			this._slideMetaUnsubscribers.push(() =>
				slide.removeEventListener(PropertyEvent.UPDATE, handler)
			);
		}
	}

	public commandSelectPreviousSlide(): void {
		this.slideCommands.selectPrevious();
	}

	public commandSelectNextSlide(): void {
		this.slideCommands.selectNext();
	}

	public commandSelectSlideByIndex(index: number): void {
		this.slideCommands.selectByIndex(index);
	}

	public commandEnterSelectMode(): void {
		this.slideCommands.enterSelectMode();
	}

	public commandCloseEditMode(): void {
		this.slideCommands.closeEditMode();
	}

	public commandEnterEditMode(): void {
		this.slideCommands.enterEditMode();
	}

	public commandNewDocument(confirmed = false): void {
		if (!this.ensureAllowed(this.canEdit(), "新規作成")) return;
		if (this.slides.length == 0) return;
		if (
			!confirmed &&
			this.IsDocumentModified &&
			Viewer.isStrictMode &&
			ViewerBridge.hasListeners("newDocumentRequested")
		) {
			ViewerBridge.emit("newDocumentRequested", { open: true });
			return;
		}
		if (confirmed || this.canProceedWithDiscard()) {
			this.newDocument();
		}
	}

	public commandSaveDocument(override?: boolean): void {
		if (!this.ensureAllowed(this.canSave(), "保存")) return;
		if (this.slides.length == 0) return;
		if (override == null && ViewerBridge.hasListeners("saveChoiceRequested")) {
			ViewerBridge.emit("saveChoiceRequested", { open: true });
			return;
		}
		const isOverride = override ?? this.shouldOverrideSave();
		const editTime = new Date().getTime();
		const title = isOverride ? viewerDocumentStore.getState().title : DateUtil.getDateString();
		const snapshot = this.createDocumentSnapshot({ title, editTime });
		const resultPromise = this.documentStorage.saveResult(snapshot, isOverride).then((result) => {
			if (result.ok) {
				viewerDocumentStore.getState().setDocumentMeta({ title, editTime });
			}
			return result;
		});
		this.handleStorageResult(resultPromise);
	}

	public commandExportDocument(): void {
		if (!this.ensureAllowed(this.canExport(), "書き出し")) return;
		if (this.slides.length == 0) return;
		const fmt = getSaveFormat();
		const type = fmt === "hvz" ? HVDataType.HVZ : fmt === "hvd" ? HVDataType.HVD : HVDataType.PNG;

		const result = this.documentStorage.exportResult(this.createDocumentSnapshot(), type, {
			pages: this.selectedSlideIndex != -1 ? [this.selectedSlideIndex] : undefined,
		});
		this.handleStorageResult(result);
	}

	public commandDeleteSavedFile(fileId: string): void {
		if (!this.ensureAllowed(this.getPermissionPolicy().canDeleteSavedData, "保存データ削除"))
			return;
		const result = this.savedFileNav.deleteById(fileId);
		if (result) this.handleStorageResult(result);
	}

	public commandLoadSavedFile(fileId: string): void {
		const result = this.savedFileNav.loadById(fileId);
		if (result) this.handleStorageResult(result);
	}

	public commandSelectSavedFile(fileId: string | null): void {
		this.savedFileNav.setSelection(fileId);
	}

	public commandLoadSelectedSavedFile(): void {
		const result = this.savedFileNav.loadSelected();
		if (result) this.handleStorageResult(result);
	}

	public commandDeleteSelectedSavedFile(): void {
		if (!this.ensureAllowed(this.getPermissionPolicy().canDeleteSavedData, "保存データ削除"))
			return;
		const result = this.savedFileNav.deleteSelected();
		if (result) this.handleStorageResult(result);
	}

	public commandSelectNextSavedFile(): void {
		this.savedFileNav.selectNext();
	}

	public commandSelectPreviousSavedFile(): void {
		this.savedFileNav.selectPrevious();
	}

	public commandOpenImportDialog(confirmed = false): void {
		if (!this.ensureAllowed(this.canImport(), "読み込み")) return;
		if (
			!confirmed &&
			this.IsDocumentModified &&
			Viewer.isStrictMode &&
			ViewerBridge.hasListeners("importDialogRequested")
		) {
			ViewerBridge.emit("importDialogRequested", { open: true });
			return;
		}
		if (!confirmed && !this.canProceedWithDiscard()) return;

		if (ViewerBridge.hasListeners("importFileDialogRequested")) {
			ViewerBridge.emit("importFileDialogRequested", { open: true });
		}
	}

	public commandImportFile(file: File): void {
		if (!this.ensureAllowed(this.canImport(), "読み込み")) return;
		if (!file) return;
		this.handleStorageResult(this.documentStorage.importResult(file));
	}

	public commandExportImages(): void {
		if (!this.ensureAllowed(this.canExport(), "画像出力")) return;
		if (!this.hasEnabledSlides()) {
			showNotice("有効なスライドがありません。");
			return;
		}
		downloadAllSlidesAsZip(this.slides, this.getImageExportContext());
	}

	public commandDownloadSelectedSlide(): void {
		if (!this.ensureAllowed(this.canExport(), "画像出力")) return;
		if (this.selectedSlideIndex === -1 && !this.hasEnabledSlides()) {
			showNotice("有効なスライドがありません。");
			return;
		}
		const index = this.selectedSlideIndex;
		const slide = this.slides[index];
		if (!slide) throw new Error("invalid index.");
		downloadSlideAsPNG(slide, index, this.getImageExportContext());
	}

	public commandSetSlideShowDuration(duration: number): void {
		this.slideshowUseCase.setDuration(duration);
	}

	public commandSetSlideShowInterval(interval: number): void {
		this.slideshowUseCase.setInterval(interval);
	}

	public commandSetBackgroundColor(color: string): void {
		if (!this.ensureAllowed(this.canEdit(), "背景色変更")) return;
		this.slideshowUseCase.setBgColor(color);
	}

	public commandSetFullscreen(enabled: boolean): void {
		this.slideshowUseCase.setFullscreen(enabled);
	}

	public commandSetMirrorH(enabled: boolean): void {
		this.slideshowUseCase.setMirrorH(enabled);
	}

	public commandSetMirrorV(enabled: boolean): void {
		this.slideshowUseCase.setMirrorV(enabled);
	}

	public commandStartSlideshow(): void {
		this.slideshowUseCase.start();
	}

	public commandStopSlideshow(): void {
		this.slideshowUseCase.stop();
	}

	public commandToggleSlideshowPause(): void {
		this.slideshowUseCase.togglePause();
	}

	public commandShowPreviousSlide(): void {
		this.slideshowUseCase.showPrevious();
	}

	public commandShowNextSlide(): void {
		this.slideshowUseCase.showNext();
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
