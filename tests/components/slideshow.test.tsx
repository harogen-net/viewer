import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SlideshowShell } from "../../src/components/SlideshowShell";
import { useImageLibraryStore } from "../../src/state/imageLibraryStore";
import { useSlideStore } from "../../src/state/slideStore";
import { useSlideshowStore } from "../../src/state/slideshowStore";
import { useViewerDocumentStore } from "../../src/state/viewerDocumentStore";
import type { ImageLayer } from "../../src/types/Layer";
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

function imgLayer(id: number, imageId: string, o: Partial<ImageLayer> = {}): ImageLayer {
	return {
		id,
		uuid: `l-${id}`,
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
		type: "image",
		imageId,
		clipRect: [0, 0, 0, 0],
		isText: false,
		...o,
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

describe("SlideshowShell join keep tween (§9, transform/opacity/clip 補間)", () => {
	beforeEach(() => {
		useImageLibraryStore.setState({
			imageById: { X: { dataURL: "data:image/png;base64,AA", name: "x" } },
		});
		useSlideshowStore.setState({
			running: false,
			intervalMs: 1000,
			durationMs: 500,
			flipX: false,
			flipY: false,
			startFullscreen: false,
		});
	});
	afterEach(() => vi.useRealTimers());

	// A(joining, img X clip 0) → B(img X 移動+clip) は同一画像のため keep tween:
	// DOM を維持したまま transform / clip-path に transition を付け補間する (fade しない)。
	const setupKeepPair = (): void => {
		const A = makeSlide(1, {
			joining: true,
			layers: [imgLayer(1, "X", { clipRect: [0, 0, 0, 0] })],
		});
		const B = makeSlide(2, {
			layers: [imgLayer(2, "X", { transX: 100, transY: 50, clipRect: [10, 20, 30, 40] })],
		});
		act(() => useSlideStore.getState().setSlides([A, B]));
		act(() => root.render(<SlideshowShell open={true} onClose={() => {}} />));
	};

	it("keep advance: 同一 DOM のまま wrapper transform に transition、img clip-path を補間", () => {
		vi.useFakeTimers();
		setupKeepPair();
		const top = () => container.querySelector<HTMLElement>("[data-slideshow-top]");
		const wrapperBefore = top()?.querySelector<HTMLElement>("[data-layer-id]");
		const imgBefore = top()?.querySelector<HTMLImageElement>("img");
		expect(wrapperBefore?.style.transition).toBe(""); // 初回はクロスフェード = transition 無し
		expect(imgBefore?.style.clipPath).toContain("inset(0px 0px 0px 0px)"); // forceInset

		act(() => vi.advanceTimersByTime(1000)); // B へ自動進行 (keep)

		const wrapperAfter = top()?.querySelector<HTMLElement>("[data-layer-id]");
		const imgAfter = top()?.querySelector<HTMLImageElement>("img");
		// DOM ノードが維持される (= remount でなく transform 補間)
		expect(wrapperAfter).toBe(wrapperBefore);
		expect(imgAfter).toBe(imgBefore);
		// 新スライドの transform に変化 + transition 付与
		expect(wrapperAfter?.style.transform).toContain("translate(100px, 50px)");
		expect(wrapperAfter?.style.transition).toContain("transform");
		expect(wrapperAfter?.style.transition).toContain("opacity");
		// clip-path も補間値 + transition
		expect(imgAfter?.style.clipPath).toContain("inset(10px 20px 30px 40px)");
		expect(imgAfter?.style.transition).toContain("clip-path");
		// keep 中はクロスフェード (under) しない
		expect(container.querySelector("[data-slideshow-under]")).toBeNull();
	});

	it("keep advance ではトップフレームに fade アニメーションを付けない", () => {
		vi.useFakeTimers();
		setupKeepPair();
		act(() => vi.advanceTimersByTime(1000));
		const top = container.querySelector<HTMLElement>("[data-slideshow-top]");
		expect(top?.style.animation === "" || top?.style.animation == null).toBe(true);
	});
});
