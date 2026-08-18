import { afterEach, describe, expect, it, vi } from "vitest";
import { isMobileEnv } from "../../src/utils/mobileDetect";

// mobile 判定 (docs/mode-spec.md §2):
//   mobile UA OR viewport <= 900 → スマホモード自動切替の gate。
// PWA (standalone) 要件は課さない — mobile browser でも VIEW 固定にする方針。
// jsdom の innerWidth/Height / userAgent を差し替えて分岐を検証する。

const setUserAgent = (ua: string): void => {
	Object.defineProperty(navigator, "userAgent", { configurable: true, value: ua });
};

const setViewport = (w: number, h: number): void => {
	Object.defineProperty(window, "innerWidth", { configurable: true, value: w });
	Object.defineProperty(window, "innerHeight", { configurable: true, value: h });
};

const PC_UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15";
const IPHONE_UA = "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15";

describe("isMobileEnv", () => {
	afterEach(() => {
		vi.restoreAllMocks();
	});

	it("mobile UA は true (viewport が広くても UA で拾う)", () => {
		setUserAgent(IPHONE_UA);
		setViewport(1200, 800);
		expect(isMobileEnv()).toBe(true);
	});

	it("PC UA + small viewport は true (viewport で拾う)", () => {
		setUserAgent(PC_UA);
		setViewport(800, 600);
		expect(isMobileEnv()).toBe(true);
	});

	it("PC UA + 大 viewport は false (PC 通常環境)", () => {
		setUserAgent(PC_UA);
		setViewport(1920, 1080);
		expect(isMobileEnv()).toBe(false);
	});

	it("縦の innerHeight が 900 以下でも small 扱い (landscape lock 前提)", () => {
		setUserAgent(PC_UA);
		setViewport(1200, 700);
		expect(isMobileEnv()).toBe(true);
	});
});
