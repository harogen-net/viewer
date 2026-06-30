import { afterEach, describe, expect, it } from "vitest";
import { useImageLibraryStore } from "../../src/state/imageLibraryStore";
import { collectImageMap } from "../../src/utils/collectImageMap";

// imageLibraryStore から export 用の imageId → dataURL map を組み立てる。
// entry の name/width/height など dataURL 以外のフィールドは落とす。

afterEach(() => {
	useImageLibraryStore.setState({ imageById: {} });
});

describe("collectImageMap", () => {
	it("空ライブラリでは空 map", () => {
		expect(collectImageMap()).toEqual({});
	});

	it("imageId → dataURL の map を返す (dataURL 以外のフィールドは落とす)", () => {
		useImageLibraryStore.getState().setImageLibrary({
			a: { dataURL: "data:a", name: "a.png", width: 10, height: 20 },
			b: "data:b",
		});
		expect(collectImageMap()).toEqual({ a: "data:a", b: "data:b" });
	});
});
