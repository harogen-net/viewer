import { beforeEach, describe, expect, it } from "vitest";
import {
	DURATION_DEFAULT_MS,
	INTERVAL_DEFAULT_MS,
	normalizeSlideshowSettings,
	normalizeTweenEase,
	resolveTweenTiming,
	SLIDESHOW_SETTINGS_DEFAULT,
	selectSlideshowSettings,
	TWEEN_EASE_DEFAULT,
	TWEEN_OFFSET_TOTAL_MAX_PERCENT,
	tweenEaseCss,
	useSlideshowStore,
} from "../../src/state/slideshowStore";

// 結合スライド tween のタイミング / イージング設定と、その localStorage 永続化。

const STORAGE_KEY = "slideshow.settings";

beforeEach(() => {
	localStorage.clear();
	useSlideshowStore.setState({ ...SLIDESHOW_SETTINGS_DEFAULT, running: false });
});

describe("resolveTweenTiming", () => {
	it("オフセット無しなら表示時間いっぱいを使って動く", () => {
		expect(resolveTweenTiming(1000, 0, 0)).toEqual({ delayMs: 0, animMs: 1000 });
	});

	it("前 20% / 後 40% なら delay 200ms、実アニメ 400ms (残り 400ms が後の静止)", () => {
		expect(resolveTweenTiming(1000, 20, 40)).toEqual({ delayMs: 200, animMs: 400 });
	});

	it("合計が 100% を超える値が来ても実アニメを 1ms は残す (0 で割らない)", () => {
		const t = resolveTweenTiming(1000, 80, 80);
		expect(t.delayMs).toBe(800);
		expect(t.animMs).toBe(1);
	});

	it("表示時間 0 でも破綻しない", () => {
		expect(resolveTweenTiming(0, 50, 50)).toEqual({ delayMs: 0, animMs: 1 });
	});
});

describe("normalizeTweenEase", () => {
	it("x は 0..1 にクランプし、小数 2 桁に丸める", () => {
		const e = normalizeTweenEase({ x1: -0.5, y1: 0, x2: 1.8, y2: 1 });
		expect(e.x1).toBe(0);
		expect(e.x2).toBe(1);
		expect(normalizeTweenEase({ x1: 0.12345, y1: 0, x2: 0.6789, y2: 1 })).toMatchObject({
			x1: 0.12,
			x2: 0.68,
		});
	});

	it("y は始点 0 / 終点 1 に固定される (制御点は左右にしか動かない)", () => {
		const e = normalizeTweenEase({ x1: 0.3, y1: -2, x2: 0.7, y2: 5 });
		expect(e.y1).toBe(0);
		expect(e.y2).toBe(1);
	});
});

describe("tweenEaseCss", () => {
	it("CSS の cubic-bezier() 文字列を作る", () => {
		expect(tweenEaseCss({ x1: 0.4, y1: 0, x2: 0.7, y2: 1 })).toBe("cubic-bezier(0.4, 0, 0.7, 1)");
	});
});

describe("normalizeSlideshowSettings", () => {
	it("欠損は既定値で埋める", () => {
		expect(normalizeSlideshowSettings({})).toEqual(SLIDESHOW_SETTINGS_DEFAULT);
		expect(normalizeSlideshowSettings(null)).toEqual(SLIDESHOW_SETTINGS_DEFAULT);
	});

	it("型違い / NaN は既定値へ倒す", () => {
		const s = normalizeSlideshowSettings({
			intervalMs: Number.NaN,
			durationMs: "abc" as unknown as number,
			flipX: 1 as unknown as boolean,
		});
		expect(s.intervalMs).toBe(INTERVAL_DEFAULT_MS);
		expect(s.durationMs).toBe(DURATION_DEFAULT_MS);
		expect(s.flipX).toBe(false);
	});

	it("前後オフセットは合計上限に収める (後ろを削る)", () => {
		const s = normalizeSlideshowSettings({ tweenPrePercent: 80, tweenPostPercent: 80 });
		expect(s.tweenPrePercent).toBe(80);
		expect(s.tweenPostPercent).toBe(TWEEN_OFFSET_TOTAL_MAX_PERCENT - 80);
	});

	it("負の値は 0 に、上限超えは上限に丸める", () => {
		expect(normalizeSlideshowSettings({ tweenPrePercent: -30 }).tweenPrePercent).toBe(0);
		expect(normalizeSlideshowSettings({ tweenPrePercent: 999 }).tweenPrePercent).toBe(
			TWEEN_OFFSET_TOTAL_MAX_PERCENT
		);
	});

	it("イージングの異常値も安全な値に正す", () => {
		const s = normalizeSlideshowSettings({
			tweenEase: { x1: 5, y1: 9, x2: Number.NaN, y2: -9 },
		});
		expect(s.tweenEase.x1).toBe(1);
		expect(s.tweenEase.x2).toBe(TWEEN_EASE_DEFAULT.x2); // NaN は既定へ
		expect(s.tweenEase.y1).toBe(0);
		expect(s.tweenEase.y2).toBe(1);
	});
});

describe("applySettings (設定モーダルの OK)", () => {
	it("store に反映し、localStorage へ保存する", () => {
		useSlideshowStore.getState().applySettings({
			...SLIDESHOW_SETTINGS_DEFAULT,
			intervalMs: 3000,
			tweenPrePercent: 15,
			tweenPostPercent: 25,
			tweenEase: { x1: 0.2, y1: 0, x2: 0.9, y2: 1 },
		});

		const s = useSlideshowStore.getState();
		expect(s.intervalMs).toBe(3000);
		expect(s.tweenPrePercent).toBe(15);
		expect(s.tweenPostPercent).toBe(25);
		expect(s.tweenEase).toEqual({ x1: 0.2, y1: 0, x2: 0.9, y2: 1 });

		const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "null");
		expect(saved).toMatchObject({ intervalMs: 3000, tweenPrePercent: 15, tweenPostPercent: 25 });
	});

	it("保存前に正規化されるので、壊れた値が永続化されない", () => {
		useSlideshowStore.getState().applySettings({
			...SLIDESHOW_SETTINGS_DEFAULT,
			tweenPrePercent: 500,
			tweenEase: { x1: -1, y1: 7, x2: 2, y2: -7 },
		});
		const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "null");
		expect(saved.tweenPrePercent).toBe(TWEEN_OFFSET_TOTAL_MAX_PERCENT);
		expect(saved.tweenEase).toEqual({ x1: 0, y1: 0, x2: 1, y2: 1 });
	});

	it("running などの実行状態は設定に含めない (保存対象は設定値のみ)", () => {
		useSlideshowStore.setState({ running: true });
		useSlideshowStore.getState().applySettings(SLIDESHOW_SETTINGS_DEFAULT);
		expect(useSlideshowStore.getState().running).toBe(true);
		expect(JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "{}")).not.toHaveProperty("running");
	});
});

describe("selectSlideshowSettings", () => {
	it("store から設定値だけを取り出す", () => {
		useSlideshowStore.setState({ running: true, intervalMs: 1234 });
		const s = selectSlideshowSettings();
		expect(s.intervalMs).toBe(1234);
		expect(s).not.toHaveProperty("running");
	});
});
