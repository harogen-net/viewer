import { create } from "zustand";
import type { ViewerDocument } from "../types/ViewerDocument";
import { useSlideStore } from "./slideStore";

/** ViewerDocument から slides を除いたメタ部分 (slides は slideStore が保持)。 */
type DocumentMeta = Omit<ViewerDocument, "slides">;

interface ViewerDocumentState {
	meta: DocumentMeta | null;
	modified: boolean;
	setDocument: (doc: ViewerDocument | null) => void;
	setModified: (modified: boolean) => void;
}

export const useViewerDocumentStore = create<ViewerDocumentState>()((set) => ({
	meta: null,
	modified: false,
	setDocument: (doc) => {
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
}));
