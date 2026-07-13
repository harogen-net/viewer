import { useImageLibraryStore } from "../state/imageLibraryStore";

/** imageLibraryStore から imageId → dataURL の map を集める (export / サムネ生成用)。 */
export const collectImageMap = (): Record<string, string> => {
	const imageMap: Record<string, string> = {};
	for (const [id, entry] of Object.entries(useImageLibraryStore.getState().imageById)) {
		imageMap[id] = entry.dataURL;
	}
	return imageMap;
};

/** imageLibraryStore から imageId → 元ファイル名 の map を集める (export 時に名前を保存するため)。 */
export const collectImageNames = (): Record<string, string> => {
	const names: Record<string, string> = {};
	for (const [id, entry] of Object.entries(useImageLibraryStore.getState().imageById)) {
		if (entry.name != null && entry.name !== "") names[id] = entry.name;
	}
	return names;
};
