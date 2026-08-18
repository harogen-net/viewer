import { MantineProvider } from "@mantine/core";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SlidePlaybackPanel } from "../../src/components/panels/SlidePlaybackPanel";
import { useHistoryStore } from "../../src/state/historyStore";
import { useSlideStore } from "../../src/state/slideStore";
import { useViewerDocumentStore } from "../../src/state/viewerDocumentStore";
import { useViewerModeStore, ViewerMode } from "../../src/state/viewerModeStore";
import type { Slide } from "../../src/types/Slide";
import { MAX_DURATION, MIN_DURATION } from "../../src/utils/slideOps";

// 閲覧モード (スマホ) の調整バー。選択中スライドの有効/無効・表示尺・結合を変更できる。
// 検証の主眼は「VIEW モードでもこの 3 種が実際に store へ届くこと」。gate 側の許可
// (mutationGates.test.tsx) と UI の結線が両方揃わないと機能しないため、ここは UI 経由で見る。

const makeSlide = (uuid: string, over: Partial<Slide> = {}): Slide => ({
	id: 1,
	uuid,
	width: 800,
	height: 600,
	durationRatio: 1,
	joining: false,
	disabled: false,
	layers: [],
	...over,
});

let container: HTMLDivElement;
let root: Root;

const render = (): void => {
	act(() => {
		root.render(
			<MantineProvider>
				<SlidePlaybackPanel />
			</MantineProvider>
		);
	});
};

const q = (sel: string): HTMLElement | null => container.querySelector<HTMLElement>(sel);
const click = (el: HTMLElement | null): void => {
	expect(el).not.toBeNull();
	act(() => {
		el?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
	});
};
/** checkbox / switch は input なので change を投げる (click では onChange が走らない環境がある)。 */
const toggle = (el: HTMLElement | null): void => {
	expect(el).not.toBeNull();
	act(() => {
		(el as HTMLInputElement).click();
	});
};

beforeEach(() => {
	vi.spyOn(console, "warn").mockImplementation(() => {});
	container = document.createElement("div");
	document.body.appendChild(container);
	root = createRoot(container);
	useSlideStore.getState().setSlides([]);
	useHistoryStore.getState().clear();
	useViewerDocumentStore.getState().setModified(false);
	// このバーは閲覧モード専用。VIEW で組む。
	useViewerModeStore.setState({ mode: ViewerMode.VIEW, isMobileEnv: true });
});

afterEach(() => {
	act(() => root.unmount());
	container.remove();
	useViewerModeStore.setState({ mode: ViewerMode.EDIT, isMobileEnv: false });
	vi.restoreAllMocks();
});

describe("SlidePlaybackPanel (閲覧モードの調整バー)", () => {
	it("スライドが無ければ何も描画しない (空のバーで縦を消費しない)", () => {
		render();
		expect(q("[data-slide-playback-panel]")).toBeNull();
	});

	it("未選択でもバーは出すが、操作はすべて無効", () => {
		useSlideStore.getState().setSlides([makeSlide("a")]);
		// setSlides は selectedIndex を -1 にリセットする (= 未選択)。
		render();

		expect(q("[data-slide-playback-panel]")).not.toBeNull();
		expect((q("[data-slide-playback-enabled]") as HTMLInputElement).disabled).toBe(true);
		expect((q("[data-slide-playback-joining]") as HTMLInputElement).disabled).toBe(true);
		expect((q('[data-slide-playback-duration="up"]') as HTMLButtonElement).disabled).toBe(true);
		expect((q('[data-slide-playback-duration="down"]') as HTMLButtonElement).disabled).toBe(true);
	});

	it("有効チェックの操作が VIEW モードでも slide に届く", () => {
		useSlideStore.getState().setSlides([makeSlide("a")]);
		useSlideStore.getState().setSelectedIndex(0);
		render();

		const check = q("[data-slide-playback-enabled]") as HTMLInputElement;
		expect(check.checked).toBe(true); // disabled=false → 有効
		toggle(check);
		expect(useSlideStore.getState().slides[0].disabled).toBe(true);

		toggle(q("[data-slide-playback-enabled]"));
		expect(useSlideStore.getState().slides[0].disabled).toBe(false);
	});

	it("結合スイッチの操作が VIEW モードでも slide に届く", () => {
		useSlideStore.getState().setSlides([makeSlide("a"), makeSlide("b")]);
		useSlideStore.getState().setSelectedIndex(0);
		render();

		const sw = q("[data-slide-playback-joining]") as HTMLInputElement;
		expect(sw.checked).toBe(false);
		toggle(sw);
		expect(useSlideStore.getState().slides[0].joining).toBe(true);
	});

	it("± で表示尺が段階的に変わり、値表示が追従する", () => {
		useSlideStore.getState().setSlides([makeSlide("a")]);
		useSlideStore.getState().setSelectedIndex(0);
		render();

		expect(q("[data-slide-playback-duration-value]")?.textContent).toBe("x1");

		click(q('[data-slide-playback-duration="up"]'));
		const up = useSlideStore.getState().slides[0].durationRatio;
		expect(up).toBeGreaterThan(1);
		expect(q("[data-slide-playback-duration-value]")?.textContent).toBe(`x${String(up).substr(0, 3)}`);

		click(q('[data-slide-playback-duration="down"]'));
		expect(useSlideStore.getState().slides[0].durationRatio).toBe(1);
	});

	// 上下限に張り付いたときにボタンが押せたままだと「押しても何も起きない」状態になる。
	it("表示尺が上下限のときは対応するボタンが無効", () => {
		useSlideStore.getState().setSlides([makeSlide("a", { durationRatio: MAX_DURATION })]);
		useSlideStore.getState().setSelectedIndex(0);
		render();
		expect((q('[data-slide-playback-duration="up"]') as HTMLButtonElement).disabled).toBe(true);
		expect((q('[data-slide-playback-duration="down"]') as HTMLButtonElement).disabled).toBe(false);

		act(() => {
			useSlideStore.getState().setSlides([makeSlide("a", { durationRatio: MIN_DURATION })]);
			useSlideStore.getState().setSelectedIndex(0);
		});
		expect((q('[data-slide-playback-duration="down"]') as HTMLButtonElement).disabled).toBe(true);
		expect((q('[data-slide-playback-duration="up"]') as HTMLButtonElement).disabled).toBe(false);
	});

	// 配置は PC (サムネ上のコントロール) に合わせる: 有効=左 / 表示尺=中央 / 結合=右。
	// 並びが入れ替わると PC と操作感が食い違うため、DOM 順で固定する。
	it("左から 有効 → 表示尺 → 結合 の順に並ぶ", () => {
		useSlideStore.getState().setSlides([makeSlide("a")]);
		useSlideStore.getState().setSelectedIndex(0);
		render();

		const marks = Array.from(
			container.querySelectorAll(
				"[data-slide-playback-enabled],[data-slide-playback-duration-value],[data-slide-playback-joining]"
			),
			(el) =>
				el.hasAttribute("data-slide-playback-enabled")
					? "enabled"
					: el.hasAttribute("data-slide-playback-joining")
						? "joining"
						: "duration"
		);
		expect(marks).toEqual(["enabled", "duration", "joining"]);
	});
});
