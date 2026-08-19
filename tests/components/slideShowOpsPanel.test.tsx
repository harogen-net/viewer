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

// スリープ抑止の動画は「開始ボタンのクリック内」で再生を始める必要がある。
// ミュートしないメディアの play() はユーザー操作のコールスタック内でしか通らないため、
// SlideshowShell の effect (操作の後に走る) 任せにすると拒否され得る。
describe("SlideShowOpsPanel スリープ抑止の起動経路", () => {
	const IPHONE_UA =
		"Mozilla/5.0 (iPhone; CPU iPhone OS 17_7 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1";
	const PC_UA =
		"Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36";

	const setUA = (ua: string, maxTouchPoints: number): void => {
		Object.defineProperty(navigator, "userAgent", { value: ua, configurable: true });
		Object.defineProperty(navigator, "maxTouchPoints", {
			value: maxTouchPoints,
			configurable: true,
		});
	};

	const clickStart = (): void => {
		act(() => useSlideStore.getState().setSlides([makeSlide(1)]));
		render();
		act(() =>
			(op("start") as HTMLButtonElement).dispatchEvent(new MouseEvent("click", { bubbles: true }))
		);
	};

	const nosleepEl = (): Element | null => document.querySelector("video[data-nosleep]");

	beforeEach(() => {
		// jsdom の HTMLMediaElement は play/pause/load が未実装 (呼ぶと例外) なのでモックする。
		Object.defineProperty(HTMLMediaElement.prototype, "play", {
			value: () => Promise.resolve(),
			configurable: true,
		});
		Object.defineProperty(HTMLMediaElement.prototype, "pause", {
			value: () => {},
			configurable: true,
		});
		Object.defineProperty(HTMLMediaElement.prototype, "load", {
			value: () => {},
			configurable: true,
		});
	});

	afterEach(() => {
		nosleepEl()?.remove();
		setUA(PC_UA, 0);
	});

	it("iOS では開始クリックのうちに動画を差し込む", () => {
		setUA(IPHONE_UA, 5);
		clickStart();
		expect(nosleepEl()).not.toBeNull();
		expect(useSlideshowStore.getState().running).toBe(true);
	});

	it("iOS 以外では動画を差し込まない (再生は開始する)", () => {
		setUA(PC_UA, 0);
		clickStart();
		expect(nosleepEl()).toBeNull();
		expect(useSlideshowStore.getState().running).toBe(true);
	});
});
