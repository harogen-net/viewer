import { PropertyEvent } from "../events/PropertyEvent";
import type { Slide } from "../model/Slide";
import { createLayerActions } from "../state/layerActions";
import { layerStore } from "../state/layerStore";
import { createSlideActions } from "../state/slideActions";
import { slideStore, type SlideCommandsUseCase } from "../state/slideStore";
import { uiStore } from "../state/uiStore";
import { createViewerDocumentActions } from "../state/viewerDocumentActions";
import { viewerDocumentStore } from "../state/viewerDocumentStore";
import { createStorageAdapter } from "../storage/createStorageAdapter";
import { DocumentStorageUseCase } from "../useCase/DocumentStorageUseCase";
import {
    createPermissionUseCase,
    type PermissionUseCase,
} from "../useCase/PermissionUseCase";
import {
    createSavedFileNavigationUseCase,
    type SavedFileNavigationUseCase,
} from "../useCase/SavedFileNavigationUseCase";
import {
    createSlideHistoryUseCase,
    type SlideHistoryUseCase,
} from "../useCase/SlideHistoryUseCase";
import { createSlideshowUseCase, type SlideshowUseCase } from "../useCase/SlideshowUseCase";
import { HistoryManager } from "../utils/HistoryManager";
import { ImageManager } from "../utils/ImageManager";
import { EditCanvasRuntime } from "./EditCanvasRuntime";
import type { FeatureGate } from "./featureGate";
import { createModeController, type ModeController } from "./ModeController";
import { mountSlideshowShell, type SlideshowShellMount } from "./mountSlideshowShell";
import { showNotice } from "./notice";
import { getSaveFormat } from "./reactDomRegistry";
import { type SlideShowRuntimeHandle } from "./SlideshowShell";
import { ViewerStartUpMode } from "./viewerMode";

/**
 * R3.13: Viewer 起動オーケストレーション。
 *
 * runtime 生成・store 初期化・deps 注入・bootstrap 呼び出しの流れを 1 関数に集約する。
 * Viewer クラスは本関数を呼び結果を保持するだけのコンテナへ縮小される。
 */

export type BootstrapDeps = {
	obj: HTMLElement;
	startUpMode: ViewerStartUpMode;
	featureGate?: FeatureGate;
	getIsDocumentModified: () => boolean;
	setIsDocumentModified: (value: boolean) => void;
	isStrictMode: () => boolean;
};

export type BootstrapResult = {
	editCanvasRuntime: EditCanvasRuntime | undefined;
	slideShowRuntime: SlideShowRuntimeHandle;
	slideshowShellMount: SlideshowShellMount;
	slideshowUseCase: SlideshowUseCase;
	documentStorage: DocumentStorageUseCase;
	savedFileNav: SavedFileNavigationUseCase;
	permission: PermissionUseCase;
	modeController: ModeController;
	slideHistory: SlideHistoryUseCase;
	slideCommands: SlideCommandsUseCase;
};

