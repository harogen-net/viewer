import { ViewerBridge } from "../bridge/ViewerBridge";
import { PropertyEvent } from "../events/PropertyEvent";
import { getScreenSlideSize, type Slide } from "../model/Slide";
import { createViewerDocument, type ViewerDocument } from "../model/ViewerDocument";
import type { EditCanvasRuntime } from "../runtime/EditCanvasRuntime";
import type { FeatureGate } from "../runtime/featureGate";
import { ViewerMode, ViewerStartUpMode } from "../runtime/viewerMode";
import { HVDataType, type SlideTitle } from "../storage/storageTypes";
import {
    DocumentStorageUseCase,
    type StorageActionResult,
} from "../useCase/DocumentStorageUseCase";
import {
    downloadAllSlidesAsZip,
    downloadSlideAsPNG,
    type ImageExportContext,
} from "../useCase/ImageExportUseCase";
import type { SavedFileNavigationUseCase } from "../useCase/SavedFileNavigationUseCase";
import type { SlideHistoryUseCase } from "../useCase/SlideHistoryUseCase";
import type { SlideshowUseCase } from "../useCase/SlideshowUseCase";
import { handleStorageActionResult } from "../useCase/storageActionResult";
import { DateUtil } from "../utils/DateUtil";
import type { HistoryManager } from "../utils/HistoryManager";
import type { ImageManager } from "../utils/ImageManager";
import { layerStore } from "./layerStore";
import { slideStore } from "./slideStore";
import { uiStore } from "./uiStore";
import {
    viewerDocumentStore,
    type ViewerDocumentCommandsUseCase,
} from "./viewerDocumentStore";

/**
 * R3.10: `createViewerDocumentActions` factory.
 *
 * 旧 Viewer.ts が抱えていた document/slideshow/savedFile/image-export 系の
 * 約 30 個の `commandX` メソッドと、`createDocumentSnapshot` /
 * `bindViewerDocument` / `createDefaultViewerDocument` / `hasEnabledSlides` /
 * `getImageExportContext` / `handleStorageResult` / `rebindSlideMetaListeners` /
 * `newDocument` を一括で受け持つ action factory。
 *
 * 設計方針：
 * - `viewerDocumentStore` は純粋データ＋commands slot のみ保持。
 * - 本 factory は deps（DocumentStorage / SavedFileNav / Slideshow / SlideHistory
 *   useCase インスタンスや FeatureGate / 各種コールバック）を受け取り、
 *   `ViewerDocumentCommandsUseCase` 型のコマンド集を返す。
 * - Viewer 構築時に `bindCommands(actions)` で store に注入。
 */
export type ViewerDocumentActionsDeps = {
	documentStorage: DocumentStorageUseCase;
	savedFileNav: SavedFileNavigationUseCase;
	slideshow: SlideshowUseCase;
	slideHistory: SlideHistoryUseCase;
	getEditCanvasRuntime: () => EditCanvasRuntime;
	getMode: () => ViewerMode;
	setMode: (mode: ViewerMode) => void;
	getStartUpMode: () => ViewerStartUpMode;
	getFeatureGate: () => FeatureGate;
	canEdit: () => boolean;
	canSave: () => boolean;
	canExport: () => boolean;
	canImport: () => boolean;
	canProceedWithDiscard: () => boolean;
	ensureAllowed: (canExecute: boolean, label: string) => boolean;
	shouldOverrideSave: () => boolean;
	isStrictMode: () => boolean;
	getIsDocumentModified: () => boolean;
	setIsDocumentModified: (value: boolean) => void;
	notice: (message: string) => void;
	historyManager: HistoryManager;
	imageManager: ImageManager;
	getSaveFormat: () => string;
};

