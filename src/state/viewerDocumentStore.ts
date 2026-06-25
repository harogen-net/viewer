import { create } from "zustand";
import type { ViewerDocument } from "../types/ViewerDocument";
import { useClipboardStore } from "./clipboardStore";
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
	/** 保存完了をマーク: meta.title を保存名へ同期し modified を false に戻す (履歴/slides は触らない)。 */
	markSaved: (title: string) => void;
	/** meta の一部を更新し modified=true にする (title / bgColor / width など document 設定の編集用)。
	 *  履歴/slides は触らない。width/height は SSOT なので別途 slide へ再注入すること。 */
	patchMeta: (patch: Partial<DocumentMeta>) => void;
	setProgress: (progress: number | null) => void;
}

export const useViewerDocumentStore = create<ViewerDocumentState>()((set) => ({
	meta: null,
	modified: false,
	progress: null,
	setDocument: (doc) => {
		// document 差し替え時は history を完全 reset (load 直後は undo 不可、legacy 挙動)
		useHistoryStore.getState().clear();
		// clipboard も clear (D-8)。レガシー clipboard は edit-view インスタンス毎で
		// document 切替時に失われるため、またぎペーストで孤児 imageId を生まないよう揃える。
		useClipboardStore.getState().clear();
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
	markSaved: (title) =>
		set((s) => (s.meta ? { meta: { ...s.meta, title }, modified: false } : { modified: false })),
	patchMeta: (patch) =>
		set((s) => (s.meta ? { meta: { ...s.meta, ...patch }, modified: true } : {})),
	setProgress: (progress) => set({ progress }),
}));
