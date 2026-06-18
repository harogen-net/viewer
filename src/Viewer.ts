import $ from "jquery";
import { setActiveViewer } from "./bridge/activeViewer";
import { PropertyEvent } from "./events/PropertyEvent";
import type { Slide } from "./model/Slide";
import { EditCanvasRuntime } from "./runtime/EditCanvasRuntime";
import { FeatureGate } from "./runtime/featureGate";
import { showNotice } from "./runtime/notice";
import { getSaveFormat } from "./runtime/reactDomRegistry";
import { SlideShowRuntime } from "./runtime/SlideShowRuntime";
import { ViewerMode, ViewerStartUpMode } from "./runtime/viewerMode";
import { createLayerActions } from "./state/layerActions";
import { layerStore } from "./state/layerStore";
import { createSlideActions } from "./state/slideActions";
import { slideStore, type SlideCommandsUseCase } from "./state/slideStore";
import { uiStore } from "./state/uiStore";
import { createViewerDocumentActions } from "./state/viewerDocumentActions";
import { viewerDocumentStore } from "./state/viewerDocumentStore";
import { createStorageAdapter } from "./storage/createStorageAdapter";
import { DocumentStorageUseCase } from "./useCase/DocumentStorageUseCase";
import {
	createSavedFileNavigationUseCase,
	type SavedFileNavigationUseCase,
} from "./useCase/SavedFileNavigationUseCase";
import {
	createSlideHistoryUseCase,
	type SlideHistoryUseCase,
} from "./useCase/SlideHistoryUseCase";
import { createSlideshowUseCase, type SlideshowUseCase } from "./useCase/SlideshowUseCase";
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
		rebindSlideMetaListeners: () =>
			viewerDocumentStore.getState().commands?.rebindSlideMetaListeners(),
	});
	private slideCommands: SlideCommandsUseCase = createSlideActions({
		getViewerDocumentSize: () => {
			const { width, height } = viewerDocumentStore.getState();
			return { width, height };
		},
		ensureAllowed: (canExecute, label) => this.ensureAllowed(canExecute, label),
		canEdit: () => this.canEdit(),
		canEnterEditMode: (label) => this.canEnterEditMode(label),
		slideHistory: this.slideHistory,
		getMode: () => this._mode,
		setMode: (mode) => this.setMode(mode),
		getEditCanvasRuntime: () => this.editCanvasRuntime,
		notice: showNotice,
		imageManager: ImageManager.shared,
	});

	private _mode: ViewerMode;

	private _isDocumentModified = false;

	get IsDocumentModified(): boolean {
		return this._isDocumentModified;
	}
	set IsDocumentModified(value: boolean) {
		this._isDocumentModified = value;
		uiStore.getState().setModified(value);
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

	private initializeDocumentStorage(): void {
		this.documentStorage = new DocumentStorageUseCase(createStorageAdapter(), this.featureGate);
		this.savedFileNav = createSavedFileNavigationUseCase(this.documentStorage);
		this.documentStorage.onLoading((percentage) => {
			uiStore.getState().setStorageProgress(percentage);
		});
		this.documentStorage.onLoaded((doc) => {
			viewerDocumentStore.getState().commands?.handleLoadedDocument(doc);
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

	private get slides(): Slide[] {
		return slideStore.getState().slides as Slide[];
	}

	private get selectedSlide(): Slide | null {
		return slideStore.getState().selectedSlide;
	}

	private get selectedSlideIndex(): number {
		return slideStore.getState().selectedIndex;
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
		viewerDocumentStore.getState().bindCommands(
			createViewerDocumentActions({
				documentStorage: this.documentStorage,
				savedFileNav: this.savedFileNav,
				slideshow: this.slideshowUseCase,
				slideHistory: this.slideHistory,
				getEditCanvasRuntime: () => this.editCanvasRuntime,
				getMode: () => this._mode,
				setMode: (mode) => this.setMode(mode),
				getStartUpMode: () => Viewer.startUpMode,
				getFeatureGate: () => this.getPermissionPolicy(),
				canEdit: () => this.canEdit(),
				canSave: () => this.canSave(),
				canExport: () => this.canExport(),
				canImport: () => this.canImport(),
				canProceedWithDiscard: () => this.canProceedWithDiscard(),
				ensureAllowed: (canExecute, label) => this.ensureAllowed(canExecute, label),
				shouldOverrideSave: () => false,
				isStrictMode: () => Viewer.isStrictMode,
				getIsDocumentModified: () => this.IsDocumentModified,
				setIsDocumentModified: (value) => {
					this.IsDocumentModified = value;
				},
				notice: showNotice,
				historyManager: HistoryManager.shared,
				imageManager: ImageManager.shared,
				getSaveFormat,
			})
		);

		viewerDocumentStore.getState().commands?.bootstrap();
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
