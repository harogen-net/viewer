import { useImageLibraryStore } from "../state/imageLibraryStore";

/** imageLibraryStore から imageId → dataURL の map を集める (export / サムネ生成用)。 */
export const collectImageMap = (): Record<string, string> => {
	const imageMap: Record<string, string> = {};
	for (const [id, entry] of Object.entries(useImageLibraryStore.getState().imageById)) {
		imageMap[id] = entry.dataURL;
	}
	return imageMap;
};
