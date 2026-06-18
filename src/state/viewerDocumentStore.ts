import { create } from "zustand";
import type { Slide } from "../model/Slide";
import type { ViewerDocument } from "../model/ViewerDocument";
import type { SlideTitle } from "../storage/storageTypes";
import { slideStore } from "./slideStore";

/**
 * R3.10: viewerDocumentStore に注入する公開コマンド群。
 * `createViewerDocumentActions(deps)` の戻り値が `bindCommands` で注入され、
 * `useViewerDocument` フックがこれを束ねて React/外部に公開する。
 */
export type ViewerDocumentCommandsUseCase = {
	newDocument(confirmed?: boolean): void;
	saveDocument(override?: boolean): void;
	exportDocument(): void;
	exportImages(): void;
	downloadSelectedSlide(): void;
	openImportDialog(confirmed?: boolean): void;
	importFile(file: File): void;
	loadSavedFile(fileId: string): void;
	selectSavedFile(fileId: string | null): void;
	loadSelectedSavedFile(): void;
	deleteSavedFile(fileId: string): void;
	deleteSelectedSavedFile(): void;
	selectNextSavedFile(): void;
	selectPreviousSavedFile(): void;
	setSlideShowDuration(duration: number): void;
	setSlideShowInterval(interval: number): void;
	setBackgroundColor(color: string): void;
	setFullscreen(enabled: boolean): void;
	setMirrorH(enabled: boolean): void;
	setMirrorV(enabled: boolean): void;
	startSlideshow(): void;
	stopSlideshow(): void;
	toggleSlideshowPause(): void;
	showPreviousSlide(): void;
	showNextSlide(): void;
	getSavedFileTitles(): readonly SlideTitle[];
	/** documentStorage.onLoaded から呼ばれる internal flow。 */
	handleLoadedDocument(doc: ViewerDocument): void;
	/** Viewer 構築直後に最初のドキュメントを生成・束縛する。 */
	bootstrap(): void;
	/** スライド構造変更後に PropertyEvent リスナを再アタッチ。 */
	rebindSlideMetaListeners(): void;
};

type ViewerDocumentStateSnapshot = {
	document: ViewerDocument | null;
	title: string;
	createTime: number;
	editTime: number;
	isSensitive: boolean;
	duration: number | undefined;
	interval: number | undefined;
	width: number;
	height: number;
	bgColor: string;
	commands: ViewerDocumentCommandsUseCase | null;
	revision: number;
};

export type ViewerDocumentStoreDocumentInput = {
	document: ViewerDocument | null;
	title: string;
	createTime: number;
	editTime: number;
	isSensitive: boolean;
	duration?: number;
	interval?: number;
	width: number;
	height: number;
	bgColor: string;
	slides: readonly Slide[];
};

type ViewerDocumentActions = {
	setDocument: (input: ViewerDocumentStoreDocumentInput | null, selectedIndex?: number) => void;
	setDocumentMeta: (
		patch: Partial<
			Pick<
				ViewerDocumentStateSnapshot,
				| "title"
				| "createTime"
				| "editTime"
				| "isSensitive"
				| "duration"
				| "interval"
				| "width"
				| "height"
				| "bgColor"
			>
		>
	) => void;
	bindCommands: (commands: ViewerDocumentCommandsUseCase) => void;
	reset: () => void;
};

export type ViewerDocumentStore = ViewerDocumentStateSnapshot & ViewerDocumentActions;

const setDocumentCssVariables = (bgColor: string): void => {
	if (typeof document === "undefined") return;
	document.documentElement.style.setProperty("--slideBackgroundColor", bgColor);
};

const initialDocumentState = {
	document: null,
	title: "",
	createTime: 0,
	editTime: 0,
	isSensitive: false,
	duration: undefined,
	interval: undefined,
	width: 0,
	height: 0,
	bgColor: "#000000",
};

export const useViewerDocumentStore = create<ViewerDocumentStore>((set, get) => ({
	...initialDocumentState,
	commands: null,
	revision: 0,
	setDocument: (input, selectedIndex = -1) => {
		if (!input) {
			get().reset();
			return;
		}
		setDocumentCssVariables(input.bgColor);
		slideStore.getState().setSlides(input.slides, selectedIndex);
		set((state) => ({
			document: input.document,
			title: input.title,
			createTime: input.createTime,
			editTime: input.editTime,
			isSensitive: input.isSensitive,
			duration: input.duration,
			interval: input.interval,
			width: input.width,
			height: input.height,
			bgColor: input.bgColor,
			revision: state.revision + 1,
		}));
	},
	setDocumentMeta: (patch) => {
		if (patch.bgColor !== undefined) {
			setDocumentCssVariables(patch.bgColor);
		}
		set((state) => ({
			...patch,
			revision: state.revision + 1,
		}));
	},
	bindCommands: (commands) => {
		set((state) => ({
			commands,
			revision: state.revision + 1,
		}));
	},
	reset: () => {
		slideStore.getState().reset();
		set((state) => ({
			...initialDocumentState,
			revision: state.revision + 1,
		}));
	},
}));

export const viewerDocumentStore = useViewerDocumentStore;