export function bootstrapViewer(deps: BootstrapDeps): BootstrapResult {
	ImageManager.init();

	const permission = createPermissionUseCase({
		getFeatureGate: () => deps.featureGate,
		getStartUpMode: () => deps.startUpMode,
		getIsDocumentModified: deps.getIsDocumentModified,
		getIsStrictMode: deps.isStrictMode,
		notice: showNotice,
	});

	let editCanvasRuntime: EditCanvasRuntime | undefined;
	let slideshowUseCase: SlideshowUseCase | undefined;

	const slideShowHost = document.createElement("div");
	deps.obj.appendChild(slideShowHost);
	const slideshowShellMount = mountSlideshowShell(slideShowHost, {
		onPlaybackChanged: ({ isRun, isPause }) => {
			slideshowUseCase?.handlePlaybackChanged(isRun, isPause);
		},
	});
	const slideShowRuntime: SlideShowRuntimeHandle = slideshowShellMount.handle;

	const modeController = createModeController({
		obj: deps.obj,
		getStartUpMode: () => deps.startUpMode,
		getEditCanvasRuntime: () => editCanvasRuntime,
		permission,
	});

	const slideHistory = createSlideHistoryUseCase({
		getStartUpMode: () => deps.startUpMode,
		rebindSlideMetaListeners: () =>
			viewerDocumentStore.getState().commands?.rebindSlideMetaListeners(),
	});

	slideshowUseCase = createSlideshowUseCase({
		runtime: slideShowRuntime,
		getSlides: () => slideStore.getState().slides as Slide[],
		getSelectedSlideIndex: () => slideStore.getState().selectedIndex,
		getMode: () => modeController.getMode(),
		setMode: (mode) => modeController.setMode(mode),
	});

	const documentStorage = new DocumentStorageUseCase(createStorageAdapter(), deps.featureGate);
	const savedFileNav = createSavedFileNavigationUseCase(documentStorage);
	documentStorage.onLoading((percentage) => {
		uiStore.getState().setStorageProgress(percentage);
	});
	documentStorage.onLoaded((doc) => {
		viewerDocumentStore.getState().commands?.handleLoadedDocument(doc);
	});
	documentStorage.onUpdated(() => {
		const titles = documentStorage.getTitles();
		uiStore.getState().setStorageTitles(titles);
		if (savedFileNav.findIndex(savedFileNav.getSelectedId()) === -1) {
			savedFileNav.setSelection(titles.length > 0 ? String(titles[0].id) : null);
		}
	});
	documentStorage.onError((error) => {
		showNotice(documentStorage.getErrorNoticeMessage(error));
	});

	if (deps.startUpMode === ViewerStartUpMode.VIEW_AND_EDIT) {
		HistoryManager.init();
		HistoryManager.shared.addEventListener(PropertyEvent.UPDATE, (_pe: PropertyEvent) => {
			deps.setIsDocumentModified(HistoryManager.shared.canUndo);
			slideHistory.publishHistoryState();
			layerStore.getState().commands?.publishCurrentEditState();
		});
		slideHistory.publishHistoryState();

		editCanvasRuntime = new EditCanvasRuntime(deps.obj.querySelector(".canvas") as HTMLElement);
	}

	const slideCommands = createSlideActions({
		getViewerDocumentSize: () => {
			const { width, height } = viewerDocumentStore.getState();
			return { width, height };
		},
		ensureAllowed: (canExecute, label) => permission.ensureAllowed(canExecute, label),
		canEdit: () => permission.canEdit(),
		canEnterEditMode: (label) => modeController.canEnterEditMode(label),
		slideHistory,
		getMode: () => modeController.getMode(),
		setMode: (mode) => modeController.setMode(mode),
		getEditCanvasRuntime: () => editCanvasRuntime,
		notice: showNotice,
		imageManager: ImageManager.shared,
	});

	layerStore.getState().bindCommands(
		createLayerActions({
			getStartUpMode: () => deps.startUpMode,
			getMode: () => modeController.getMode(),
			getEditCanvasRuntime: () => editCanvasRuntime,
			canEdit: () => permission.canEdit(),
			canExport: () => permission.canExport(),
			ensureAllowed: (canExecute, label) => permission.ensureAllowed(canExecute, label),
			setDocumentModified: deps.setIsDocumentModified,
			slideHistory,
			notice: showNotice,
			historyManager: HistoryManager.shared,
			imageManager: ImageManager.shared,
		})
	);
	slideStore.getState().bindCommands(slideCommands);
	viewerDocumentStore.getState().bindCommands(
		createViewerDocumentActions({
			documentStorage,
			savedFileNav,
			slideshow: slideshowUseCase,
			slideHistory,
			getEditCanvasRuntime: () => editCanvasRuntime,
			getMode: () => modeController.getMode(),
			setMode: (mode) => modeController.setMode(mode),
			getStartUpMode: () => deps.startUpMode,
			getFeatureGate: () => permission.getPolicy(),
			canEdit: () => permission.canEdit(),
			canSave: () => permission.canSave(),
			canExport: () => permission.canExport(),
			canImport: () => permission.canImport(),
			canProceedWithDiscard: () => permission.canProceedWithDiscard(),
			ensureAllowed: (canExecute, label) => permission.ensureAllowed(canExecute, label),
			shouldOverrideSave: () => false,
			isStrictMode: deps.isStrictMode,
			getIsDocumentModified: deps.getIsDocumentModified,
			setIsDocumentModified: deps.setIsDocumentModified,
			notice: showNotice,
			historyManager: HistoryManager.shared,
			imageManager: ImageManager.shared,
			getSaveFormat,
		})
	);

	viewerDocumentStore.getState().commands?.bootstrap();

	return {
		editCanvasRuntime,
		slideShowRuntime,
		slideshowShellMount,
		slideshowUseCase,
		documentStorage,
		savedFileNav,
		permission,
		modeController,
		slideHistory,
		slideCommands,
	};
}
