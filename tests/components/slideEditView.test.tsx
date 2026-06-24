import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { SlideEditView } from "../../src/components/slide/SlideEditView";
import type { Slide } from "../../src/types/Slide";

// v4 Group D D-1: SlideEditView の smoke + fit-to-area scale 計算検証。
// layer click hit-test / 編集ハンドルは D-3 以降で実装するため本テストでは扱わない。

const makeSlide = (overrides: Partial<Slide> = {}): Slide => ({
	id: 1,
	uuid: "s-1",
	width: 1600,
	height: 800,
	durationRatio: 1,
	joining: true,
	disabled: false,
	layers: [],
	...overrides,
});

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
	container = document.createElement("div");
	document.body.appendChild(container);
	root = createRoot(container);
});

afterEach(() => {
	act(() => root.unmount());
	container.remove();
});

const render = (slide: Slide, fitAreaWidth: number, fitAreaHeight: number): void => {
	act(() => {
		root.render(
			<SlideEditView slide={slide} fitAreaWidth={fitAreaWidth} fitAreaHeight={fitAreaHeight} />
		);
	});
};

describe("SlideEditView (v4 Group D D-1)", () => {
	it("data-slide-edit-area / data-slide-edit-stage が描画される", () => {
		render(makeSlide(), 800, 600);
		expect(container.querySelector("[data-slide-edit-area]")).not.toBeNull();
		expect(container.querySelector("[data-slide-edit-stage]")).not.toBeNull();
	});

	it("fit area が横長 (800x600) で slide 1600x800 → 横幅律 (scale=0.5)、stage=800x400", () => {
		// scaleX = 800/1600 = 0.5, scaleY = 600/800 = 0.75 → min = 0.5
		// displayW = 1600*0.5 = 800, displayH = 800*0.5 = 400
		render(makeSlide(), 800, 600);
		const stage = container.querySelector<HTMLElement>("[data-slide-edit-stage]");
		expect(stage?.style.width).toBe("800px");
		expect(stage?.style.height).toBe("400px");
	});

	it("fit area が縦長 (400x600) で slide 1600x800 → 横幅律 (scale=0.25)、stage=400x200", () => {
		// scaleX = 400/1600 = 0.25, scaleY = 600/800 = 0.75 → min = 0.25
		// displayW = 400, displayH = 200
		render(makeSlide(), 400, 600);
		const stage = container.querySelector<HTMLElement>("[data-slide-edit-stage]");
		expect(stage?.style.width).toBe("400px");
		expect(stage?.style.height).toBe("200px");
	});

	it("fit area が小さく縦律 (800x100) で slide 1600x800 → 縦律 (scale=0.125)、stage=200x100", () => {
		// scaleX = 800/1600 = 0.5, scaleY = 100/800 = 0.125 → min = 0.125
		// displayW = 200, displayH = 100
		render(makeSlide(), 800, 100);
		const stage = container.querySelector<HTMLElement>("[data-slide-edit-stage]");
		expect(stage?.style.width).toBe("200px");
		expect(stage?.style.height).toBe("100px");
	});

	it("内側 transform は scale(scale) で transformOrigin top left", () => {
		render(makeSlide(), 800, 600);
		const stage = container.querySelector<HTMLElement>("[data-slide-edit-stage]");
		const scaledInner = stage?.firstElementChild as HTMLElement | null;
		expect(scaledInner?.style.transform).toBe("scale(0.5)");
		expect(scaledInner?.style.transformOrigin).toBe("top left");
		// scaled inner の width/height は native slide 寸法
		expect(scaledInner?.style.width).toBe("1600px");
		expect(scaledInner?.style.height).toBe("800px");
	});

	it("SlideView が内側に存在 (slide content 描画)", () => {
		render(makeSlide({ id: 42 }), 800, 600);
		// SlideView は data-slide-id を持つ
		expect(container.querySelector("[data-slide-id='42']")).not.toBeNull();
	});
});

describe("SlideEditView ドラッグ&ドロップ (v4 Group D D-11)", () => {
	it("drop overlay は既定で hidden、edit area への dragover で表示される", () => {
		render(makeSlide(), 800, 600);
		const overlay = container.querySelector<HTMLElement>("[data-slide-drop-overlay]");
		expect(overlay).not.toBeNull();
		// 既定 (ドラッグ無し) は display:none
		expect(overlay?.style.display).toBe("none");
		// edit area へ dragover → isOver=true → overlay 表示
		const area = container.querySelector<HTMLElement>("[data-slide-edit-area]");
		act(() => {
			area?.dispatchEvent(new Event("dragover", { bubbles: true, cancelable: true }));
		});
		expect(overlay?.style.display).toBe("flex");
	});
});
