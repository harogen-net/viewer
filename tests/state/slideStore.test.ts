import { beforeEach, describe, expect, it } from "vitest";
import { useLayerStore } from "../../src/state/layerStore";
import { useSlideStore } from "../../src/state/slideStore";
import type { Slide } from "../../src/types/Slide";

// v4 Group C refactor: slideStore は階層 cascade の setter のみ持つ。
// CRUD は utils/slideOps + hooks/useSlideMutation 側のテストで担保。
// 本ファイルでは「setSlides → layerStore 空同期」「setSelectedIndex → 選択 slide
// の layers と同期」のみ検証する。

const makeSlide = (id: number, uuid: string, overrides: Partial<Slide> = {}): Slide => ({
	id,
	uuid,
	width: 800,
	height: 600,
	durationRatio: 1,
	joining: true,
	disabled: false,
	layers: [],
	...overrides,
});

beforeEach(() => {
	useSlideStore.getState().setSlides([]);
	useLayerStore.getState().setLayers([]);
});

describe("slideStore cascade (v4 Group C refactor)", () => {
	it("setSlides([...]) で slides 差し替え、selectedIndex は -1 にリセット、layerStore は空", () => {
		useSlideStore.getState().setSlides([makeSlide(1, "a"), makeSlide(2, "b")]);
		const s = useSlideStore.getState();
		expect(s.slides.length).toBe(2);
		expect(s.selectedIndex).toBe(-1);
		expect(useLayerStore.getState().layers.length).toBe(0);
	});

	it("setSelectedIndex で layerStore が選択 slide の layers と同期", () => {
		useSlideStore.getState().setSlides([
			makeSlide(1, "a", { layers: [] }),
			makeSlide(2, "b", {
				layers: [
					{
						id: 1,
						uuid: "l-1",
						name: "",
						opacity: 1,
						locked: false,
						visible: true,
						shared: false,
						transX: 0,
						transY: 0,
						scaleX: 1,
						scaleY: 1,
						rotation: 0,
						mirrorH: false,
						mirrorV: false,
						type: "text",
						text: "hi",
					},
				],
			}),
		]);
		useSlideStore.getState().setSelectedIndex(1);
		expect(useLayerStore.getState().layers.length).toBe(1);

		useSlideStore.getState().setSelectedIndex(0);
		expect(useLayerStore.getState().layers.length).toBe(0);
	});

	it("setSelectedIndex(-1) や範囲外で layerStore は空", () => {
		useSlideStore.getState().setSlides([makeSlide(1, "a")]);
		useSlideStore.getState().setSelectedIndex(99);
		expect(useLayerStore.getState().layers.length).toBe(0);
	});
});

describe("slideStore editingIndex (selectedIndex との分離)", () => {
	it("初期状態は selectedIndex / editingIndex とも -1", () => {
		useSlideStore.getState().setSlides([makeSlide(1, "a")]);
		const s = useSlideStore.getState();
		expect(s.selectedIndex).toBe(-1);
		expect(s.editingIndex).toBe(-1);
	});

	it("setEditingIndex(i>=0) で editingIndex と selectedIndex が一致する", () => {
		useSlideStore.getState().setSlides([makeSlide(1, "a"), makeSlide(2, "b")]);
		useSlideStore.getState().setEditingIndex(1);
		const s = useSlideStore.getState();
		expect(s.editingIndex).toBe(1);
		expect(s.selectedIndex).toBe(1); // 編集中は一致
	});

	it("setEditingIndex(-1) は editingIndex のみ -1、選択ハイライトは保持", () => {
		useSlideStore.getState().setSlides([makeSlide(1, "a"), makeSlide(2, "b")]);
		useSlideStore.getState().setEditingIndex(1);
		useSlideStore.getState().setEditingIndex(-1);
		const s = useSlideStore.getState();
		expect(s.editingIndex).toBe(-1);
		expect(s.selectedIndex).toBe(1); // 一覧へ戻っても選択は残る
	});

	it("setSlides は selectedIndex / editingIndex を両方 -1 にリセット", () => {
		useSlideStore.getState().setSlides([makeSlide(1, "a")]);
		useSlideStore.getState().setEditingIndex(0);
		useSlideStore.getState().setSlides([makeSlide(2, "b")]);
		const s = useSlideStore.getState();
		expect(s.selectedIndex).toBe(-1);
		expect(s.editingIndex).toBe(-1);
	});
});
