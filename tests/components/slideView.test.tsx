import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { SlideView } from "../../src/components/slide/SlideView";
import type { Slide } from "../../src/types/Slide";

// v4 Group C C-3R: SlideView は native 寸法描画のみを担う。
// 装飾 / スケールは別 FC (SlideThumbView) で受け持つ。

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

const getSlideEl = (): HTMLElement | null =>
	container.querySelector<HTMLElement>("[data-slide-id]");

describe("SlideView (v4 Group C C-3R, native render only)", () => {
	it("slide 寸法をそのまま (width × height) で描画", () => {
		act(() => {
			root.render(<SlideView slide={makeSlide()} />);
		});
		const el = getSlideEl();
		expect(el).not.toBeNull();
		expect(el?.style.width).toBe("1600px");
		expect(el?.style.height).toBe("800px");
	});

	it("bgColor 指定が反映される", () => {
		act(() => {
			root.render(<SlideView slide={makeSlide()} bgColor="#abcdef" />);
		});
		const el = getSlideEl();
		expect(el?.style.background).toContain("rgb(171, 205, 239)");
	});

	it("bgColor 未指定なら白", () => {
		act(() => {
			root.render(<SlideView slide={makeSlide()} />);
		});
		const el = getSlideEl();
		expect(el?.style.background).toContain("rgb(255, 255, 255)");
	});

	it("transform / scale は持たない (純粋 native)", () => {
		act(() => {
			root.render(<SlideView slide={makeSlide()} />);
		});
		const el = getSlideEl();
		expect(el?.style.transform).toBe("");
	});

	it("layers が描画される", () => {
		const slide = makeSlide({
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
					text: "hello",
				},
			],
		});
		act(() => {
			root.render(<SlideView slide={slide} />);
		});
		expect(container.textContent).toContain("hello");
	});
});
