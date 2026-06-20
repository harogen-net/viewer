import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SlideshowShell } from "../../src/components/SlideshowShell";
import { useSlideStore } from "../../src/state/slideStore";
import { useViewerDocumentStore } from "../../src/state/viewerDocumentStore";
import type { Slide } from "../../src/types/Slide";

// v3 Group A swap: SlideshowShell の主要 UI 操作テスト (§0-6 = 新側 vitest 同梱)。
// jsdom + React 18 createRoot で render し、DOM 直接検査でアサート。

function makeSlide(id: number, overrides: Partial<Slide> = {}): Slide {
	return {
		id,
		uuid: `slide-${id}`,
		width: 800,
		height: 600,
		durationRatio: 1,
		joining: true,
		disabled: false,
		layers: [],
		...overrides,
	};
}

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
	container = document.createElement("div");
	document.body.appendChild(container);
	root = createRoot(container);
	// store reset
	useSlideStore.getState().setSlides([]);
	useViewerDocumentStore.getState().setDocument(null);
});

afterEach(() => {
	act(() => root.unmount());
	container.remove();
});

describe("SlideshowShell (v3 Group A)", () => {
	it("open=false で何も描画しない", () => {
		act(() => {
			root.render(<SlideshowShell open={false} onClose={() => {}} />);
		});
		expect(container.querySelector("button")).toBeNull();
	});

	it("slides 空 + open=true でメッセージ + close ボタンのみ表示", () => {
		const onClose = vi.fn();
		act(() => {
			root.render(<SlideshowShell open={true} onClose={onClose} />);
		});
		expect(container.textContent).toContain("スライドがありません");
		const closeBtn = container.querySelector("button");
		expect(closeBtn).not.toBeNull();
		act(() => {
			closeBtn?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
		});
		expect(onClose).toHaveBeenCalledTimes(1);
	});

	it("slides 投入後 open=true で SlideView + コントロール表示", () => {
		act(() => {
			useSlideStore.getState().setSlides([makeSlide(1), makeSlide(2), makeSlide(3)]);
		});
		act(() => {
			root.render(<SlideshowShell open={true} onClose={() => {}} />);
		});
		// "1 / 3" 表示確認
		expect(container.textContent).toContain("1 / 3");
		// 各 slide が data-slide-id を持つ <div> として描画されているか
		expect(container.querySelector('[data-slide-id="1"]')).not.toBeNull();
		// prev ボタンは index=0 なので disabled
		const buttons = Array.from(container.querySelectorAll("button"));
		const prev = buttons.find((b) => b.textContent?.includes("prev"));
		expect(prev?.disabled).toBe(true);
		const next = buttons.find((b) => b.textContent?.includes("next"));
		expect(next?.disabled).toBe(false);
	});

	it("next ボタンで index が進む", () => {
		act(() => {
			useSlideStore.getState().setSlides([makeSlide(1), makeSlide(2), makeSlide(3)]);
		});
		act(() => {
			root.render(<SlideshowShell open={true} onClose={() => {}} />);
		});
		expect(container.textContent).toContain("1 / 3");

		const next = Array.from(container.querySelectorAll("button")).find((b) =>
			b.textContent?.includes("next"),
		);
		act(() => {
			next?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
		});
		expect(container.textContent).toContain("2 / 3");
		expect(container.querySelector('[data-slide-id="2"]')).not.toBeNull();
	});
});
