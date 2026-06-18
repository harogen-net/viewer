import { create } from "zustand";
import type { Slide } from "../model/Slide";
import type { ViewerDocument } from "../model/ViewerDocument";
import type { DocumentStorageUseCase } from "../useCase/DocumentStorageUseCase";
import type { SavedFileNavigationUseCase } from "../useCase/SavedFileNavigationUseCase";
import type { SlideHistoryUseCase } from "../useCase/SlideHistoryUseCase";
import type { SlideshowUseCase } from "../useCase/SlideshowUseCase";
import { slideStore } from "./slideStore";

/**
 * R3.7: viewerDocumentStore に注入するドメインコマンド群。
 * R3.10 で useViewerDocument フックがこれを束ねて公開し、各 useCase は
 * 段階的に store action へ吸収される。
 */
export type ViewerDocumentCommands = {
	storage: DocumentStorageUseCase;
	savedFileNav: SavedFileNavigationUseCase;
	slideshow: SlideshowUseCase;
	history: SlideHistoryUseCase;
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
	commands: ViewerDocumentCommands | null;
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
	bindCommands: (commands: ViewerDocumentCommands) => void;
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
