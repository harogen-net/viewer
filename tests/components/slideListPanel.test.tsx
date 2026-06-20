import { MantineProvider } from "@mantine/core";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { SlideListPanel } from "../../src/components/panels/SlideListPanel";
import { useSlideStore } from "../../src/state/slideStore";
import { useViewerDocumentStore } from "../../src/state/viewerDocumentStore";
import type { Slide } from "../../src/types/Slide";

// v4 Group C build C-3: SlideListPanel 基本形のテスト (一覧表示 + 選択 + 視覚状態)。

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

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
	useSlideStore.getState().setSlides([]);
	useViewerDocumentStore.getState().setDocument(null);
	container = document.createElement("div");
	document.body.appendChild(container);
	root = createRoot(container);
});

afterEach(() => {
	act(() => root.unmount());
	container.remove();
});

const render = (): void => {
	act(() => {
		root.render(
			<MantineProvider>
				<SlideListPanel />
			</MantineProvider>,
		);
	});
};

describe("SlideListPanel (v4 Group C build C-3)", () => {
	it("slides 空のとき empty メッセージを表示", () => {
		render();
		expect(container.textContent).toContain("スライドがありません");
	});

	it("3 slides で 3 個の thumb item が data-slide-index 付きで描画される", () => {
		useSlideStore.getState().setSlides([
			makeSlide(1, "a"),
			makeSlide(2, "b"),
			makeSlide(3, "c"),
		]);
		render();
		const items = container.querySelectorAll<HTMLElement>("[data-slide-index]");
		expect(items.length).toBe(3);
		expect(items[0].getAttribute("data-slide-index")).toBe("0");
		expect(items[2].getAttribute("data-slide-index")).toBe("2");
	});

	it("選択中 slide は data-selected=true、それ以外は false", () => {
		useSlideStore.getState().setSlides([
			makeSlide(1, "a"),
			makeSlide(2, "b"),
		]);
		useSlideStore.getState().setSelectedIndex(1);
		render();
		const items = container.querySelectorAll<HTMLElement>("[data-slide-index]");
		expect(items[0].getAttribute("data-selected")).toBe("false");
		expect(items[1].getAttribute("data-selected")).toBe("true");
	});

	it("disabled slide は data-disabled=true、opacity が下がる", () => {
		useSlideStore.getState().setSlides([
			makeSlide(1, "a", { disabled: false }),
			makeSlide(2, "b", { disabled: true }),
		]);
		render();
		const items = container.querySelectorAll<HTMLElement>("[data-slide-index]");
		expect(items[0].getAttribute("data-disabled")).toBe("false");
		expect(items[1].getAttribute("data-disabled")).toBe("true");
		expect(items[1].style.opacity).toBe("0.35");
	});

	it("thumb クリックで selectedIndex が変わる", () => {
		useSlideStore.getState().setSlides([
			makeSlide(1, "a"),
			makeSlide(2, "b"),
			makeSlide(3, "c"),
		]);
		render();
		const items = container.querySelectorAll<HTMLElement>("[data-slide-index]");
		act(() => {
			items[2].dispatchEvent(new MouseEvent("click", { bubbles: true }));
		});
		expect(useSlideStore.getState().selectedIndex).toBe(2);
	});

	it("joining=true で接続線 (data-join=true) が隣接間に出る", () => {
		useSlideStore.getState().setSlides([
			makeSlide(1, "a", { joining: true }),
			makeSlide(2, "b", { joining: false }),
			makeSlide(3, "c"),
		]);
		render();
		const joins = container.querySelectorAll<HTMLElement>("[data-join]");
		// 末尾以外の slide 数 = 2 個の indicator
		expect(joins.length).toBe(2);
		expect(joins[0].getAttribute("data-join")).toBe("true");
		expect(joins[1].getAttribute("data-join")).toBe("false");
	});

	it("末尾 slide の後ろには join indicator が出ない", () => {
		useSlideStore.getState().setSlides([makeSlide(1, "a")]);
		render();
		const joins = container.querySelectorAll<HTMLElement>("[data-join]");
		expect(joins.length).toBe(0);
	});

	it("選択未設定 (-1) なら status text に '/ selected' が出ない", () => {
		useSlideStore.getState().setSlides([makeSlide(1, "a")]);
		render();
		expect(container.textContent).toContain("1 slides");
		expect(container.textContent).not.toContain("selected:");
	});

	it("選択あり時は selected #N を表示 (1-indexed)", () => {
		useSlideStore.getState().setSlides([makeSlide(1, "a"), makeSlide(2, "b")]);
		useSlideStore.getState().setSelectedIndex(1);
		render();
		expect(container.textContent).toContain("selected: #2");
	});
});
