import { create } from "zustand";
import type { ViewerDocument } from "../types/ViewerDocument";
import { useHistoryStore } from "./historyStore";
import { useSlideStore } from "./slideStore";

/** ViewerDocument から slides を除いたメタ部分 (slides は slideStore が保持)。 */
type DocumentMeta = Omit<ViewerDocument, "slides">;

interface ViewerDocumentState {
	meta: DocumentMeta | null;
	modified: boolean;
	/** document の load / save / export 等の進捗 (0..1)。実行中でない時は null。 */
	progress: number | null;
	setDocument: (doc: ViewerDocument | null) => void;
	setModified: (modified: boolean) => void;
	setProgress: (progress: number | null) => void;
}

export const useViewerDocumentStore = create<ViewerDocumentState>()((set) => ({
	meta: null,
	modified: false,
	progress: null,
	setDocument: (doc) => {
		// document 差し替え時は history を完全 reset (load 直後は undo 不可、legacy 挙動)
		useHistoryStore.getState().clear();
		if (doc === null) {
			set({ meta: null, modified: false });
			useSlideStore.getState().setSlides([]);
		} else {
			const { slides, ...meta } = doc;
			set({ meta, modified: false });
			useSlideStore.getState().setSlides(slides);
		}
	},
	setModified: (modified) => set({ modified }),
	setProgress: (progress) => set({ progress }),
}));
