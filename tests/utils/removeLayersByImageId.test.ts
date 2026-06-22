import { describe, expect, it } from "vitest";
import type { ImageLayer, Layer, TextLayer } from "../../src/types/Layer";
import type { Slide } from "../../src/types/Slide";
import type { SlideState } from "../../src/types/SlideState";
import { removeLayersByImageId } from "../../src/utils/layerOps";

// v4 Group D D-6a: removeLayersByImageId (全 slide cascade 削除) のテスト。

const baseTransform = {
	transX: 0,
	transY: 0,
	scaleX: 1,
	scaleY: 1,
	rotation: 0,
	mirrorH: false,
	mirrorV: false,
};
const makeImageLayer = (id: number, uuid: string, imageId: string): ImageLayer => ({
	id,
	uuid,
	name: "",
	opacity: 1,
	locked: false,
	visible: true,
	shared: false,
	...baseTransform,
	type: "image",
	imageId,
	clipRect: [0, 0, 0, 0],
	isText: false,
});
const makeTextLayer = (id: number, uuid: string, text: string): TextLayer => ({
	id,
	uuid,
	name: "",
	opacity: 1,
	locked: false,
	visible: true,
	shared: false,
	...baseTransform,
	type: "text",
	text,
});
const makeSlide = (id: number, uuid: string, layers: Layer[]): Slide => ({
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

describe("removeLayersByImageId (v4 Group D D-6a)", () => {
	it("複数 slide にまたがる同 imageId layer をすべて削除", () => {
		const s = makeState([
			makeSlide(1, "s1", [
				makeImageLayer(1, "a", "img-X"),
				makeImageLayer(2, "b", "img-Y"),
			]),
			makeSlide(2, "s2", [
				makeImageLayer(3, "c", "img-X"),
				makeTextLayer(4, "d", "hello"),
			]),
		]);
		const r = removeLayersByImageId(s, "img-X");
		expect(r?.slides[0].layers.map((l) => l.uuid)).toEqual(["b"]);
		expect(r?.slides[1].layers.map((l) => l.uuid)).toEqual(["d"]);
	});

	it("TextLayer は同 id でも残る (image 型のみ対象)", () => {
		const s = makeState([
			makeSlide(1, "s1", [makeTextLayer(1, "a", "hello")]),
		]);
		expect(removeLayersByImageId(s, "img-X")).toBeNull();
	});

	it("該当 0 件は null", () => {
		const s = makeState([
			makeSlide(1, "s1", [makeImageLayer(1, "a", "img-Y")]),
		]);
		expect(removeLayersByImageId(s, "img-X")).toBeNull();
	});

	it("入力 state を mutate しない", () => {
		const s = makeState([makeSlide(1, "s1", [makeImageLayer(1, "a", "img-X")])]);
		removeLayersByImageId(s, "img-X");
		expect(s.slides[0].layers.length).toBe(1);
	});

	it("shared layer も例外なく削除", () => {
		const s = makeState([
			makeSlide(1, "s1", [
				{ ...makeImageLayer(1, "a", "img-X"), shared: true },
			]),
		]);
		const r = removeLayersByImageId(s, "img-X");
		expect(r?.slides[0].layers.length).toBe(0);
	});
});
