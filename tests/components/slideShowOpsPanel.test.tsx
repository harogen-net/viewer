import { MantineProvider } from "@mantine/core";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { SlideShowOpsPanel } from "../../src/components/panels/SlideShowOpsPanel";
import { useSlideStore } from "../../src/state/slideStore";
import { useSlideshowStore } from "../../src/state/slideshowStore";
import type { Slide } from "../../src/types/Slide";

// §9 SlideShowOpsPanel: 開始ボタン + interval/duration + flipX/Y + 全画面 設定 UI。

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

	it("flipX / flipY トグルで store が反転", () => {
		act(() => useSlideStore.getState().setSlides([makeSlide(1)]));
		render();
		const flipX = op("flip-x")?.querySelector<HTMLInputElement>("input");
		const flipY = op("flip-y")?.querySelector<HTMLInputElement>("input");
		if (!flipX || !flipY) throw new Error("flip switches not found");
		act(() => flipX.click());
		expect(useSlideshowStore.getState().flipX).toBe(true);
		act(() => flipY.click());
		expect(useSlideshowStore.getState().flipY).toBe(true);
	});

	it("全画面で開始トグルで store.startFullscreen が反転", () => {
		render();
		const fs = op("fullscreen")?.querySelector<HTMLInputElement>("input");
		if (!fs) throw new Error("fullscreen switch not found");
		act(() => fs.click());
		expect(useSlideshowStore.getState().startFullscreen).toBe(true);
	});

	it("interval / duration 入力欄が現在値を表示する", () => {
		useSlideshowStore.setState({ intervalMs: 3000, durationMs: 800 });
		render();
		const interval = op("interval")?.querySelector<HTMLInputElement>("input");
		const duration = op("duration")?.querySelector<HTMLInputElement>("input");
		expect(interval?.value).toContain("3000");
		expect(duration?.value).toContain("800");
	});
});
