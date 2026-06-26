import { MantineProvider } from "@mantine/core";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DocumentPickerGrid } from "../../src/components/panels/DocumentPickerModal";
import type { StoredSlideTitle } from "../../src/hooks/useStorage";

// DocumentPickerGrid (カード描画コア) の単体テスト。Modal を介さないので jsdom で素直に検証できる
// (Modal ラッパーはアニメーション付きで、描画ロジックはここで担保する)。

const titles: StoredSlideTitle[] = [
	{ id: 1, title: "A", update: 3 },
	{ id: 2, title: "B", update: 2 },
	{ id: 3, title: "C", update: 1 },
];

let container: HTMLDivElement;
let root: Root;

const q = (sel: string): HTMLElement | null => container.querySelector<HTMLElement>(sel);
const click = (el: HTMLElement | null): void => {
	act(() => {
		el?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
	});
};

const render = (props: Parameters<typeof DocumentPickerGrid>[0]): void => {
	act(() => {
		root.render(
			<MantineProvider>
				<DocumentPickerGrid {...props} />
			</MantineProvider>
		);
	});
};

beforeEach(() => {
	container = document.createElement("div");
	document.body.appendChild(container);
	root = createRoot(container);
});

afterEach(() => {
	act(() => root.unmount());
	container.remove();
});

describe("DocumentPickerGrid", () => {
	it("各 title のカードが出る (サムネ有り=strip / 無し=N/A)", () => {
		render({
			titles,
			thumbnails: { A: { thumb: "data:image/jpeg;base64,T", frames: 3 } }, // B/C はサムネ無し
			selectedTitle: null,
			onPick: () => {},
		});
		expect(container.querySelectorAll("[data-picker-item]").length).toBe(3);
		const aThumb = q('[data-picker-item="A"] [data-picker-thumb]');
		expect(aThumb).not.toBeNull();
		expect(aThumb?.getAttribute("data-thumb-frames")).toBe("3");
		expect(q('[data-picker-item="B"] [data-picker-na]')).not.toBeNull();
		expect(q('[data-picker-item="C"] [data-picker-na]')).not.toBeNull();
	});

	it("複数コマサムネはホバーでコマ送り、離脱で先頭へ戻る", () => {
		vi.useFakeTimers();
		try {
			render({
				titles,
				thumbnails: { A: { thumb: "data:image/jpeg;base64,T", frames: 3 } },
				selectedTitle: null,
				onPick: () => {},
			});
			const strip = q('[data-picker-item="A"] [data-picker-thumb]');
			expect(strip?.getAttribute("data-thumb-frame")).toBe("0");
			act(() => {
				strip?.dispatchEvent(new MouseEvent("mouseover", { bubbles: true }));
			});
			act(() => {
				vi.advanceTimersByTime(600);
			});
			expect(strip?.getAttribute("data-thumb-frame")).toBe("1");
			act(() => {
				vi.advanceTimersByTime(600);
			});
			expect(strip?.getAttribute("data-thumb-frame")).toBe("2");
			act(() => {
				strip?.dispatchEvent(new MouseEvent("mouseout", { bubbles: true }));
			});
			expect(strip?.getAttribute("data-thumb-frame")).toBe("0"); // 離脱で先頭
		} finally {
			vi.useRealTimers();
		}
	});

	it("1 コマサムネはホバーしてもコマ送りしない", () => {
		vi.useFakeTimers();
		try {
			render({
				titles,
				thumbnails: { A: { thumb: "data:image/jpeg;base64,T", frames: 1 } },
				selectedTitle: null,
				onPick: () => {},
			});
			const strip = q('[data-picker-item="A"] [data-picker-thumb]');
			act(() => {
				strip?.dispatchEvent(new MouseEvent("mouseover", { bubbles: true }));
			});
			act(() => {
				vi.advanceTimersByTime(1800);
			});
			expect(strip?.getAttribute("data-thumb-frame")).toBe("0");
		} finally {
			vi.useRealTimers();
		}
	});

	it("カードクリックで onPick(title) が呼ばれる", () => {
		const onPick = vi.fn();
		render({ titles, thumbnails: {}, selectedTitle: null, onPick });
		click(q('[data-picker-item="B"]'));
		expect(onPick).toHaveBeenCalledWith("B");
	});

	it("選択中カードに data-selected=true", () => {
		render({ titles, thumbnails: {}, selectedTitle: "B", onPick: () => {} });
		expect(q('[data-picker-item="B"]')?.getAttribute("data-selected")).toBe("true");
		expect(q('[data-picker-item="A"]')?.getAttribute("data-selected")).toBe("false");
	});

	it("空一覧は案内テキスト", () => {
		render({ titles: [], thumbnails: {}, selectedTitle: null, onPick: () => {} });
		expect(container.textContent).toContain("保存済みドキュメントがありません");
		expect(container.querySelectorAll("[data-picker-item]").length).toBe(0);
	});
});
