import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { SlideEditView } from "../../src/components/slide/SlideEditView";
import {
	useEditViewStore,
	ZOOM_DEFAULT,
	ZOOM_MAX,
	ZOOM_MIN,
	ZOOM_STEP,
} from "../../src/state/editViewStore";
import type { Slide } from "../../src/types/Slide";

// v4 Group D D-7: ズーム (function-list §4 ズームイン/アウト/全体表示)。
// editViewStore のズーム actions と、SlideEditView 側で
// 実効 scale = fit-to-area scale × zoom が反映されること + コントロール操作を検証。

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

describe("editViewStore (v4 Group D D-7)", () => {
	beforeEach(() => {
		act(() => useEditViewStore.getState().showAll());
	});

	it("初期値は ZOOM_DEFAULT (=1.0)", () => {
		expect(useEditViewStore.getState().zoom).toBe(ZOOM_DEFAULT);
	});

	it("zoomIn は ×ZOOM_STEP、zoomOut は ÷ZOOM_STEP", () => {
		act(() => useEditViewStore.getState().zoomIn());
		expect(useEditViewStore.getState().zoom).toBeCloseTo(ZOOM_DEFAULT * ZOOM_STEP);
		act(() => useEditViewStore.getState().zoomOut());
		expect(useEditViewStore.getState().zoom).toBeCloseTo(ZOOM_DEFAULT);
	});

	it("showAll で ZOOM_DEFAULT に戻る", () => {
		act(() => useEditViewStore.getState().setZoom(3));
		act(() => useEditViewStore.getState().showAll());
		expect(useEditViewStore.getState().zoom).toBe(ZOOM_DEFAULT);
	});

	it("setZoom は [ZOOM_MIN, ZOOM_MAX] に clamp される", () => {
		act(() => useEditViewStore.getState().setZoom(100));
		expect(useEditViewStore.getState().zoom).toBe(ZOOM_MAX);
		act(() => useEditViewStore.getState().setZoom(0.001));
		expect(useEditViewStore.getState().zoom).toBe(ZOOM_MIN);
	});

	it("非有限値は ZOOM_DEFAULT にフォールバック", () => {
		act(() => useEditViewStore.getState().setZoom(Number.NaN));
		expect(useEditViewStore.getState().zoom).toBe(ZOOM_DEFAULT);
	});
});

describe("SlideEditView ズーム反映 (v4 Group D D-7)", () => {
	let container: HTMLDivElement;
	let root: Root;

	beforeEach(() => {
		act(() => useEditViewStore.getState().showAll());
		container = document.createElement("div");
		document.body.appendChild(container);
		root = createRoot(container);
	});

	afterEach(() => {
		act(() => root.unmount());
		container.remove();
		act(() => useEditViewStore.getState().showAll());
	});

	const render = (slide: Slide, w: number, h: number): void => {
		act(() => {
			root.render(<SlideEditView slide={slide} fitAreaWidth={w} fitAreaHeight={h} />);
		});
	};

	it("zoom=1.0 では fit-to-area scale そのまま (800x600 / 1600x800 → stage 800x400)", () => {
		render(makeSlide(), 800, 600);
		const stage = container.querySelector<HTMLElement>("[data-slide-edit-stage]");
		expect(stage?.style.width).toBe("800px");
		expect(stage?.style.height).toBe("400px");
	});

	it("ズームインボタンで実効 scale が ×1.1 され stage が拡大 (800→880)", () => {
		render(makeSlide(), 800, 600);
		const btn = container.querySelector<HTMLButtonElement>('[data-zoom-op="zoom-in"]');
		act(() => btn?.dispatchEvent(new MouseEvent("click", { bubbles: true })));
		const stage = container.querySelector<HTMLElement>("[data-slide-edit-stage]");
		// 1600 * (0.5 * 1.1) = 880
		expect(stage?.style.width).toBe("880px");
		expect(stage?.style.height).toBe("440px");
	});

	it("全体表示 (%表示クリック) でズームをリセット", () => {
		render(makeSlide(), 800, 600);
		const zoomIn = container.querySelector<HTMLButtonElement>('[data-zoom-op="zoom-in"]');
		act(() => zoomIn?.dispatchEvent(new MouseEvent("click", { bubbles: true })));
		act(() => zoomIn?.dispatchEvent(new MouseEvent("click", { bubbles: true })));
		const showAll = container.querySelector<HTMLButtonElement>('[data-zoom-op="show-all"]');
		act(() => showAll?.dispatchEvent(new MouseEvent("click", { bubbles: true })));
		const stage = container.querySelector<HTMLElement>("[data-slide-edit-stage]");
		expect(stage?.style.width).toBe("800px");
	});

	it("ズーム%表示が現在の zoom を反映", () => {
		render(makeSlide(), 800, 600);
		const label = container.querySelector<HTMLElement>('[data-zoom-op="show-all"]');
		expect(label?.textContent).toBe("100%");
		const zoomIn = container.querySelector<HTMLButtonElement>('[data-zoom-op="zoom-in"]');
		act(() => zoomIn?.dispatchEvent(new MouseEvent("click", { bubbles: true })));
		expect(label?.textContent).toBe("110%");
	});

	it("wheel 下スクロール (deltaY>0) で縮小、上スクロールで拡大", () => {
		render(makeSlide(), 800, 600);
		const outer = container.querySelector<HTMLElement>("[data-slide-edit-area]");
		// deltaY>0 → scale /= 1.1 → zoom 0.909...
		act(() => outer?.dispatchEvent(new WheelEvent("wheel", { deltaY: 120, bubbles: true })));
		expect(useEditViewStore.getState().zoom).toBeCloseTo(1 / 1.1);
		act(() => useEditViewStore.getState().showAll());
		// deltaY<0 → scale /= 0.9 → zoom 1.111...
		act(() => outer?.dispatchEvent(new WheelEvent("wheel", { deltaY: -120, bubbles: true })));
		expect(useEditViewStore.getState().zoom).toBeCloseTo(1 / 0.9);
	});
});
