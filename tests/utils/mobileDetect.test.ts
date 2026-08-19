import { afterEach, describe, expect, it, vi } from "vitest";
import { isIosDevice, isMobileEnv } from "../../src/utils/mobileDetect";

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

// isIosDevice: スリープ抑止の回避策 (useNoSleepVideo) の適用範囲を決める判定。
// ここを誤ると「iOS で抑止が効かない」か「PC で無駄に動画を回す」のどちらかになる。
describe("isIosDevice", () => {
	const setTouchPoints = (n: number): void => {
		Object.defineProperty(navigator, "maxTouchPoints", { configurable: true, value: n });
	};

	afterEach(() => {
		vi.restoreAllMocks();
	});

	it("iPhone / iPad / iPod の UA は true", () => {
		for (const ua of [
			IPHONE_UA,
			"Mozilla/5.0 (iPad; CPU OS 17_0 like Mac OS X) AppleWebKit/605.1.15",
			"Mozilla/5.0 (iPod touch; CPU iPhone OS 15_0 like Mac OS X)",
		]) {
			setUserAgent(ua);
			setTouchPoints(5);
			expect(isIosDevice()).toBe(true);
		}
	});

	// iPadOS 13 以降の iPad は UA が Macintosh を名乗る。タッチ点数で Mac と区別する。
	it("Macintosh UA + タッチありは true (iPadOS の desktop UA)", () => {
		setUserAgent(PC_UA);
		setTouchPoints(5);
		expect(isIosDevice()).toBe(true);
	});

	it("Macintosh UA + タッチなしは false (デスクトップ Mac)", () => {
		setUserAgent(PC_UA);
		setTouchPoints(0);
		expect(isIosDevice()).toBe(false);
	});

	it("Android は false (Wake Lock が正しく効くため回避策は不要)", () => {
		setUserAgent("Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 Mobile");
		setTouchPoints(5);
		expect(isIosDevice()).toBe(false);
	});
});
