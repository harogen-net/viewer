import $ from "jquery";
import JSZip from "jszip";
import { ViewerBridge } from "./bridge/ViewerBridge";
import { PropertyEvent } from "./events/PropertyEvent";
import { createImageLayer } from "./model/layer/ImageLayer";
import { createSlide, Direction, getScreenSlideSize, Slide } from "./model/Slide";
import { createViewerDocument, type ViewerDocument } from "./model/ViewerDocument";
import { EditCanvasRuntime } from "./runtime/EditCanvasRuntime";
import { FeatureGate } from "./runtime/featureGate";
import { showNotice } from "./runtime/notice";
import { getSaveFormat } from "./runtime/reactDomRegistry";
import { SlideShowPlaybackSettings, SlideShowRuntime } from "./runtime/SlideShowRuntime";
import { ViewerMode, ViewerStartUpMode } from "./runtime/viewerMode";
import { layerStore } from "./state/layerStore";
import { slideStore } from "./state/slideStore";
import { uiStore } from "./state/uiStore";
import { viewerDocumentStore } from "./state/viewerDocumentStore";
import { createStorageAdapter } from "./storage/createStorageAdapter";
import { HVDataType } from "./storage/storageTypes";
import { DocumentStorageUseCase, type StorageActionResult } from "./useCase/DocumentStorageUseCase";
import { handleStorageActionResult } from "./useCase/storageActionResult";
import { DataUtil } from "./utils/DataUtil";
import { DateUtil } from "./utils/DateUtil";
import { Command, HistoryManager } from "./utils/HistoryManager";
import { ImageManager } from "./utils/ImageManager";
import { SlideToPNGConverter } from "./utils/SlideToPNGConverter";

export class Viewer {
	public static shared: Viewer;
	public static isStrictMode: boolean = true;
	public static startUpMode: ViewerStartUpMode = ViewerStartUpMode.VIEW_AND_EDIT;

	private editCanvasRuntime: EditCanvasRuntime;
	private slideShowRuntime: SlideShowRuntime;
	private documentStorage: DocumentStorageUseCase;

