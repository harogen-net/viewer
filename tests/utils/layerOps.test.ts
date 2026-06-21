import { describe, expect, it } from "vitest";
import type { ImageLayer, Layer, TextLayer } from "../../src/types/Layer";
import type { Slide } from "../../src/types/Slide";
import type { SlideState } from "../../src/types/SlideState";
import {
    addLayer,
    bringForward,
    bringToFront,
    duplicateLayer,
    removeLayer,
    reorderLayer,
    sendBackward,
    sendToBack,
    updateImageLayer,
    updateLayer,
    updateSharedLayer,
    updateTextLayer,
} from "../../src/utils/layerOps";

// v4 Group D D-2: layerOps 純関数の単体テスト。
// store / hook を一切起こさず関数を直接呼ぶため爆速。

const baseTransform = {
	transX: 0,
	transY: 0,
	scaleX: 1,
	scaleY: 1,
	rotation: 0,
	mirrorH: false,
	mirrorV: false,
};

const makeImageLayer = (id: number, uuid: string, overrides: Partial<ImageLayer> = {}): ImageLayer => ({
	id,
	uuid,
	name: "",
	opacity: 1,
	locked: false,
	visible: true,
	shared: false,
	...baseTransform,
	type: "image",
	imageId: `img-${id}`,
	clipRect: [0, 0, 0, 0],
	isText: false,
	...overrides,
});
const makeTextLayer = (id: number, uuid: string, overrides: Partial<TextLayer> = {}): TextLayer => ({
	id,
	uuid,
	name: "",
	opacity: 1,
	locked: false,
	visible: true,
	shared: false,
	...baseTransform,
	type: "text",
	text: `text-${id}`,
	...overrides,
});

const makeSlide = (layers: Layer[], id = 1, uuid = "s-1"): Slide => ({
	id,
	uuid,
	width: 800,
	height: 600,
	durationRatio: 1,
	joining: true,
	disabled: false,
	layers,
});

const makeState = (slides: Slide[], selectedIndex = 0): SlideState => ({ slides, selectedIndex });

