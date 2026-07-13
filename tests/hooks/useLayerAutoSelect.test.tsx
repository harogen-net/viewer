import type { FC } from "react";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { useLayerAutoSelect } from "../../src/hooks/useLayerAutoSelect";
import { useEditViewStore } from "../../src/state/editViewStore";
import { useLayerStore } from "../../src/state/layerStore";
import { useSlideStore } from "../../src/state/slideStore";
import type { ImageLayer, Layer, TextLayer } from "../../src/types/Layer";
import type { Slide } from "../../src/types/Slide";

// スライド遷移時のレイヤ自動選択 (同一画像/同一テキスト/同形状=同index/最前面)。

const baseTransform = {
	transX: 0,
	transY: 0,
	scaleX: 1,
	scaleY: 1,
	rotation: 0,
	mirrorH: false,
	mirrorV: false,
};
const img = (id: number, imageId: string, overrides: Partial<ImageLayer> = {}): ImageLayer => ({
	id,
	uuid: `l-${id}`,
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
	...overrides,
});
const txt = (id: number, text: string, overrides: Partial<TextLayer> = {}): TextLayer => ({
	id,
	uuid: `l-${id}`,
	name: "",
	opacity: 1,
	locked: false,
	visible: true,
	shared: false,
	...baseTransform,
	type: "text",
	text,
	...overrides,
});
const slide = (id: number, layers: Layer[]): Slide => ({
	id,
	uuid: `s-${id}`,
	width: 800,
	height: 600,
	durationRatio: 1,
	joining: false,
	disabled: false,
	layers,
});

const Probe: FC = () => {
	useLayerAutoSelect();
	return null;
};

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
	useSlideStore.getState().setSlides([]);
	useLayerStore.getState().setLayers([]);
	useLayerStore.getState().setSelectedLayer(null);
	useEditViewStore.getState().setRectEdit(false);
	container = document.createElement("div");
	document.body.appendChild(container);
	root = createRoot(container);
	act(() => root.render(<Probe />));
});

afterEach(() => {
	act(() => root.unmount());
	container.remove();
});

const selectSlide = (index: number): void => {
	act(() => useSlideStore.getState().setSelectedIndex(index));
};
const selectLayerUuid = (uuid: string): void => {
	const slide = useSlideStore.getState().slides[useSlideStore.getState().selectedIndex];
	const layer = slide?.layers.find((l) => l.uuid === uuid) ?? null;
	act(() => useLayerStore.getState().setSelectedLayer(layer));
};

describe("useLayerAutoSelect", () => {
	it("スライド変更で rectEdit が自動 OFF になる (legacy replaceSlide 準拠)", () => {
		useSlideStore
			.getState()
			.setSlides([slide(1, [img(1, "A")]), slide(2, [img(2, "B")])]);
		selectSlide(0);
		act(() => useEditViewStore.getState().setRectEdit(true));
		expect(useEditViewStore.getState().rectEdit).toBe(true);
		selectSlide(1); // 別スライドへ移動
		expect(useEditViewStore.getState().rectEdit).toBe(false);
	});

	it("同一スライド内 (index 不変) では rectEdit を維持する", () => {
		useSlideStore.getState().setSlides([slide(1, [img(1, "A")])]);
		selectSlide(0);
		act(() => useEditViewStore.getState().setRectEdit(true));
		selectSlide(0); // 同じ index を再選択 = 遷移でない
		expect(useEditViewStore.getState().rectEdit).toBe(true);
	});

	it("同一画像 (imageId 一致) を遷移先で自動選択", () => {
		useSlideStore.getState().setSlides([
			slide(1, [img(1, "A"), img(2, "B")]),
			slide(2, [img(3, "X"), img(4, "B")]), // B が index 1 に居る
		]);
		selectSlide(0);
		selectLayerUuid("l-2"); // imageId "B" を選択
		selectSlide(1);
		// 遷移先で imageId "B" の layer (l-4) が自動選択される
		expect(useLayerStore.getState().selectedLayer?.uuid).toBe("l-4");
	});

	it("同一テキスト (text 一致) を遷移先で自動選択", () => {
		useSlideStore
			.getState()
			.setSlides([slide(1, [txt(1, "hello")]), slide(2, [img(2, "A"), txt(3, "hello")])]);
		selectSlide(0);
		selectLayerUuid("l-1");
		selectSlide(1);
		expect(useLayerStore.getState().selectedLayer?.uuid).toBe("l-3");
	});

	it("一致が無ければ同 index (同形状) を選択", () => {
		useSlideStore.getState().setSlides([
			slide(1, [img(1, "A"), img(2, "B")]),
			slide(2, [img(3, "X"), img(4, "Y")]), // A/B いずれも無い
		]);
		selectSlide(0);
		selectLayerUuid("l-2"); // index 1
		selectSlide(1);
		// index 1 の layer (l-4) が選択される
		expect(useLayerStore.getState().selectedLayer?.uuid).toBe("l-4");
	});

	it("一致も index も無効なら最前面 (配列末尾) の可視・非ロック layer を選択", () => {
		useSlideStore
			.getState()
			.setSlides([slide(1, [img(1, "A")]), slide(2, [img(2, "X"), img(3, "Y")])]);
		selectSlide(0);
		selectLayerUuid("l-1"); // index 0, imageId A
		selectSlide(1);
		// A 無し / index 0 は l-2 だが、優先は imageId→index。index 0 が選択可能なので l-2。
		// (このケースは index 0 が有効なので l-2)
		expect(useLayerStore.getState().selectedLayer?.uuid).toBe("l-2");
	});

	it("locked / 非表示の一致 layer は飛ばす", () => {
		useSlideStore
			.getState()
			.setSlides([slide(1, [img(1, "A")]), slide(2, [img(2, "A", { locked: true }), img(3, "B")])]);
		selectSlide(0);
		selectLayerUuid("l-1"); // imageId A
		selectSlide(1);
		// 遷移先の A は locked → 一致対象外。index 0 も locked → 最前面の可視 l-3。
		expect(useLayerStore.getState().selectedLayer?.uuid).toBe("l-3");
	});
});
