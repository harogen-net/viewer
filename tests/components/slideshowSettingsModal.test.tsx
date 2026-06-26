import { MantineProvider } from "@mantine/core";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { SlideshowSettingsModal } from "../../src/components/panels/SlideshowSettingsModal";
import { useSlideshowStore } from "../../src/state/slideshowStore";

// §9 SlideshowSettingsModal: SlideShowOpsPanel から分離した設定 UI
// (interval / duration / flipX / flipY / 全画面で開始)。設定値は slideshowStore。

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
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

const render = (opened: boolean): void => {
	act(() => {
		root.render(
			<MantineProvider>
				<SlideshowSettingsModal opened={opened} onClose={() => {}} />
			</MantineProvider>
		);
	});
};

// Modal はポータルで document.body 配下に描画されるため body 全体から探す。
const op = (key: string): HTMLElement | null =>
	document.body.querySelector<HTMLElement>(`[data-ss-op="${key}"]`);

describe("SlideshowSettingsModal (§9)", () => {
	it("opened=false では設定 UI を描画しない", () => {
		render(false);
		expect(op("interval")).toBeNull();
		expect(op("flip-x")).toBeNull();
	});

	it("interval / duration 入力欄が現在値を表示する", () => {
		useSlideshowStore.setState({ intervalMs: 3000, durationMs: 800 });
		render(true);
		expect(op("interval")?.querySelector<HTMLInputElement>("input")?.value).toContain("3000");
		expect(op("duration")?.querySelector<HTMLInputElement>("input")?.value).toContain("800");
	});

	it("flipX / flipY トグルで store が反転", () => {
		render(true);
		const flipX = op("flip-x")?.querySelector<HTMLInputElement>("input");
		const flipY = op("flip-y")?.querySelector<HTMLInputElement>("input");
		if (!flipX || !flipY) throw new Error("flip switches not found");
		act(() => flipX.click());
		expect(useSlideshowStore.getState().flipX).toBe(true);
		act(() => flipY.click());
		expect(useSlideshowStore.getState().flipY).toBe(true);
	});

	it("全画面で開始トグルで store.startFullscreen が反転", () => {
		render(true);
		const fs = op("fullscreen")?.querySelector<HTMLInputElement>("input");
		if (!fs) throw new Error("fullscreen switch not found");
		act(() => fs.click());
		expect(useSlideshowStore.getState().startFullscreen).toBe(true);
	});
});