export function createViewerDocumentActions(
	deps: ViewerDocumentActionsDeps
): ViewerDocumentCommandsUseCase {
	let viewerDocument: ViewerDocument | null = null;
	const slideMetaUnsubscribers: Array<() => void> = [];

	const getSlides = (): Slide[] => slideStore.getState().slides as Slide[];
	const getSelectedSlideIndex = (): number => slideStore.getState().selectedIndex;

	const handleStorageResult = (resultPromise: Promise<StorageActionResult>): void => {
		handleStorageActionResult(resultPromise, (message) => {
			deps.notice(message);
		});
	};

	const createDocumentSnapshot = (
		overrides: Partial<Omit<ViewerDocument, "slides">> = {}
	): ViewerDocument => {
		const documentState = viewerDocumentStore.getState();
		return createViewerDocument([...getSlides()], {
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
	};

	const bindViewerDocument = (document: ViewerDocument, slides: Slide[]): void => {
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
	};

	const createDefaultViewerDocument = (): ViewerDocument => {
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
	};

	const hasEnabledSlides = (): boolean => getSlides().some((slide) => !slide.disabled);

	const getImageExportContext = (): ImageExportContext => {
		const { title, width, height, bgColor } = viewerDocumentStore.getState();
		return { title, width, height, bgColor };
	};

	const rebindSlideMetaListeners = (): void => {
		for (const unsub of slideMetaUnsubscribers) {
			unsub();
		}
		slideMetaUnsubscribers.length = 0;
		if (!viewerDocument) return;
		const handler = () => {
			deps.slideHistory.publishSlides();
		};
		for (const slide of getSlides()) {
			slide.addEventListener(PropertyEvent.UPDATE, handler);
			slideMetaUnsubscribers.push(() =>
				slide.removeEventListener(PropertyEvent.UPDATE, handler)
			);
		}
	};

	const newDocumentInternal = (nextDocument?: ViewerDocument): void => {
		const nextSlides = nextDocument ? [...nextDocument.slides] : null;
		if (viewerDocument) {
			viewerDocument = null;
			slideStore.getState().setSlides([], -1);
			if (deps.getStartUpMode() === ViewerStartUpMode.VIEW_AND_EDIT) {
				deps.setMode(ViewerMode.SELECT);
				deps.getEditCanvasRuntime().initialize();
				deps.historyManager.initialize();
			}
		}

		deps.setMode(ViewerMode.SELECT);
		if (!nextDocument) {
			// nextDocument が null でない⇒slideStorage が document を生成して
			// ImageManager をリセット＆登録済み。
			deps.imageManager.initialize();
			nextDocument = createDefaultViewerDocument();
		}
		const slidesToBind = nextSlides ?? [...nextDocument.slides];
		viewerDocument = nextDocument;
		uiStore.getState().setSlideshowSettings({
			...uiStore.getState().slideshowSettings,
			bgColor: viewerDocument.bgColor,
		});
		deps.slideshow.syncRuntimeFlags();
		bindViewerDocument(viewerDocument, slidesToBind);
		deps.setIsDocumentModified(false);
		deps.slideHistory.publishHistoryState();
		layerStore.getState().commands?.publishEditSelectionState();
		rebindSlideMetaListeners();
		uiStore.getState().setStorageTitles(deps.documentStorage.getTitles());
		const titles = deps.documentStorage.getTitles();
		const currentId = deps.savedFileNav.getSelectedId();
		const currentSelectionExists = deps.savedFileNav.findIndex(currentId) !== -1;
		if (currentSelectionExists) {
			deps.savedFileNav.setSelection(currentId);
		} else {
			deps.savedFileNav.setSelection(titles.length > 0 ? String(titles[0].id) : null);
		}
	};

	return {
		newDocument(confirmed = false): void {
			if (!deps.ensureAllowed(deps.canEdit(), "新規作成")) return;
			if (getSlides().length === 0) return;
			if (
				!confirmed &&
				deps.getIsDocumentModified() &&
				deps.isStrictMode() &&
				ViewerBridge.hasListeners("newDocumentRequested")
			) {
				ViewerBridge.emit("newDocumentRequested", { open: true });
				return;
			}
			if (confirmed || deps.canProceedWithDiscard()) {
				newDocumentInternal();
			}
		},
		saveDocument(override?: boolean): void {
			if (!deps.ensureAllowed(deps.canSave(), "保存")) return;
			if (getSlides().length === 0) return;
			if (override == null && ViewerBridge.hasListeners("saveChoiceRequested")) {
				ViewerBridge.emit("saveChoiceRequested", { open: true });
				return;
			}
			const isOverride = override ?? deps.shouldOverrideSave();
			const editTime = new Date().getTime();
			const title = isOverride ? viewerDocumentStore.getState().title : DateUtil.getDateString();
			const snapshot = createDocumentSnapshot({ title, editTime });
			const resultPromise = deps.documentStorage
				.saveResult(snapshot, isOverride)
				.then((result) => {
					if (result.ok) {
						viewerDocumentStore.getState().setDocumentMeta({ title, editTime });
					}
					return result;
				});
			handleStorageResult(resultPromise);
		},
		exportDocument(): void {
			if (!deps.ensureAllowed(deps.canExport(), "書き出し")) return;
			if (getSlides().length === 0) return;
			const fmt = deps.getSaveFormat();
			const type =
				fmt === "hvz" ? HVDataType.HVZ : fmt === "hvd" ? HVDataType.HVD : HVDataType.PNG;
			const result = deps.documentStorage.exportResult(createDocumentSnapshot(), type, {
				pages: getSelectedSlideIndex() != -1 ? [getSelectedSlideIndex()] : undefined,
			});
			handleStorageResult(result);
		},
		exportImages(): void {
			if (!deps.ensureAllowed(deps.canExport(), "画像出力")) return;
			if (!hasEnabledSlides()) {
				deps.notice("有効なスライドがありません。");
				return;
			}
			downloadAllSlidesAsZip(getSlides(), getImageExportContext());
		},
		downloadSelectedSlide(): void {
			if (!deps.ensureAllowed(deps.canExport(), "画像出力")) return;
			if (getSelectedSlideIndex() === -1 && !hasEnabledSlides()) {
				deps.notice("有効なスライドがありません。");
				return;
			}
			const index = getSelectedSlideIndex();
			const slide = getSlides()[index];
			if (!slide) throw new Error("invalid index.");
			downloadSlideAsPNG(slide, index, getImageExportContext());
		},
		openImportDialog(confirmed = false): void {
			if (!deps.ensureAllowed(deps.canImport(), "読み込み")) return;
			if (
				!confirmed &&
				deps.getIsDocumentModified() &&
				deps.isStrictMode() &&
				ViewerBridge.hasListeners("importDialogRequested")
			) {
				ViewerBridge.emit("importDialogRequested", { open: true });
				return;
			}
			if (!confirmed && !deps.canProceedWithDiscard()) return;

			if (ViewerBridge.hasListeners("importFileDialogRequested")) {
				ViewerBridge.emit("importFileDialogRequested", { open: true });
			}
		},
		importFile(file: File): void {
			if (!deps.ensureAllowed(deps.canImport(), "読み込み")) return;
			if (!file) return;
			handleStorageResult(deps.documentStorage.importResult(file));
		},
		loadSavedFile(fileId: string): void {
			const result = deps.savedFileNav.loadById(fileId);
			if (result) handleStorageResult(result);
		},
		selectSavedFile(fileId: string | null): void {
			deps.savedFileNav.setSelection(fileId);
		},
		loadSelectedSavedFile(): void {
			const result = deps.savedFileNav.loadSelected();
			if (result) handleStorageResult(result);
		},
		deleteSavedFile(fileId: string): void {
			if (!deps.ensureAllowed(deps.getFeatureGate().canDeleteSavedData, "保存データ削除"))
				return;
			const result = deps.savedFileNav.deleteById(fileId);
			if (result) handleStorageResult(result);
		},
		deleteSelectedSavedFile(): void {
			if (!deps.ensureAllowed(deps.getFeatureGate().canDeleteSavedData, "保存データ削除"))
				return;
			const result = deps.savedFileNav.deleteSelected();
			if (result) handleStorageResult(result);
		},
		selectNextSavedFile(): void {
			deps.savedFileNav.selectNext();
		},
		selectPreviousSavedFile(): void {
			deps.savedFileNav.selectPrevious();
		},
		setSlideShowDuration(duration: number): void {
			deps.slideshow.setDuration(duration);
		},
		setSlideShowInterval(interval: number): void {
			deps.slideshow.setInterval(interval);
		},
		setBackgroundColor(color: string): void {
			if (!deps.ensureAllowed(deps.canEdit(), "背景色変更")) return;
			deps.slideshow.setBgColor(color);
		},
		setFullscreen(enabled: boolean): void {
			deps.slideshow.setFullscreen(enabled);
		},
		setMirrorH(enabled: boolean): void {
			deps.slideshow.setMirrorH(enabled);
		},
		setMirrorV(enabled: boolean): void {
			deps.slideshow.setMirrorV(enabled);
		},
		startSlideshow(): void {
			deps.slideshow.start();
		},
		stopSlideshow(): void {
			deps.slideshow.stop();
		},
		toggleSlideshowPause(): void {
			deps.slideshow.togglePause();
		},
		showPreviousSlide(): void {
			deps.slideshow.showPrevious();
		},
		showNextSlide(): void {
			deps.slideshow.showNext();
		},
		getSavedFileTitles(): readonly SlideTitle[] {
			return deps.documentStorage.getTitles();
		},
		handleLoadedDocument(doc: ViewerDocument): void {
			newDocumentInternal(doc);
		},
		bootstrap(): void {
			newDocumentInternal();
		},
		rebindSlideMetaListeners,
	};
}
