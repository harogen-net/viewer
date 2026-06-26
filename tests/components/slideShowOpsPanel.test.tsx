import { MantineProvider } from "@mantine/core";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { SlideShowOpsPanel } from "../../src/components/panels/SlideShowOpsPanel";
import { useSlideStore } from "../../src/state/slideStore";
import { useSlideshowStore } from "../../src/state/slideshowStore";
import type { Slide } from "../../src/types/Slide";

// §9 SlideShowOpsPanel: 実質スタートボタンのみ。
// 設定 (interval/duration/flipX/Y/全画面) は SlideshowSettingsModal へ移設
// (slideshowSettingsModal.test.tsx)。

const makeSlide = (id: number): Slide => ({
	id,
	uuid: `s-${id}`,
	width: 800,
	height: 600,
	durationRatio: 1,
	joining: false,
	disabled: false,
	layers: [],
});

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
	useSlideStore.getState().setSlides([]);
	useSlideshowStore.setState({
		running: false,
		intervalMs: 6000,
		durationMs: 2000,
		flipX: false,
		flipY: false,
		startFullscreen: false,
	});
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
				<SlideShowOpsPanel />
			</MantineProvider>
		);
	});
};

const op = (key: string): HTMLElement | null =>
	container.querySelector<HTMLElement>(`[data-ss-op="${key}"]`);

describe("SlideShowOpsPanel (§9)", () => {
	it("slides 無しでは開始ボタン disabled", () => {
		render();
		expect((op("start") as HTMLButtonElement | null)?.disabled).toBe(true);
	});

	it("slides ありで開始ボタンクリック → slideshowStore.running=true", () => {
		act(() => useSlideStore.getState().setSlides([makeSlide(1)]));
		render();
		const start = op("start") as HTMLButtonElement;
		expect(start.disabled).toBe(false);
		act(() => start.dispatchEvent(new MouseEvent("click", { bubbles: true })));
		expect(useSlideshowStore.getState().running).toBe(true);
	});

	it("設定 UI (interval/duration/flip/fullscreen) はパネルに無い (モーダルへ移設)", () => {
		render();
		expect(op("interval")).toBeNull();
		expect(op("duration")).toBeNull();
		expect(op("flip-x")).toBeNull();
		expect(op("flip-y")).toBeNull();
		expect(op("fullscreen")).toBeNull();
	});
});