describe("layerOps (v4 Group D D-2 純関数)", () => {
	describe("updateLayer (LayerBase 共通プロパティ)", () => {
		it("opacity 更新", () => {
			const s = makeState([makeSlide([makeImageLayer(1, "a")])]);
			const r = updateLayer(s, 0, { opacity: 0.5 });
			expect(r?.slides[0].layers[0].opacity).toBe(0.5);
		});

		it("値変化なしは null", () => {
			const s = makeState([makeSlide([makeImageLayer(1, "a", { opacity: 0.5 })])]);
			expect(updateLayer(s, 0, { opacity: 0.5 })).toBeNull();
		});

		it("selectedIndex < 0 / 範囲外は null", () => {
			const s = makeState([makeSlide([makeImageLayer(1, "a")])], -1);
			expect(updateLayer(s, 0, { opacity: 0.5 })).toBeNull();

			const s2 = makeState([makeSlide([makeImageLayer(1, "a")])]);
			expect(updateLayer(s2, 99, { opacity: 0.5 })).toBeNull();
		});

		it("入力 state を mutate しない (immutability)", () => {
			const s = makeState([makeSlide([makeImageLayer(1, "a")])]);
			updateLayer(s, 0, { opacity: 0.3 });
			expect(s.slides[0].layers[0].opacity).toBe(1);
		});
	});

	describe("updateImageLayer / updateTextLayer (type 専用)", () => {
		it("updateImageLayer: image 専用フィールド更新", () => {
			const s = makeState([makeSlide([makeImageLayer(1, "a")])]);
			const r = updateImageLayer(s, 0, { clipRect: [1, 2, 3, 4] });
			expect((r?.slides[0].layers[0] as ImageLayer).clipRect).toEqual([1, 2, 3, 4]);
		});

		it("updateImageLayer: text layer に対しては null", () => {
			const s = makeState([makeSlide([makeTextLayer(1, "a")])]);
			expect(updateImageLayer(s, 0, { clipRect: [0, 0, 0, 0] })).toBeNull();
		});

		it("updateTextLayer: text フィールド更新", () => {
			const s = makeState([makeSlide([makeTextLayer(1, "a", { text: "hi" })])]);
			const r = updateTextLayer(s, 0, { text: "hello" });
			expect((r?.slides[0].layers[0] as TextLayer).text).toBe("hello");
		});

		it("updateTextLayer: image layer に対しては null", () => {
			const s = makeState([makeSlide([makeImageLayer(1, "a")])]);
			expect(updateTextLayer(s, 0, { text: "x" })).toBeNull();
		});
	});

	describe("addLayer / removeLayer / duplicateLayer", () => {
		it("addLayer: 末尾に追加、id は max+1、uuid は自動採番", () => {
			const s = makeState([makeSlide([makeImageLayer(5, "a")])]);
			const r = addLayer(s, {
				name: "",
				opacity: 1,
				locked: false,
				visible: true,
				shared: false,
				...baseTransform,
				type: "image",
				imageId: "new",
				clipRect: [0, 0, 0, 0],
				isText: false,
			});
			expect(r?.slides[0].layers.length).toBe(2);
			expect(r?.slides[0].layers[1].id).toBe(6);
			expect(r?.slides[0].layers[1].uuid).toBeTruthy();
		});

		it("removeLayer: 範囲外は null、正常時は削除", () => {
			const s = makeState([makeSlide([makeImageLayer(1, "a"), makeImageLayer(2, "b")])]);
			expect(removeLayer(s, 99)).toBeNull();
			const r = removeLayer(s, 0);
			expect(r?.slides[0].layers.length).toBe(1);
			expect(r?.slides[0].layers[0].uuid).toBe("b");
		});

		it("duplicateLayer: 直後挿入、新 id + uuid", () => {
			const s = makeState([makeSlide([makeImageLayer(1, "a"), makeImageLayer(2, "b")])]);
			const r = duplicateLayer(s, 0);
			expect(r?.slides[0].layers.length).toBe(3);
			expect(r?.slides[0].layers[0].uuid).toBe("a");
			expect(r?.slides[0].layers[1].uuid).not.toBe("a");
			expect(r?.slides[0].layers[1].uuid).not.toBe("b");
			expect(r?.slides[0].layers[1].id).toBe(3); // max(1,2)+1
			expect(r?.slides[0].layers[2].uuid).toBe("b");
		});
	});

	describe("reorderLayer / bring* / send*", () => {
		const seed = (): SlideState =>
			makeState([
				makeSlide([makeImageLayer(1, "a"), makeImageLayer(2, "b"), makeImageLayer(3, "c")]),
			]);

		it("reorderLayer: from→to 移動", () => {
			const r = reorderLayer(seed(), 0, 2);
			expect(r?.slides[0].layers.map((l) => l.uuid)).toEqual(["b", "c", "a"]);
		});

		it("reorderLayer: 同 index / 範囲外は null", () => {
			expect(reorderLayer(seed(), 1, 1)).toBeNull();
			expect(reorderLayer(seed(), -1, 0)).toBeNull();
			expect(reorderLayer(seed(), 0, 99)).toBeNull();
		});

		it("bringToFront: 末尾に移動", () => {
			const r = bringToFront(seed(), 0);
			expect(r?.slides[0].layers.map((l) => l.uuid)).toEqual(["b", "c", "a"]);
		});

		it("bringToFront: すでに末尾なら null", () => {
			expect(bringToFront(seed(), 2)).toBeNull();
		});

		it("sendToBack: 先頭に移動", () => {
			const r = sendToBack(seed(), 2);
			expect(r?.slides[0].layers.map((l) => l.uuid)).toEqual(["c", "a", "b"]);
		});

		it("sendToBack: すでに先頭なら null", () => {
			expect(sendToBack(seed(), 0)).toBeNull();
		});

		it("bringForward: 1 段前 (index+1) に移動", () => {
			const r = bringForward(seed(), 0);
			expect(r?.slides[0].layers.map((l) => l.uuid)).toEqual(["b", "a", "c"]);
		});

		it("sendBackward: 1 段後 (index-1) に移動", () => {
			const r = sendBackward(seed(), 2);
			expect(r?.slides[0].layers.map((l) => l.uuid)).toEqual(["a", "c", "b"]);
		});

		it("bringForward 最前面 / sendBackward 最背面は null", () => {
			expect(bringForward(seed(), 2)).toBeNull();
			expect(sendBackward(seed(), 0)).toBeNull();
		});
	});

	describe("updateSharedLayer (全 slide 走査)", () => {
		it("複数 slide に同 uuid + shared=true な layer があれば一括更新", () => {
			// uuid=X が 2 slide に出現するセットアップ (テスト都合)
			const s = makeState([
				makeSlide([makeImageLayer(1, "X", { shared: true, opacity: 1 })], 1, "s1"),
				makeSlide([makeImageLayer(2, "X", { shared: true, opacity: 1 })], 2, "s2"),
			]);
			const r = updateSharedLayer(s, "X", { opacity: 0.5 });
			expect(r?.slides[0].layers[0].opacity).toBe(0.5);
			expect(r?.slides[1].layers[0].opacity).toBe(0.5);
		});

		it("shared=false の layer はスキップ", () => {
			const s = makeState([
				makeSlide([makeImageLayer(1, "X", { shared: false })], 1, "s1"),
			]);
			expect(updateSharedLayer(s, "X", { opacity: 0.5 })).toBeNull();
		});

		it("該当 0 件は null", () => {
			const s = makeState([makeSlide([makeImageLayer(1, "Y", { shared: true })])]);
			expect(updateSharedLayer(s, "X", { opacity: 0.5 })).toBeNull();
		});
	});
});
