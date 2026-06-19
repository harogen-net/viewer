import { create } from "zustand";

interface ViewerDocumentState {
	title: string;
	modified: boolean;
	setTitle: (title: string) => void;
	setModified: (modified: boolean) => void;
}

export const useViewerDocumentStore = create<ViewerDocumentState>()((set) => ({
	title: "",
	modified: false,
	setTitle: (title) => set({ title }),
	setModified: (modified) => set({ modified }),
}));
