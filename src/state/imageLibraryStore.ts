import { create } from "zustand";

// 画像 ID → DataURL の SSoT (v3 Group A、§0-10 新側内製)。
// レガシーは src/utils/ImageManager.ts (jQuery class シングルトン) が in-memory
// 保持する形で、永続化は HVD ファイル内 `imageData: {imageId: dataURL}` に依存。
// 新側は ImageManager を import せず、ロード時に HVD から抽出した map を
// この store に直接書き込む。Group B / D で useImageLibrary 等の hook に
// API を整理する想定だが、Group A 時点では store + selector で完結する。

interface ImageEntry {
	dataURL: string;
	/** 画像ファイル名 (HVD には載らないが、レガシー UI 互換のため optional)。 */
	name?: string;
}

interface ImageLibraryState {
	imageById: Record<string, ImageEntry>;
	/** map ごと差し替え (HVD ロード時に呼ぶ)。既存マップは破棄。 */
	setImageLibrary: (entries: Record<string, ImageEntry | string>) => void;
	/** 個別追加 (将来の画像 import 用、Group D で使う想定)。 */
	addImage: (id: string, entry: ImageEntry | string) => void;
}

function normalize(entry: ImageEntry | string): ImageEntry {
	return typeof entry === "string" ? { dataURL: entry } : entry;
}

export const useImageLibraryStore = create<ImageLibraryState>()((set) => ({
	imageById: {},
	setImageLibrary: (entries) => {
		const next: Record<string, ImageEntry> = {};
		for (const [id, e] of Object.entries(entries)) next[id] = normalize(e);
		set({ imageById: next });
	},
	addImage: (id, entry) => set((s) => ({ imageById: { ...s.imageById, [id]: normalize(entry) } })),
}));
