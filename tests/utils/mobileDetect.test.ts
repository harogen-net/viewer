import { afterEach, describe, expect, it, vi } from "vitest";
import { isIosDevice, isMobileEnv } from "../../src/utils/mobileDetect";

// mobile 判定 (docs/mode-spec.md §2):
//   携帯端末の UA、または Mac を名乗るタッチ端末 (iPadOS) → スマホモード自動切替の gate。
// PWA (standalone) 要件は課さない — mobile browser でも VIEW 固定にする方針。
// **ウィンドウサイズは判定に使わない** (§2.1)。jsdom の userAgent / maxTouchPoints を差し替えて検証する。

const setUserAgent = (ua: string): void => {
	Object.defineProperty(navigator, "userAgent", { configurable: true, value: ua });
};

const setViewport = (w: number, h: number): void => {
	Object.defineProperty(window, "innerWidth", { configurable: true, value: w });
	Object.defineProperty(window, "innerHeight", { configurable: true, value: h });
};

const setTouchPoints = (n: number): void => {
	Object.defineProperty(navigator, "maxTouchPoints", { configurable: true, value: n });
};

const PC_UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15";
// macOS Safari の実 UA。iOS Safari と違い `Mobile/xxx` トークンを持たない点が判定の要。
const MAC_SAFARI_UA =
	"Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15";
const IPHONE_UA = "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15";
// Android タブレットは UA に `Mobile` を持たない (スマホは持つ)。`Android` 側で拾う必要がある。
const ANDROID_TABLET_UA =
	"Mozilla/5.0 (Linux; Android 13; SM-X700) AppleWebKit/537.36 (KHTML, like Gecko) Safari/537.36";

describe("isMobileEnv", () => {
	afterEach(() => {
		vi.restoreAllMocks();
	});

	it("mobile UA は true", () => {
		setUserAgent(IPHONE_UA);
		setTouchPoints(5);
		expect(isMobileEnv()).toBe(true);
	});

	it("Android タブレット (Mobile トークンなし) も true", () => {
		setUserAgent(ANDROID_TABLET_UA);
		setTouchPoints(5);
		expect(isMobileEnv()).toBe(true);
	});

	// iPadOS 13+ と iOS の「デスクトップ用サイトを表示」は UA が Mac と同一になる。
	it("Mac UA + タッチありは true (iPadOS の desktop UA)", () => {
		setUserAgent(MAC_SAFARI_UA);
		setTouchPoints(5);
		expect(isMobileEnv()).toBe(true);
	});

	it("デスクトップ Mac は false", () => {
		setUserAgent(MAC_SAFARI_UA);
		setTouchPoints(0);
		expect(isMobileEnv()).toBe(false);
	});

	// 回帰: 以前は「幅か高さが 900px 以下なら携帯」としており、ノート PC の macOS Safari が
	// スマホモードで起動していた。ウィンドウサイズは判定に入れない。
	it("ウィンドウが小さくてもデスクトップは PC のまま (サイズを見ない)", () => {
		setUserAgent(MAC_SAFARI_UA);
		setTouchPoints(0);
		for (const [w, h] of [
			[800, 600],
			[1200, 700],
			[1920, 880],
		]) {
			setViewport(w, h);
			expect(isMobileEnv()).toBe(false);
		}
	});

	it("ウィンドウが大きくても携帯端末は スマホのまま (サイズを見ない)", () => {
		setUserAgent(IPHONE_UA);
		setTouchPoints(5);
		setViewport(1920, 1080);
		expect(isMobileEnv()).toBe(true);
	});
});

// isIosDevice: スリープ抑止の回避策 (useNoSleepVideo) の適用範囲を決める判定。
// ここを誤ると「iOS で抑止が効かない」か「PC で無駄に動画を回す」のどちらかになる。
describe("isIosDevice", () => {
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
