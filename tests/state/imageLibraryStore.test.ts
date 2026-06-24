import { beforeEach, describe, expect, it } from "vitest";
import { useImageLibraryStore } from "../../src/state/imageLibraryStore";

// v4 Group D D-14: imageLibraryStore.setImageDimensions (自然寸法 backfill) の単体テスト。

beforeEach(() => {
	useImageLibraryStore.setState({ imageById: {} });
});

describe("imageLibraryStore.setImageDimensions (v4 Group D D-14)", () => {
	it("既存 entry に width/height を後付けする", () => {
		useImageLibraryStore.getState().addImage("a", { dataURL: "d" });
		useImageLibraryStore.getState().setImageDimensions("a", 400, 200);
		const e = useImageLibraryStore.getState().imageById.a;
		expect(e.width).toBe(400);
		expect(e.height).toBe(200);
		// dataURL は保持
		expect(e.dataURL).toBe("d");
	});

	it("該当 id が無ければ no-op (参照不変)", () => {
		const before = useImageLibraryStore.getState().imageById;
		useImageLibraryStore.getState().setImageDimensions("missing", 1, 1);
		expect(useImageLibraryStore.getState().imageById).toBe(before);
	});

	it("同値での再設定は参照を変えない (no-op)", () => {
		useImageLibraryStore.getState().addImage("a", { dataURL: "d", width: 10, height: 20 });
		const before = useImageLibraryStore.getState().imageById;
		useImageLibraryStore.getState().setImageDimensions("a", 10, 20);
		expect(useImageLibraryStore.getState().imageById).toBe(before);
	});

	it("異なる値なら参照を更新する", () => {
		useImageLibraryStore.getState().addImage("a", { dataURL: "d", width: 10, height: 20 });
		const before = useImageLibraryStore.getState().imageById;
		useImageLibraryStore.getState().setImageDimensions("a", 30, 40);
		expect(useImageLibraryStore.getState().imageById).not.toBe(before);
		expect(useImageLibraryStore.getState().imageById.a.width).toBe(30);
	});
});
