import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SlideshowShell } from "../../src/components/SlideshowShell";
import { useSlideStore } from "../../src/state/slideStore";
import { useSlideshowStore } from "../../src/state/slideshowStore";
import { useViewerDocumentStore } from "../../src/state/viewerDocumentStore";
import type { Slide } from "../../src/types/Slide";

// §9 スライドショー全画面シェルの UI 操作テスト (新エンジン useSlideshowPlayer ベース)。
// タイムライン詳細 (ループ/durationRatio/keep 等) は useSlideshowPlayer.test.tsx で担保。

function makeSlide(id: number, overrides: Partial<Slide> = {}): Slide {
	return {
		id,
		uuid: `slide-${id}`,
		width: 800,
		height: 600,
		durationRatio: 1,
		joining: false,
		disabled: false,
		layers: [],
		...overrides,
	};
}

let container: HTMLDivElement;
let root: Root;

const ss = (key: string): HTMLButtonElement | null =>
	container.querySelector<HTMLButtonElement>(`[data-ss="${key}"]`);

beforeEach(() => {
	container = document.createElement("div");
	document.body.appendChild(container);
	root = createRoot(container);
	useSlideStore.getState().setSlides([]);
	useViewerDocumentStore.getState().setDocument(null);
	// slideshow 設定をデフォルトへ (store はシングルトンなのでテスト間で持ち越さない)
	useSlideshowStore.setState({
		running: false,
		intervalMs: 6000,
		durationMs: 2000,
		flipX: false,
		flipY: false,
		startFullscreen: false,
	});
});

afterEach(() => {
	act(() => root.unmount());
	container.remove();
});

describe("SlideshowShell (§9)", () => {
	it("open=false で何も描画しない", () => {
		act(() => root.render(<SlideshowShell open={false} onClose={() => {}} />));
		expect(container.querySelector("button")).toBeNull();
	});

	it("有効スライドが無いとき メッセージ + close のみ", () => {
		const onClose = vi.fn();
		act(() => root.render(<SlideshowShell open={true} onClose={onClose} />));
		expect(container.textContent).toContain("スライドがありません");
		act(() => ss("close")?.dispatchEvent(new MouseEvent("click", { bubbles: true })));
		expect(onClose).toHaveBeenCalledTimes(1);
	});

	it("全 disabled も「有効スライド無し」扱い", () => {
		act(() =>
			useSlideStore
				.getState()
				.setSlides([makeSlide(1, { disabled: true }), makeSlide(2, { disabled: true })])
		);
		act(() => root.render(<SlideshowShell open={true} onClose={() => {}} />));
		expect(container.textContent).toContain("スライドがありません");
	});

	it("slides 投入で stage + コントロール表示、位置 1 / 3", () => {
		act(() => useSlideStore.getState().setSlides([makeSlide(1), makeSlide(2), makeSlide(3)]));
		act(() => root.render(<SlideshowShell open={true} onClose={() => {}} />));
		expect(container.textContent).toContain("1 / 3");
		expect(container.querySelector('[data-slide-id="1"]')).not.toBeNull();
		// ループするため prev/next は disabled にしない
		expect(ss("prev")?.disabled).toBeFalsy();
		expect(ss("next")?.disabled).toBeFalsy();
		expect(ss("fullscreen")).not.toBeNull();
		expect(ss("mirror-h")).not.toBeNull();
		expect(ss("mirror-v")).not.toBeNull();
	});

	it("next で位置が進む", () => {
		act(() => useSlideStore.getState().setSlides([makeSlide(1), makeSlide(2), makeSlide(3)]));
		act(() => root.render(<SlideshowShell open={true} onClose={() => {}} />));
		act(() => ss("next")?.dispatchEvent(new MouseEvent("click", { bubbles: true })));
		expect(container.textContent).toContain("2 / 3");
		expect(container.querySelector('[data-slide-id="2"]')).not.toBeNull();
	});

	it("disabled を除外して位置/総数に反映", () => {
		act(() =>
			useSlideStore
				.getState()
				.setSlides([makeSlide(1), makeSlide(2, { disabled: true }), makeSlide(3)])
		);
		act(() => root.render(<SlideshowShell open={true} onClose={() => {}} />));
		expect(container.textContent).toContain("1 / 2"); // 有効 2 枚
		act(() => ss("next")?.dispatchEvent(new MouseEvent("click", { bubbles: true })));
		expect(container.textContent).toContain("2 / 2");
		expect(container.querySelector('[data-slide-id="3"]')).not.toBeNull(); // disabled の 2 を飛ばす
	});

	it("stage は absolute + translate(-50%,-50%) 中央寄せ (狭い表示域でも中心がずれない)", () => {
		act(() => useSlideStore.getState().setSlides([makeSlide(1)]));
		act(() => root.render(<SlideshowShell open={true} onClose={() => {}} />));
		const stack = container.querySelector<HTMLElement>("[data-slideshow-stack]");
		expect(stack?.style.position).toBe("absolute");
		expect(stack?.style.left).toBe("50%");
		expect(stack?.style.top).toBe("50%");
		// flex 中央寄せ (unsafe-center) ではなく translate で明示中央寄せ
		expect(stack?.style.transform).toContain("translate(-50%, -50%)");
	});

	it("mirror-h クリックで store の flipX がトグルされる (状態反映 UI は無し)", () => {
		act(() => useSlideStore.getState().setSlides([makeSlide(1)]));
		act(() => root.render(<SlideshowShell open={true} onClose={() => {}} />));
		expect(useSlideshowStore.getState().flipX).toBe(false);
		act(() => ss("mirror-h")?.dispatchEvent(new MouseEvent("click", { bubbles: true })));
		expect(useSlideshowStore.getState().flipX).toBe(true);
	});
});
