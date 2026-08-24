import { MantineProvider } from "@mantine/core";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { SlideshowSettingsModal } from "../../src/components/panels/SlideshowSettingsModal";
import {
	SLIDESHOW_SETTINGS_DEFAULT,
	useSlideshowStore,
} from "../../src/state/slideshowStore";

// §9 SlideshowSettingsModal: SlideShowOpsPanel から分離した設定 UI
// (interval / duration / 結合トランジション / flipX / flipY / 全画面で開始)。
// 編集は下書き方式で、OK を押すまで slideshowStore には反映されない。

const setUserAgent = (ua: string): void => {
	Object.defineProperty(navigator, "userAgent", { configurable: true, value: ua });
};
const IPHONE_UA = "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15";
const originalUa = navigator.userAgent;

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
	setUserAgent(originalUa);
	useSlideshowStore.setState({
		running: false,
		intervalMs: 6000,
		durationMs: 2000,
		flipX: false,
		flipY: false,
		startFullscreen: false,
	});
	localStorage.clear();
	container = document.createElement("div");
	document.body.appendChild(container);
	root = createRoot(container);
});

afterEach(() => {
	act(() => root.unmount());
	container.remove();
	setUserAgent(originalUa);
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

const clickOk = (): void => {
	const ok = op("ok");
	if (!ok) throw new Error("OK ボタンが見つからない");
	act(() => ok.click());
};

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

	it("flipX / flipY トグルは OK 押下で store に反映される", () => {
		render(true);
		const flipX = op("flip-x")?.querySelector<HTMLInputElement>("input");
		const flipY = op("flip-y")?.querySelector<HTMLInputElement>("input");
		if (!flipX || !flipY) throw new Error("flip switches not found");
		act(() => flipX.click());
		act(() => flipY.click());
		clickOk();
		expect(useSlideshowStore.getState().flipX).toBe(true);
		expect(useSlideshowStore.getState().flipY).toBe(true);
	});

	it("全画面で開始トグルは OK 押下で store に反映される", () => {
		render(true);
		const fs = op("fullscreen")?.querySelector<HTMLInputElement>("input");
		if (!fs) throw new Error("fullscreen switch not found");
		act(() => fs.click());
		clickOk();
		expect(useSlideshowStore.getState().startFullscreen).toBe(true);
	});

	it("mobile UA では 全画面で開始トグルを描画しない (iOS Safari で fullscreen 事実上不可)", () => {
		setUserAgent(IPHONE_UA);
		render(true);
		expect(op("fullscreen")).toBeNull();
		// 他の設定 UI は残っている
		expect(op("interval")).not.toBeNull();
		expect(op("flip-x")).not.toBeNull();
	});
});

// 下書き方式 (OK でのみ確定 + localStorage 保存)。
// 触っただけで再生中のアニメーションが変わらないことが要件なので、
// 「OK を押さなければ store は一切変わらない」を軸に確認する。
const STORAGE_KEY = "slideshow.settings";
const flipXInput = (): HTMLInputElement => {
	const el = op("flip-x")?.querySelector<HTMLInputElement>("input");
	if (!el) throw new Error("flipX スイッチが見つからない");
	return el;
};
const stored = (): Record<string, unknown> | null =>
	JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "null");

describe("SlideshowSettingsModal 下書きと保存", () => {
	it("OK を押さずに閉じたら store も localStorage も変わらない", () => {
		render(true);
		act(() => flipXInput().click());
		// OK を押さない = バックドロップ / Esc で閉じた場合と同じ
		expect(useSlideshowStore.getState().flipX).toBe(false);
		expect(stored()).toBeNull();
	});

	it("OK 押下で localStorage に保存される", () => {
		render(true);
		act(() => flipXInput().click());
		clickOk();
		expect(useSlideshowStore.getState().flipX).toBe(true);
		expect(stored()).toMatchObject({ flipX: true });
	});

	it("開き直すと下書きは現在値から作り直される (破棄した編集を持ち越さない)", () => {
		render(true);
		act(() => flipXInput().click());
		expect(flipXInput().checked).toBe(true);
		// 閉じて開き直す
		render(false);
		render(true);
		expect(flipXInput().checked).toBe(false);
	});

	it("リセットは下書きだけを既定値に戻す (OK までは store 不変)", () => {
		useSlideshowStore.setState({ intervalMs: 3000, flipX: true });
		render(true);
		const reset = op("reset-all");
		if (!reset) throw new Error("リセットボタンが見つからない");
		act(() => reset.click());

		// 表示は既定値になるが store はまだ 3000 / true
		expect(op("interval")?.textContent).toContain(String(SLIDESHOW_SETTINGS_DEFAULT.intervalMs));
		expect(useSlideshowStore.getState().intervalMs).toBe(3000);
		expect(useSlideshowStore.getState().flipX).toBe(true);
		expect(stored()).toBeNull();

		clickOk();
		expect(useSlideshowStore.getState().intervalMs).toBe(SLIDESHOW_SETTINGS_DEFAULT.intervalMs);
		expect(useSlideshowStore.getState().flipX).toBe(false);
		expect(stored()).toMatchObject({ intervalMs: SLIDESHOW_SETTINGS_DEFAULT.intervalMs });
	});

	it("すべて既定値ならリセットボタンは無効", () => {
		render(true);
		expect(op("reset-all")?.hasAttribute("disabled")).toBe(true);
	});

	it("既定値でない設定があればリセットボタンは有効", () => {
		useSlideshowStore.setState({ intervalMs: 3000 });
		render(true);
		expect(op("reset-all")?.hasAttribute("disabled")).toBe(false);
	});

	it("結合トランジションのカーブ編集 UI を持つ", () => {
		render(true);
		expect(document.body.querySelector("[data-tween-curve-editor]")).not.toBeNull();
		expect(document.body.querySelector('[data-tween-handle="pre"]')).not.toBeNull();
	});
});