	private _mode: ViewerMode;
	private selectedSavedFileId: string | null = null;
	private slideShowDuration = 2000;
	private slideShowInterval = 6000;
	private slideShowBgColor = "#999999";
	private slideShowFullscreen = false;
	private slideShowMirrorH = false;
	private slideShowMirrorV = false;
	private modeBeforeSlideshow: ViewerMode | null = null;

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
		this.documentStorage.onLoading((percentage) => {
			uiStore.getState().setStorageProgress(percentage);
		});
		this.documentStorage.onLoaded((doc) => {
			this.newDocument(doc);
		});
		this.documentStorage.onUpdated(() => {
			const titles = this.documentStorage.getTitles();
			uiStore.getState().setStorageTitles(titles);
			if (this.findSavedFileIndex(this.selectedSavedFileId) === -1) {
				this.setSavedFileSelection(titles.length > 0 ? String(titles[0].id) : null);
			}
		});
		this.documentStorage.onError((error) => {
			showNotice(this.documentStorage.getErrorNoticeMessage(error));
		});
	}

	private emitSlideShowSettings(): void {
		const settings = {
			duration: this.slideShowDuration,
			interval: this.slideShowInterval,
			bgColor: this.slideShowBgColor,
			fullscreen: this.slideShowFullscreen,
			mirrorH: this.slideShowMirrorH,
			mirrorV: this.slideShowMirrorV,
		};
		uiStore.getState().setSlideshowSettings(settings);
	}

	private getSlideShowPlaybackSettings(): SlideShowPlaybackSettings {
		return {
			duration: this.slideShowDuration,
			interval: this.slideShowInterval,
		};
	}

	private emitHistoryState(): void {
		if (Viewer.startUpMode != ViewerStartUpMode.VIEW_AND_EDIT) {
			uiStore.getState().setHistory({ canUndo: false, canRedo: false });
			return;
		}
		uiStore.getState().setHistory({
			canUndo: HistoryManager.shared.canUndo,
			canRedo: HistoryManager.shared.canRedo,
		});
	}

	private emitSlideHistoryMutation(rebindSlides: boolean = false): void {
		if (rebindSlides) {
			this.rebindSlideMetaListeners();
		}
		this.emitCurrentSlides();
	}

	private recordSlideHistoryCommand(
		fwd: () => void,
		rev: () => void,
		rebindSlides: boolean = false
	): void {
		HistoryManager.shared
			.record(
				new Command(
					() => {
						fwd();
						this.emitSlideHistoryMutation(rebindSlides);
					},
					() => {
						rev();
						this.emitSlideHistoryMutation(rebindSlides);
					}
				)
			)
			.do();
	}

	private emitEditSelectionState(): void {
		if (
			Viewer.startUpMode != ViewerStartUpMode.VIEW_AND_EDIT ||
			this._mode != ViewerMode.EDIT ||
			!this.editCanvasRuntime
		) {
			layerStore.getState().clearEditState();
			return;
		}
	}

	private emitCurrentEditState(): void {
		if (
			Viewer.startUpMode != ViewerStartUpMode.VIEW_AND_EDIT ||
			this._mode != ViewerMode.EDIT ||
			!this.editCanvasRuntime
		) {
			this.emitEditSelectionState();
			return;
		}
		this.editCanvasRuntime.emitCurrentState();
		this.emitEditSelectionState();
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

	private canEnterEditMode(actionLabel: string): boolean {
		if (!this.ensureAllowed(this.canEdit(), actionLabel)) {
			return false;
		}
		return Viewer.startUpMode == ViewerStartUpMode.VIEW_AND_EDIT;
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

		for (var i: number = 0; i < this.slides.length; i++) {
			var slide: Slide = this.slides[i];
			if (slide.disabled) continue;
			slides.push(slide.clone());
			if (i == this.selectedSlideIndex) startIndex = slides.length - 1;
		}

		return { slides, startIndex };
	}

	private startSlideShowFromSelection(): void {
		const { slides, startIndex } = this.buildSlideShowSlides();
		if (slides.length == 0) return;

		this.slideShowRuntime.setUp(slides, this.getSlideShowPlaybackSettings());
		this.slideShowRuntime.run(startIndex);
	}

	private updateSlideshowPlaybackState(isRun: boolean, isPause: boolean): void {
		uiStore.getState().setSlideshowPlayback({ isRun, isPause });
		if (isRun) {
			if (this._mode !== ViewerMode.SLIDESHOW) {
				this.modeBeforeSlideshow = this._mode ?? ViewerMode.SELECT;
				this.setMode(ViewerMode.SLIDESHOW);
			}
			return;
		}
		if (this._mode === ViewerMode.SLIDESHOW) {
			this.setMode(this.modeBeforeSlideshow ?? ViewerMode.SELECT);
		}
		this.modeBeforeSlideshow = null;
	}

	private setSavedFileSelection(fileId: string | null): void {
		const nextId = fileId == null || fileId === "-1" ? null : String(fileId);
		this.selectedSavedFileId = nextId;
		uiStore.getState().setStorageSelection(nextId);
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
			this.emitCurrentEditState();
		});
		this.emitHistoryState();

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
		this.emitEditSelectionState();
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

	private downloadDocumentImages(targetIndex: number = -1): void {
		const isTransparent = false;
		const { title, width, height, bgColor } = viewerDocumentStore.getState();
		const converter = new SlideToPNGConverter();

		if (targetIndex != -1) {
			const slide = this.slides[targetIndex];
			if (!slide) {
				throw new Error("invalid index.");
			}
			const canvas = converter.slide2canvas(
				slide,
				width,
				height,
				1,
				isTransparent ? undefined : bgColor
			);
			DataUtil.downloadBlob(
				DataUtil.dataURItoBlob(canvas.toDataURL()),
				title + "_" + (targetIndex + 1) + ".png"
			);
			return;
		}

		const zip = new JSZip();
		this.slides.forEach((slide, index) => {
			if (slide.disabled) return;
			const canvas = converter.slide2canvas(
				slide,
				width,
				height,
				1,
				isTransparent ? undefined : bgColor
			);
			zip.file(title + "_" + (index + 1) + ".png", DataUtil.dataURItoBlob(canvas.toDataURL()));
		});
		zip.generateAsync({ type: "blob", compression: "DEFLATE" }).then((blob) => {
			DataUtil.downloadBlob(blob, title + ".zip");
		});
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
				this.updateSlideshowPlaybackState(isRun, isPause);
			},
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
		Viewer.shared = this;
		Viewer.startUpMode = startUpMode;

		this.initializeRuntime(startUpMode);
		this.initializeRuntimes(startUpMode);
		this.initializeBindings();

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
		this.slideShowBgColor = this.viewerDocument.bgColor;
		this.slideShowRuntime.fullscreen = this.slideShowFullscreen;
		this.slideShowRuntime.mirrorH = this.slideShowMirrorH;
		this.slideShowRuntime.mirrorV = this.slideShowMirrorV;
		this.bindViewerDocument(this.viewerDocument, slidesToBind);
		this.IsDocumentModified = false;
		this.emitHistoryState();
		this.emitEditSelectionState();
		this.emitSlideShowSettings();
		this.rebindSlideMetaListeners();
		uiStore.getState().setStorageTitles(this.documentStorage.getTitles());
		const titles = this.documentStorage.getTitles();
		const currentSelectionExists = this.findSavedFileIndex(this.selectedSavedFileId) !== -1;
		if (currentSelectionExists) {
			this.setSavedFileSelection(this.selectedSavedFileId);
		} else {
			this.setSavedFileSelection(titles.length > 0 ? String(titles[0].id) : null);
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
		this.emitEditSelectionState();
	}

	public commandNewSlide(): void {
		if (!this.ensureAllowed(this.canEdit(), "スライド追加")) return;
		const { width, height } = viewerDocumentStore.getState();
		const slide = createSlide(width, height);
		const index = this.slides.length;
		const previousLastSlide = this.slides[index - 1] ?? null;
		const previousLastJoining = previousLastSlide?.joining ?? false;
		this.recordSlideHistoryCommand(
			() => {
				if (previousLastSlide) {
					previousLastSlide.joining = false;
				}
				this.addSlide(slide, index);
				this.selectSlideInstance(slide);
			},
			() => {
				this.removeSlide(slide, false);
				if (previousLastSlide) {
					previousLastSlide.joining = previousLastJoining;
					this.selectSlideInstance(previousLastSlide);
				}
			},
			true
		);
	}

	public commandCloneSelectedSlide(): void {
		if (!this.ensureAllowed(this.canEdit(), "スライド複製")) return;
		const sourceSlide = this.selectedSlide;
		if (!sourceSlide) return;
		const clonedSlide = sourceSlide.clone();
		const sourceJoining = sourceSlide.joining;
		this.recordSlideHistoryCommand(
			() => {
				const sourceIndex = this.slides.indexOf(sourceSlide);
				if (sourceIndex === -1) return;
				sourceSlide.joining = true;
				this.addSlide(clonedSlide, sourceIndex + 1);
				this.selectSlideInstance(clonedSlide);
			},
			() => {
				this.removeSlide(clonedSlide, false);
				sourceSlide.joining = sourceJoining;
				this.selectSlideInstance(sourceSlide);
			},
			true
		);
	}

	public commandAddImageSlide(imageId: string, toIndex: number = -1): void {
		if (!this.ensureAllowed(this.canEdit(), "画像スライド追加")) return;
		if (!imageId || !ImageManager.shared.getImagePropsById(imageId)) return;

		const layer = createImageLayer(imageId);
		if (layer.originHeight > layer.originWidth * 1.2) {
			layer.rotation -= 90;
		}
		const { width, height } = viewerDocumentStore.getState();
		const slide = createSlide(width, height, [layer]);
		slide.fitLayer(layer);
		const insertIndex = Number.isInteger(toIndex)
			? Math.max(0, Math.min(this.slides.length, toIndex))
			: -1;

		this.recordSlideHistoryCommand(
			() => {
				this.addSlide(slide, insertIndex);
				this.selectSlideInstance(slide);
			},
			() => {
				this.removeSlide(slide, false);
			},
			true
		);
	}

	public commandDeleteSelectedSlide(): void {
		if (!this.ensureAllowed(this.canEdit(), "スライド削除")) return;
		const slide = this.selectedSlide;
		if (!slide) return;
		const index = this.slides.indexOf(slide);
		this.recordSlideHistoryCommand(
			() => {
				this.selectSlideInstance(slide);
				this.removeSlide(slide, false);
			},
			() => {
				this.addSlide(slide, index);
				this.selectSlideInstance(slide);
			},
			true
		);
	}

	public commandMoveSelectedSlideBackward(): void {
		if (!this.ensureAllowed(this.canEdit(), "スライド並び替え")) return;
		const slide = this.selectedSlide;
		if (!slide || this.slides.indexOf(slide) <= 0) return;
		this.recordSlideHistoryCommand(
			() => {
				this.selectSlideInstance(slide);
				this.moveSelectedSlideByOffset(-1);
			},
			() => {
				this.selectSlideInstance(slide);
				this.moveSelectedSlideByOffset(1);
			}
		);
	}

	public commandMoveSelectedSlideForward(): void {
		if (!this.ensureAllowed(this.canEdit(), "スライド並び替え")) return;
		const slide = this.selectedSlide;
		const index = slide ? this.slides.indexOf(slide) : -1;
		if (!slide || index === -1 || index >= this.slides.length - 1) return;
		this.recordSlideHistoryCommand(
			() => {
				this.selectSlideInstance(slide);
				this.moveSelectedSlideByOffset(1);
			},
			() => {
				this.selectSlideInstance(slide);
				this.moveSelectedSlideByOffset(-1);
			}
		);
	}

	public commandMoveSelectedSlideToIndex(toIndex: number): void {
		if (!this.ensureAllowed(this.canEdit(), "スライド並び替え")) return;
		const slide = this.selectedSlide;
		const fromIndex = slide ? this.slides.indexOf(slide) : -1;
		if (!slide || fromIndex === -1 || !Number.isInteger(toIndex)) return;
		const clampedToIndex = Math.max(0, Math.min(this.slides.length - 1, toIndex));
		if (fromIndex === clampedToIndex) return;

		this.recordSlideHistoryCommand(
			() => {
				this.selectSlideInstance(slide);
				this.moveSelectedSlideToIndex(clampedToIndex);
			},
			() => {
				this.selectSlideInstance(slide);
				this.moveSelectedSlideToIndex(fromIndex);
			}
		);
	}

	public commandToggleSelectedSlideJoining(): void {
		if (!this.ensureAllowed(this.canEdit(), "スライド結合切替")) return;
		const slide = this.selectedSlide;
		if (!slide) return;
		const oldJoining = slide.joining;
		this.recordSlideHistoryCommand(
			() => {
				slide.joining = !oldJoining;
			},
			() => {
				slide.joining = oldJoining;
			}
		);
	}

	public commandToggleAllSlidesJoining(): void {
		if (!this.ensureAllowed(this.canEdit(), "全スライド結合切替")) return;
		const slides = this.slides;
		if (slides.length === 0) return;
		const previousStates = slides.map((slide) => ({
			slide,
			joining: slide.joining,
			durationRatio: slide.durationRatio,
		}));
		const nextJoining = !slides.every((slide) => slide.joining);
		this.recordSlideHistoryCommand(
			() => {
				previousStates.forEach(({ slide }) => {
					slide.joining = nextJoining;
					slide.durationRatio = 1;
				});
			},
			() => {
				previousStates.forEach(({ slide, joining, durationRatio }) => {
					slide.joining = joining;
					slide.durationRatio = durationRatio;
				});
			}
		);
	}

	public commandUnjoinAllSlides(): void {
		if (!this.ensureAllowed(this.canEdit(), "全スライド結合解除")) return;
		const slides = this.slides;
		if (!slides.some((slide) => slide.joining || slide.durationRatio !== 1)) return;
		const previousStates = slides.map((slide) => ({
			slide,
			joining: slide.joining,
			durationRatio: slide.durationRatio,
		}));
		this.recordSlideHistoryCommand(
			() => {
				previousStates.forEach(({ slide }) => {
					slide.joining = false;
					slide.durationRatio = 1;
				});
			},
			() => {
				previousStates.forEach(({ slide, joining, durationRatio }) => {
					slide.joining = joining;
					slide.durationRatio = durationRatio;
				});
			}
		);
	}

	public commandToggleSelectedSlideDisabled(): void {
		if (!this.ensureAllowed(this.canEdit(), "スライド有効切替")) return;
		const slide = this.selectedSlide;
		if (!slide) return;
		const oldDisabled = slide.disabled;
		this.recordSlideHistoryCommand(
			() => {
				slide.disabled = !oldDisabled;
			},
			() => {
				slide.disabled = oldDisabled;
			}
		);
	}

	public commandEnableAllSlides(): void {
		if (!this.ensureAllowed(this.canEdit(), "全スライド有効化")) return;
		if (!this.slides.some((slide) => slide.disabled)) return;
		const previousStates = this.slides.map((slide) => ({ slide, disabled: slide.disabled }));
		this.recordSlideHistoryCommand(
			() => {
				previousStates.forEach(({ slide }) => {
					slide.disabled = false;
				});
			},
			() => {
				previousStates.forEach(({ slide, disabled }) => {
					slide.disabled = disabled;
				});
			}
		);
	}

	public commandDisableAllSlides(): void {
		if (!this.ensureAllowed(this.canEdit(), "全スライド無効化")) return;
		if (!this.slides.some((slide) => !slide.disabled)) return;
		const previousStates = this.slides.map((slide) => ({ slide, disabled: slide.disabled }));
		this.recordSlideHistoryCommand(
			() => {
				previousStates.forEach(({ slide }) => {
					slide.disabled = true;
				});
			},
			() => {
				previousStates.forEach(({ slide, disabled }) => {
					slide.disabled = disabled;
				});
			}
		);
	}

	public commandEnableOnlySelectedSlide(): void {
		if (!this.ensureAllowed(this.canEdit(), "選択スライドのみ有効化")) return;
		const selectedSlide = this.selectedSlide;
		if (!selectedSlide) return;
		const hasChange = this.slides.some((slide) => slide.disabled !== (slide !== selectedSlide));
		if (!hasChange) return;
		const previousStates = this.slides.map((slide) => ({ slide, disabled: slide.disabled }));
		this.recordSlideHistoryCommand(
			() => {
				previousStates.forEach(({ slide }) => {
					slide.disabled = slide !== selectedSlide;
				});
			},
			() => {
				previousStates.forEach(({ slide, disabled }) => {
					slide.disabled = disabled;
				});
			}
		);
	}

	public commandDeleteDisabledSlides(): void {
		if (!this.ensureAllowed(this.canEdit(), "無効スライド削除")) return;
		const disabledSlides = this.slides
			.map((slide, index) => ({ slide, index }))
			.filter(({ slide }) => slide.disabled);
		if (disabledSlides.length === 0) return;
		const selectedSlide = this.selectedSlide;
		this.recordSlideHistoryCommand(
			() => {
				disabledSlides.forEach(({ slide }) => {
					this.removeSlide(slide, false);
				});
			},
			() => {
				disabledSlides.forEach(({ slide, index }) => {
					this.addSlide(slide, index);
				});
				if (selectedSlide) {
					this.selectSlideInstance(selectedSlide);
				}
			},
			true
		);
	}

	public commandSetSelectedSlideDurationRatio(ratio: number): void {
		if (!this.ensureAllowed(this.canEdit(), "スライド長変更")) return;
		if (!isFinite(ratio) || ratio <= 0) return;
		const slide = this.selectedSlide;
		if (!slide) return;
		const oldRatio = slide.durationRatio;
		const nextRatio = Math.max(ratio, 0.2);
		if (oldRatio === nextRatio) return;
		this.recordSlideHistoryCommand(
			() => {
				slide.durationRatio = nextRatio;
			},
			() => {
				slide.durationRatio = oldRatio;
			}
		);
	}

	private emitCurrentSlides(syncLayers: boolean = false): void {
		if (syncLayers) {
			slideStore.getState().notifyLayersChanged();
			return;
		}
		slideStore.getState().notifySlidesChanged();
	}

	private rebindSlideMetaListeners(): void {
		for (const unsub of this._slideMetaUnsubscribers) {
			unsub();
		}
		this._slideMetaUnsubscribers = [];
		if (!this.viewerDocument) return;
		const handler = () => {
			this.emitCurrentSlides();
		};
		for (const slide of this.slides) {
			slide.addEventListener(PropertyEvent.UPDATE, handler);
			this._slideMetaUnsubscribers.push(() =>
				slide.removeEventListener(PropertyEvent.UPDATE, handler)
			);
		}
	}

	public commandSelectPreviousSlide(): void {
		this.selectSlideByOffset(-1);
	}

	public commandSelectNextSlide(): void {
		this.selectSlideByOffset(1);
	}

	public commandSelectSlideByIndex(index: number): void {
		this.selectSlideByIndex(index);
	}

	public commandEnterSelectMode(): void {
		this.setMode(ViewerMode.SELECT);
	}

	public commandCloseEditMode(): void {
		this.setMode(ViewerMode.SELECT);
		setTimeout(() => {
			this.editCanvasRuntime.initialize();
			this.emitEditSelectionState();
		}, 301);
	}

	public commandEnterEditMode(): void {
		if (!this.canEnterEditMode("編集モード切替")) {
			return;
		}
		if (!this.selectedSlide) {
			showNotice("編集対象のスライドを選択してください。");
			return;
		}
		this.setMode(ViewerMode.EDIT);
		this.editCanvasRuntime.setSlide(this.selectedSlide);
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
		this.downloadDocumentImages();
	}

	public commandDownloadSelectedSlide(): void {
		if (!this.ensureAllowed(this.canExport(), "画像出力")) return;
		if (this.selectedSlideIndex === -1 && !this.hasEnabledSlides()) {
			showNotice("有効なスライドがありません。");
			return;
		}
		this.downloadDocumentImages(this.selectedSlideIndex);
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
		viewerDocumentStore.getState().setDocumentMeta({ bgColor: color });
		this.emitSlideShowSettings();
	}

	public commandSetFullscreen(enabled: boolean): void {
		this.slideShowFullscreen = enabled;
		this.slideShowRuntime.fullscreen = enabled;
		this.emitSlideShowSettings();
	}

	public commandSetMirrorH(enabled: boolean): void {
		this.slideShowMirrorH = enabled;
		this.slideShowRuntime.mirrorH = enabled;
		this.emitSlideShowSettings();
	}

	public commandSetMirrorV(enabled: boolean): void {
		this.slideShowMirrorV = enabled;
		this.slideShowRuntime.mirrorV = enabled;
		this.emitSlideShowSettings();
	}

	public commandStartSlideshow(): void {
		this.startSlideShowFromSelection();
	}

	public commandStopSlideshow(): void {
		this.slideShowRuntime.close();
	}

	public commandToggleSlideshowPause(): void {
		this.slideShowRuntime.togglePause();
	}

	public commandShowPreviousSlide(): void {
		this.slideShowRuntime.showPrevious();
	}

	public commandShowNextSlide(): void {
		this.slideShowRuntime.showNext();
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
		this.runEditSelectionOperation("レイヤー回転", () =>
			this.editCanvasRuntime.rotateSelectedLayer(-90)
		);
	}

	public commandRotateSelectedLayerRight(): void {
		this.runEditSelectionOperation("レイヤー回転", () =>
			this.editCanvasRuntime.rotateSelectedLayer(90)
		);
	}

	public commandToggleSelectedLayerMirrorH(): void {
		this.runEditSelectionOperation("水平反転", () =>
			this.editCanvasRuntime.toggleSelectedLayerMirrorH()
		);
	}

	public commandToggleSelectedLayerMirrorV(): void {
		this.runEditSelectionOperation("垂直反転", () =>
			this.editCanvasRuntime.toggleSelectedLayerMirrorV()
		);
	}

	public commandToggleSelectedLayerIsText(): void {
		this.runEditSelectionOperation("テキスト切替", () =>
			this.editCanvasRuntime.toggleSelectedLayerIsText()
		);
	}

	public commandSpreadSelectedLayer(confirmed = false): void {
		if (!this.canRunEditOperations("全スライド展開")) return;
		const request = this.editCanvasRuntime.getSelectedLayerRemovalRequest();
		if (!request) {
			showNotice("レイヤーを選択してください。");
			this.emitEditSelectionState();
			return;
		}
		if (!confirmed && ViewerBridge.hasListeners("spreadLayerRequested")) {
			ViewerBridge.emit("spreadLayerRequested", { layerName: request.layerName });
			return;
		}
		if (!confirmed) return;
		const ok = this.editCanvasRuntime.spreadSelectedLayer();
		if (!ok) {
			showNotice("レイヤーを選択してください。");
		}
	}

	public commandFitSelectedLayer(): void {
		this.runEditSelectionOperation("フィット", () => this.editCanvasRuntime.fitSelectedLayer());
	}

	public commandArrangeSelectedLayerTop(): void {
		this.runEditSelectionOperation("上揃え", () =>
			this.editCanvasRuntime.arrangeSelectedLayer(Direction.TOP)
		);
	}

	public commandArrangeSelectedLayerRight(): void {
		this.runEditSelectionOperation("右揃え", () =>
			this.editCanvasRuntime.arrangeSelectedLayer(Direction.RIGHT)
		);
	}

	public commandArrangeSelectedLayerBottom(): void {
		this.runEditSelectionOperation("下揃え", () =>
			this.editCanvasRuntime.arrangeSelectedLayer(Direction.BOTTOM)
		);
	}

	public commandArrangeSelectedLayerLeft(): void {
		this.runEditSelectionOperation("左揃え", () =>
			this.editCanvasRuntime.arrangeSelectedLayer(Direction.LEFT)
		);
	}

	public commandMoveSelectedLayerUp(): void {
		this.runEditSelectionOperation("レイヤー順序変更", () =>
			this.editCanvasRuntime.swapSelectedLayer(1)
		);
	}

	public commandMoveSelectedLayerDown(): void {
		this.runEditSelectionOperation("レイヤー順序変更", () =>
			this.editCanvasRuntime.swapSelectedLayer(-1)
		);
	}

	public commandMoveSelectedLayerToTop(): void {
		this.runEditSelectionOperation("最前面へ移動", () =>
			this.editCanvasRuntime.moveSelectedLayerToTop()
		);
	}

	public commandMoveSelectedLayerToBottom(): void {
		this.runEditSelectionOperation("最背面へ移動", () =>
			this.editCanvasRuntime.moveSelectedLayerToBottom()
		);
	}

	public commandMoveSelectedLayerToIndex(toIndex: number): void {
		this.runEditSelectionOperation("レイヤー順序変更", () =>
			this.editCanvasRuntime.moveSelectedLayerToIndex(toIndex)
		);
	}

	public commandCopySelectedLayer(): void {
		this.runEditSelectionOperation("レイヤーコピー", () =>
			this.editCanvasRuntime.copySelectedLayer()
		);
	}

	public commandCutSelectedLayer(): void {
		this.runEditSelectionOperation("レイヤーカット", () =>
			this.editCanvasRuntime.cutSelectedLayer()
		);
	}

	public commandPasteLayer(): void {
		this.runEditOperation("レイヤー貼り付け", () => {
			this.editCanvasRuntime.pasteLayer();
		});
	}

	public commandAddTextLayer(text: string): void {
		this.runEditOperation("テキストレイヤー追加", () => {
			this.editCanvasRuntime.addTextLayer(text);
		});
	}

	public commandRequestTextLayerInput(): void {
		if (!this.canRunEditOperations("テキストレイヤー追加")) return;
		if (ViewerBridge.hasListeners("textLayerInputRequested")) {
			ViewerBridge.emit("textLayerInputRequested", { open: true });
		}
	}

	public commandCopySelectedLayerTransform(): void {
		this.runEditSelectionOperation("変形コピー", () =>
			this.editCanvasRuntime.copySelectedLayerTransform()
		);
	}

	public commandPasteLayerTransform(): void {
		this.runEditSelectionOperation("変形貼り付け", () =>
			this.editCanvasRuntime.pasteLayerTransform()
		);
	}

	public commandRemoveSelectedLayer(confirmedSharedRemoval = false): void {
		if (!this.canRunEditOperations("レイヤー削除")) {
			return;
		}
		const request = this.editCanvasRuntime.getSelectedLayerRemovalRequest();
		if (!request) {
			showNotice("レイヤーを選択してください。");
			this.emitEditSelectionState();
			return;
		}
		if (
			request.shared &&
			!confirmedSharedRemoval &&
			ViewerBridge.hasListeners("sharedLayerRemovalRequested")
		) {
			ViewerBridge.emit("sharedLayerRemovalRequested", { layerName: request.layerName });
			return;
		}
		this.editCanvasRuntime.removeSelectedLayer(confirmedSharedRemoval);
		this.emitEditSelectionState();
	}

	public commandNudgeSelectedLayerLeft(): void {
		this.runEditSelectionOperationSilently("レイヤー移動", () =>
			this.editCanvasRuntime.nudgeSelectedLayer(-10, 0)
		);
	}

	public commandNudgeSelectedLayerRight(): void {
		this.runEditSelectionOperationSilently("レイヤー移動", () =>
			this.editCanvasRuntime.nudgeSelectedLayer(10, 0)
		);
	}

	public commandNudgeSelectedLayerUp(): void {
		this.runEditSelectionOperationSilently("レイヤー移動", () =>
			this.editCanvasRuntime.nudgeSelectedLayer(0, -10)
		);
	}

	public commandNudgeSelectedLayerDown(): void {
		this.runEditSelectionOperationSilently("レイヤー移動", () =>
			this.editCanvasRuntime.nudgeSelectedLayer(0, 10)
		);
	}

	public commandScaleSelectedLayerUp(): void {
		this.runEditSelectionOperationSilently("レイヤー拡大縮小", () =>
			this.editCanvasRuntime.scaleSelectedLayer(1.1)
		);
	}

	public commandScaleSelectedLayerDown(): void {
		this.runEditSelectionOperationSilently("レイヤー拡大縮小", () =>
			this.editCanvasRuntime.scaleSelectedLayer(1 / 1.1)
		);
	}

	public commandAdjustSelectedLayerRotationLeft(): void {
		this.runEditSelectionOperationSilently("レイヤー回転", () =>
			this.editCanvasRuntime.adjustSelectedLayerRotation(-5)
		);
	}

	public commandAdjustSelectedLayerRotationRight(): void {
		this.runEditSelectionOperationSilently("レイヤー回転", () =>
			this.editCanvasRuntime.adjustSelectedLayerRotation(5)
		);
	}

	public commandResetSelectedLayerRotation(): void {
		this.runEditSelectionOperationSilently("レイヤー回転", () =>
			this.editCanvasRuntime.resetSelectedLayerRotation()
		);
	}

	public commandDecreaseSelectedLayerOpacity(): void {
		this.runEditSelectionOperationSilently("透明度変更", () =>
			this.editCanvasRuntime.adjustSelectedLayerOpacity(-0.05)
		);
	}

	public commandIncreaseSelectedLayerOpacity(): void {
		this.runEditSelectionOperationSilently("透明度変更", () =>
			this.editCanvasRuntime.adjustSelectedLayerOpacity(0.05)
		);
	}

	public commandResetSelectedLayerOpacity(): void {
		this.runEditSelectionOperationSilently("透明度変更", () =>
			this.editCanvasRuntime.resetSelectedLayerOpacity()
		);
	}

	public commandSetSelectedLayerPosition(x: number, y: number): void {
		this.runEditSelectionOperationSilently("位置変更", () =>
			this.editCanvasRuntime.setSelectedLayerPosition(x, y)
		);
	}

	public commandSetSelectedLayerScale(scale: number): void {
		this.runEditSelectionOperationSilently("拡大縮小", () =>
			this.editCanvasRuntime.setSelectedLayerScale(scale)
		);
	}

	public commandSetSelectedLayerRotation(rotation: number): void {
		this.runEditSelectionOperationSilently("回転変更", () =>
			this.editCanvasRuntime.setSelectedLayerRotation(rotation)
		);
	}

	public commandSetSelectedLayerOpacity(opacity: number): void {
		this.runEditSelectionOperationSilently("透明度変更", () =>
			this.editCanvasRuntime.setSelectedLayerOpacity(opacity)
		);
	}

	public commandSetSelectedImageClip(
		top: number,
		right: number,
		bottom: number,
		left: number
	): void {
		this.runEditSelectionOperationSilently("クリップ変更", () =>
			this.editCanvasRuntime.setSelectedImageClip(top, right, bottom, left)
		);
	}

	public commandResetSelectedImageClip(): void {
		this.runEditSelectionOperationSilently("クリップ変更", () =>
			this.editCanvasRuntime.resetSelectedImageClip()
		);
	}

	public commandSelectEditLayerByIndex(index: number): void {
		if (!this.canRunEditOperations("レイヤー選択")) {
			return;
		}
		if (!this.editCanvasRuntime.selectEditLayerByIndex(index)) {
			showNotice("対象レイヤーが見つかりません。");
		}
		this.emitEditSelectionState();
	}

	public commandToggleSelectedLayerVisible(): void {
		this.runEditSelectionOperationSilently("表示切替", () =>
			this.editCanvasRuntime.toggleSelectedLayerVisible()
		);
	}

	public commandToggleSelectedLayerLocked(): void {
		this.runEditSelectionOperationSilently("ロック切替", () =>
			this.editCanvasRuntime.toggleSelectedLayerLocked()
		);
	}

	public commandToggleSelectedLayerShared(): void {
		this.runEditSelectionOperationSilently("共有切替", () =>
			this.editCanvasRuntime.toggleSelectedLayerShared()
		);
	}

	public commandSetSelectedLayerName(name: string): void {
		this.runEditSelectionOperationSilently("レイヤー名変更", () =>
			this.editCanvasRuntime.setSelectedLayerName(name)
		);
	}

	public commandSetSelectedLayerText(text: string): void {
		this.runEditSelectionOperationSilently("テキスト変更", () =>
			this.editCanvasRuntime.setSelectedLayerText(text)
		);
	}

	public commandZoomInCanvas(): void {
		this.runEditOperation("キャンバス拡大", () => {
			this.editCanvasRuntime.zoomInCanvas();
		});
	}

	public commandZoomOutCanvas(): void {
		this.runEditOperation("キャンバス縮小", () => {
			this.editCanvasRuntime.zoomOutCanvas();
		});
	}

	public commandResetCanvasZoom(): void {
		this.runEditOperation("キャンバス倍率初期化", () => {
			this.editCanvasRuntime.resetCanvasZoom();
		});
	}

	public commandSetCanvasScale(scale: number): void {
		if (!isFinite(scale) || scale <= 0) {
			return;
		}
		this.runEditOperation("キャンバス倍率変更", () => {
			this.editCanvasRuntime.setCanvasScale(scale);
		});
	}

	public commandToggleRectEdit(): void {
		this.runEditOperation("同時編集切替", () => {
			this.editCanvasRuntime.toggleRectEdit();
		});
	}

	public commandSetRectEdit(enabled: boolean): void {
		this.runEditOperation("同時編集設定", () => {
			this.editCanvasRuntime.setRectEdit(Boolean(enabled));
		});
	}

	public async commandReplaceSelectedImage(file: File, applyAllReferences: boolean): Promise<void> {
		if (!this.canRunEditOperations("画像差し替え")) {
			return;
		}
		if (!file) {
			return;
		}
		const ok = await this.editCanvasRuntime.replaceSelectedImage(file, applyAllReferences);
		if (!ok) {
			showNotice("画像レイヤーを選択してください。");
		}
		this.emitEditSelectionState();
	}

	public commandDownloadSelectedImage(): void {
		if (!this.ensureAllowed(this.canExport(), "画像ダウンロード")) return;
		this.runEditSelectionOperation("画像ダウンロード", () =>
			this.editCanvasRuntime.downloadSelectedImage()
		);
	}

	public commandDeleteImageById(imageId: string, confirmed = false): void {
		if (!this.ensureAllowed(this.canEdit(), "画像削除")) return;
		if (!imageId) return;
		if (!confirmed && ViewerBridge.hasListeners("imageDeleteRequested")) {
			const imageProps = ImageManager.shared.getImagePropsById(imageId);
			ViewerBridge.emit("imageDeleteRequested", {
				imageId,
				name: imageProps?.name || imageId,
			});
			return;
		}
		if (!confirmed) return;
		ImageManager.shared.deleteImageById(imageId);
		this.IsDocumentModified = true;
		this.emitCurrentSlides(true);
		this.emitCurrentEditState();
		this.emitHistoryState();
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
