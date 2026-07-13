import { MantineProvider } from "@mantine/core";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DocumentPickerGrid } from "../../src/components/panels/DocumentPickerModal";
import type { StoredDocThumbnail, StoredSlideTitle } from "../../src/hooks/useStorage";

// DocumentPickerGrid (カード描画コア) の単体テスト。Modal を介さないので jsdom で素直に検証できる。
// サムネは遅延ロード (カード可視時に loadThumbnail を呼ぶ)。jsdom は IntersectionObserver 非対応の
// ため即ロードにフォールバックする → render 後に Promise を flush すれば strip/N/A が確定する。

const titles: StoredSlideTitle[] = [
	{ id: 1, title: "A", update: 3 },
	{ id: 2, title: "B", update: 2 },
	{ id: 3, title: "C", update: 1 },
];

// title→サムネ の map を非同期ローダーに変換 (未登録は null)。
const loaderFor =
	(map: Record<string, StoredDocThumbnail>) =>
	async (title: string): Promise<StoredDocThumbnail | null> =>
		map[title] ?? null;

let container: HTMLDivElement;
let root: Root;

const q = (sel: string): HTMLElement | null => container.querySelector<HTMLElement>(sel);
const click = (el: HTMLElement | null): void => {
	act(() => {
		el?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
	});
};

const render = async (props: Parameters<typeof DocumentPickerGrid>[0]): Promise<void> => {
	await act(async () => {
		root.render(
			<MantineProvider>
				<DocumentPickerGrid {...props} />
			</MantineProvider>
		);
	});
	// 遅延ロードの Promise (effect→loadThumbnail→setState) を flush。
	await act(async () => {
		await Promise.resolve();
		await Promise.resolve();
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
	it("各 title のカードが出る (サムネ有り=strip / 無し=N/A)", async () => {
		await render({
			titles,
			loadThumbnail: loaderFor({ A: { thumb: "data:image/jpeg;base64,T", frames: 3 } }), // B/C は無し
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

	it("ロード中はサムネ枠にスピナー、解決後に strip へ切り替わる", async () => {
		let resolveThumb: (v: StoredDocThumbnail | null) => void = () => {};
		const pending = new Promise<StoredDocThumbnail | null>((r) => {
			resolveThumb = r;
		});
		await render({
			titles: [{ id: 1, title: "A", update: 1 }],
			loadThumbnail: () => pending,
			selectedTitle: null,
			onPick: () => {},
		});
		// 未解決 → loading スピナー枠
		expect(q('[data-picker-item="A"] [data-thumb-state="loading"]')).not.toBeNull();
		expect(q('[data-picker-item="A"] [data-picker-thumb-loading]')).not.toBeNull();
		// 解決 → strip
		await act(async () => {
			resolveThumb({ thumb: "data:image/jpeg;base64,T", frames: 1 });
			await Promise.resolve();
		});
		expect(q('[data-picker-item="A"] [data-picker-thumb]')).not.toBeNull();
	});

	it("複数コマサムネはホバーでコマ送り、離脱で先頭へ戻る", async () => {
		await render({
			titles,
			loadThumbnail: loaderFor({ A: { thumb: "data:image/jpeg;base64,T", frames: 3 } }),
			selectedTitle: null,
			onPick: () => {},
		});
		const strip = q('[data-picker-item="A"] [data-picker-thumb]');
		expect(strip?.getAttribute("data-thumb-frame")).toBe("0");
		vi.useFakeTimers();
		try {
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

	it("1 コマサムネはホバーしてもコマ送りしない", async () => {
		await render({
			titles,
			loadThumbnail: loaderFor({ A: { thumb: "data:image/jpeg;base64,T", frames: 1 } }),
			selectedTitle: null,
			onPick: () => {},
		});
		const strip = q('[data-picker-item="A"] [data-picker-thumb]');
		vi.useFakeTimers();
		try {
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

	it("カードクリックで onPick(title) が呼ばれる", async () => {
		const onPick = vi.fn();
		await render({ titles, loadThumbnail: loaderFor({}), selectedTitle: null, onPick });
		click(q('[data-picker-item="B"]'));
		expect(onPick).toHaveBeenCalledWith("B");
	});

	it("選択中カードに data-selected=true", async () => {
		await render({ titles, loadThumbnail: loaderFor({}), selectedTitle: "B", onPick: () => {} });
		expect(q('[data-picker-item="B"]')?.getAttribute("data-selected")).toBe("true");
		expect(q('[data-picker-item="A"]')?.getAttribute("data-selected")).toBe("false");
	});

	it("空一覧は案内テキスト", async () => {
		await render({ titles: [], loadThumbnail: loaderFor({}), selectedTitle: null, onPick: () => {} });
		expect(container.textContent).toContain("保存済みドキュメントがありません");
		expect(container.querySelectorAll("[data-picker-item]").length).toBe(0);
	});

	it("isSensitive のカードにのみ 🔒 バッジが出る", async () => {
		await render({
			titles: [
				{ id: 1, title: "A", update: 2, isSensitive: true },
				{ id: 2, title: "B", update: 1 }, // 非センシティブ
			],
			loadThumbnail: loaderFor({ A: { thumb: "data:image/jpeg;base64,T", frames: 1 } }),
			selectedTitle: null,
			onPick: () => {},
		});
		expect(q('[data-picker-item="A"] [data-picker-sensitive]')).not.toBeNull();
		expect(q('[data-picker-item="B"] [data-picker-sensitive]')).toBeNull();
	});

	it("passwordEmpty=true: センシティブ文書は選択不可 (onPick 呼ばれない)、非センシティブは可", async () => {
		const onPick = vi.fn();
		await render({
			titles: [
				{ id: 1, title: "S", update: 2, isSensitive: true },
				{ id: 2, title: "N", update: 1 },
			],
			loadThumbnail: loaderFor({}),
			selectedTitle: null,
			onPick,
			passwordEmpty: true,
		});
		const s = q('[data-picker-item="S"]') as HTMLButtonElement | null;
		expect(s?.disabled).toBe(true);
		expect(s?.getAttribute("data-picker-locked")).toBe("true");
		expect(q('[data-picker-item="S"] [data-picker-locked-hint]')).not.toBeNull();
		click(s);
		expect(onPick).not.toHaveBeenCalled();
		// 非センシティブは無効化されない
		const n = q('[data-picker-item="N"]') as HTMLButtonElement | null;
		expect(n?.disabled).toBe(false);
		click(n);
		expect(onPick).toHaveBeenCalledWith("N");
	});

	it("passwordEmpty=false: センシティブ文書も選択できる", async () => {
		const onPick = vi.fn();
		await render({
			titles: [{ id: 1, title: "S", update: 1, isSensitive: true }],
			loadThumbnail: loaderFor({}),
			selectedTitle: null,
			onPick,
			passwordEmpty: false,
		});
		const s = q('[data-picker-item="S"]') as HTMLButtonElement | null;
		expect(s?.disabled).toBe(false);
		click(s);
		expect(onPick).toHaveBeenCalledWith("S");
	});
});
