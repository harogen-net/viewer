import { useMemo } from "react";
import type { Slide } from "../model/Slide";
import {
    useViewerDocumentStore,
    type ViewerDocumentCommandsUseCase,
} from "../state/viewerDocumentStore";
import type { SlideTitle } from "../storage/storageTypes";

/**
 * R3.10: `useViewerDocument` hook — public API for viewer-document state + actions.
 *
 * 設計方針：
 * - 状態は `viewerDocumentStore` selector で購読し、React の再レンダリングを駆動。
 * - 操作は `viewerDocumentStore.commands`（R3.10 で注入された
 *   `ViewerDocumentCommandsUseCase`）のメソッドへ委譲する。
 *
 * 公開しない internal API（`bootstrap` / `handleLoadedDocument` /
 * `rebindSlideMetaListeners`）は React 側に露出させない。
 */

export type ViewerDocumentHookState = {
	title: string;
	createTime: number;
	editTime: number;
	isSensitive: boolean;
	duration: number | undefined;
	interval: number | undefined;
	width: number;
	height: number;
	bgColor: string;
};

export type ViewerDocumentHookActions = Omit<
	ViewerDocumentCommandsUseCase,
	"bootstrap" | "handleLoadedDocument" | "rebindSlideMetaListeners"
>;

export type ViewerDocumentHook = {
	state: ViewerDocumentHookState;
	actions: ViewerDocumentHookActions;
};

const noop = () => {};
const noopActions: ViewerDocumentHookActions = {
	newDocument: noop,
	saveDocument: noop,
	exportDocument: noop,
	exportImages: noop,
	downloadSelectedSlide: noop,
	openImportDialog: noop,
	importFile: noop,
	loadSavedFile: noop,
	selectSavedFile: noop,
	loadSelectedSavedFile: noop,
	deleteSavedFile: noop,
	deleteSelectedSavedFile: noop,
	selectNextSavedFile: noop,
	selectPreviousSavedFile: noop,
	setSlideShowDuration: noop,
	setSlideShowInterval: noop,
	setBackgroundColor: noop,
	setFullscreen: noop,
	setMirrorH: noop,
	setMirrorV: noop,
	startSlideshow: noop,
	stopSlideshow: noop,
	toggleSlideshowPause: noop,
	showPreviousSlide: noop,
	showNextSlide: noop,
	getSavedFileTitles: () => [] as readonly SlideTitle[],
};

/** React hook to access viewer-document state and actions. */
export function useViewerDocument(): ViewerDocumentHook {
	const title = useViewerDocumentStore((s) => s.title);
	const createTime = useViewerDocumentStore((s) => s.createTime);
	const editTime = useViewerDocumentStore((s) => s.editTime);
	const isSensitive = useViewerDocumentStore((s) => s.isSensitive);
	const duration = useViewerDocumentStore((s) => s.duration);
	const interval = useViewerDocumentStore((s) => s.interval);
	const width = useViewerDocumentStore((s) => s.width);
	const height = useViewerDocumentStore((s) => s.height);
	const bgColor = useViewerDocumentStore((s) => s.bgColor);
	const commands = useViewerDocumentStore((s) => s.commands);

	const actions = useMemo<ViewerDocumentHookActions>(() => {
		if (!commands) return noopActions;
		return {
			newDocument: (confirmed) => commands.newDocument(confirmed),
			saveDocument: (override) => commands.saveDocument(override),
			exportDocument: () => commands.exportDocument(),
			exportImages: () => commands.exportImages(),
			downloadSelectedSlide: () => commands.downloadSelectedSlide(),
			openImportDialog: (confirmed) => commands.openImportDialog(confirmed),
			importFile: (file) => commands.importFile(file),
			loadSavedFile: (fileId) => commands.loadSavedFile(fileId),
			selectSavedFile: (fileId) => commands.selectSavedFile(fileId),
			loadSelectedSavedFile: () => commands.loadSelectedSavedFile(),
			deleteSavedFile: (fileId) => commands.deleteSavedFile(fileId),
			deleteSelectedSavedFile: () => commands.deleteSelectedSavedFile(),
			selectNextSavedFile: () => commands.selectNextSavedFile(),
			selectPreviousSavedFile: () => commands.selectPreviousSavedFile(),
			setSlideShowDuration: (duration) => commands.setSlideShowDuration(duration),
			setSlideShowInterval: (interval) => commands.setSlideShowInterval(interval),
			setBackgroundColor: (color) => commands.setBackgroundColor(color),
			setFullscreen: (enabled) => commands.setFullscreen(enabled),
			setMirrorH: (enabled) => commands.setMirrorH(enabled),
			setMirrorV: (enabled) => commands.setMirrorV(enabled),
			startSlideshow: () => commands.startSlideshow(),
			stopSlideshow: () => commands.stopSlideshow(),
			toggleSlideshowPause: () => commands.toggleSlideshowPause(),
			showPreviousSlide: () => commands.showPreviousSlide(),
			showNextSlide: () => commands.showNextSlide(),
			getSavedFileTitles: () => commands.getSavedFileTitles(),
		};
	}, [commands]);

	return {
		state: { title, createTime, editTime, isSensitive, duration, interval, width, height, bgColor },
		actions,
	};
}

/**
 * React 外文脈（keydown ハンドラ・bridge 互換層など）から viewer-document action を
 * 呼ぶ用の helper。`viewerDocumentStore.getState().commands` の short-hand。
 * バインド前は `null` を返す。
 */
export function getViewerDocumentActions(): ViewerDocumentCommandsUseCase | null {
	return useViewerDocumentStore.getState().commands;
}

// Slide 型を hook の入出力として利用しないが、importer 側で型解決の便のため re-export しない。
// useSlide() / useLayer() / useViewerDocument() を組み合わせて利用すること。
export type { Slide };
