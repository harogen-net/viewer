import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { SlideView } from "../../src/components/slide/SlideView";
import type { Slide } from "../../src/types/Slide";

// v4 Group C build C-2: SlideView mode prop の単体テスト。
// display (既存挙動 / Group A 互換) と thumb (新規追加) の両モードを検証。

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

describe("SlideView (v4 Group C build C-2)", () => {
	describe("mode='display' (default)", () => {
		it("mode 未指定で display モード、slide 寸法そのままの単一 div", () => {
			act(() => {
				root.render(<SlideView slide={makeSlide()} />);
			});
			const el = getSlideEl();
			expect(el).not.toBeNull();
			expect(el?.getAttribute("data-mode")).toBe("display");
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
	});

	describe("mode='thumb'", () => {
		it("外側ラッパーは thumbHeight (デフォルト 110) と縮尺幅", () => {
			// slide 1600x800, thumb 110 → scale = 110/800 = 0.1375, wrapper width = 1600 * 0.1375 = 220
			act(() => {
				root.render(<SlideView slide={makeSlide()} mode="thumb" />);
			});
			const wrapper = getSlideEl();
			expect(wrapper).not.toBeNull();
			expect(wrapper?.getAttribute("data-mode")).toBe("thumb");
			expect(wrapper?.style.height).toBe("110px");
			expect(wrapper?.style.width).toBe("220px");
		});

		it("内側 div は元寸法 + transform: scale(...)", () => {
			act(() => {
				root.render(<SlideView slide={makeSlide()} mode="thumb" />);
			});
			const wrapper = getSlideEl();
			const inner = wrapper?.firstElementChild as HTMLElement | null;
			expect(inner).not.toBeNull();
			expect(inner?.style.width).toBe("1600px");
			expect(inner?.style.height).toBe("800px");
			expect(inner?.style.transform).toBe("scale(0.1375)");
			expect(inner?.style.transformOrigin).toBe("top left");
		});

		it("thumbHeight カスタム指定で外側高さと scale が変わる", () => {
			act(() => {
				root.render(<SlideView slide={makeSlide()} mode="thumb" thumbHeight={80} />);
			});
			const wrapper = getSlideEl();
			expect(wrapper?.style.height).toBe("80px");
			// scale = 80/800 = 0.1, wrapper width = 160
			expect(wrapper?.style.width).toBe("160px");
			const inner = wrapper?.firstElementChild as HTMLElement | null;
			expect(inner?.style.transform).toBe("scale(0.1)");
		});
	});

	describe("layers 描画", () => {
		it("display モードで layers が描画される", () => {
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

		it("thumb モードでも layers が描画される (縮小ラッパー内)", () => {
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
						text: "thumb-text",
					},
				],
			});
			act(() => {
				root.render(<SlideView slide={slide} mode="thumb" />);
			});
			expect(container.textContent).toContain("thumb-text");
		});
	});
});
