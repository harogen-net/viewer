import { createElement, type FC } from "react";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useNoSleepVideo } from "../../src/hooks/useNoSleepVideo";

// useNoSleepVideo: Screen Wake Lock が効かない iOS 向けに、無音ループ動画を再生して
// スリープを抑止する回避策。
//
// 「実際にスリープを防げたか」はテストできない (実機依存かつ効く保証も無い)。
// ここで守るのは、その手前の条件:
//   - iOS 以外では動かさない (無駄に動画を回さない)
//   - iOS の自動再生要件 (muted + playsinline) を満たす
//   - 自動再生が拒否されてもユーザー操作で再試行する
//   - 終了時に確実に片付ける (再生しっぱなしにしない)

const W: FC<{ active: boolean }> = ({ active }) => {
	useNoSleepVideo(active);
	return null;
};

const IPHONE_UA =
	"Mozilla/5.0 (iPhone; CPU iPhone OS 17_7 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1";
const PC_UA =
	"Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36";

let container: HTMLDivElement;
let root: Root;
let playMock: ReturnType<typeof vi.fn>;
let pauseMock: ReturnType<typeof vi.fn>;

const setUA = (ua: string, maxTouchPoints = 5): void => {
	Object.defineProperty(navigator, "userAgent", { value: ua, configurable: true });
	Object.defineProperty(navigator, "maxTouchPoints", { value: maxTouchPoints, configurable: true });
};

const render = (active: boolean): void => {
	act(() => {
		root.render(createElement(W, { active }));
	});
};

const videoEl = (): HTMLVideoElement | null =>
	document.querySelector<HTMLVideoElement>("video[data-nosleep]");

beforeEach(() => {
	container = document.createElement("div");
	document.body.appendChild(container);
	root = createRoot(container);
	// jsdom の HTMLMediaElement は play/pause/load が未実装 (呼ぶと例外) なのでモックする。
	playMock = vi.fn().mockResolvedValue(undefined);
	pauseMock = vi.fn();
	Object.defineProperty(HTMLMediaElement.prototype, "play", {
		value: playMock,
		configurable: true,
	});
	Object.defineProperty(HTMLMediaElement.prototype, "pause", {
		value: pauseMock,
		configurable: true,
	});
	Object.defineProperty(HTMLMediaElement.prototype, "load", {
		value: vi.fn(),
		configurable: true,
	});
	setUA(IPHONE_UA);
});

afterEach(() => {
	act(() => root.unmount());
	container.remove();
});

describe("useNoSleepVideo", () => {
	it("iOS では動画を差し込んで再生する", () => {
		render(true);
		const v = videoEl();
		expect(v).not.toBeNull();
		expect(playMock).toHaveBeenCalled();
	});

	// playsinline が無いと iOS はインライン再生しない (全画面プレイヤーへ持っていかれる)。
	it("playsinline を付ける", () => {
		render(true);
		expect(videoEl()?.hasAttribute("playsinline")).toBe(true);
	});

	// iOS 17 では「完全にミュートされた動画はスリープ抑止の対象外」という挙動が報告されている。
	// そのため意図的にミュートしない (動画側の音声トラックが無音なので音は出ない)。
	// ミュートに戻すと抑止が効かなくなる可能性があるため、退行として検出する。
	it("ミュートしない (無音トラックで音を出さない方式)", () => {
		render(true);
		expect(videoEl()?.muted).toBe(false);
	});

	// loop での繰り返しは「一旦再生が終わった」扱いになり抑止が切れる余地がある。
	// 末尾に到達させず、手前で巻き戻して再生を継続させる方式にしている。
	it("loop は使わず、末尾手前で巻き戻す", () => {
		render(true);
		const v = videoEl();
		expect(v?.loop).toBe(false);

		// jsdom は duration/currentTime を自前で持たないので差し替える。
		let t = 0;
		Object.defineProperty(v as HTMLVideoElement, "duration", {
			value: 5,
			configurable: true,
		});
		Object.defineProperty(v as HTMLVideoElement, "currentTime", {
			get: () => t,
			set: (v2: number) => {
				t = v2;
			},
			configurable: true,
		});

		// 末尾手前 (5 - 0.5 = 4.5) を超えていなければ触らない。
		t = 4.0;
		act(() => {
			v?.dispatchEvent(new Event("timeupdate"));
		});
		expect(t).toBe(4.0);

		// 超えたら先頭付近 (0〜0.5) へ戻す。末尾には到達させない。
		t = 4.8;
		act(() => {
			v?.dispatchEvent(new Event("timeupdate"));
		});
		expect(t).toBeGreaterThanOrEqual(0);
		expect(t).toBeLessThan(0.5);
	});

	it("配信 base 配下の nosleep.mp4 を参照する", () => {
		render(true);
		expect(videoEl()?.getAttribute("src")).toMatch(/nosleep\.mp4$/);
	});

	// 隠し方に透明度・遮蔽・display を使わない。いずれも「描画省略 = 再生していない」と
	// 見なされる余地があり、抑止が効かなくなる。黒地に黒の 2px で見えなくする方式を守る。
	it("透明度や display:none で隠さない (描画省略の最適化を避ける)", () => {
		render(true);
		const s = videoEl()?.style;
		expect(s?.display).not.toBe("none");
		expect(s?.visibility).not.toBe("hidden");
		// opacity は未指定 (= 不透明) のまま。
		expect(s?.opacity === "" || Number(s?.opacity) === 1).toBe(true);
		// 他要素の下に隠さない (スライドショー UI より前面)。
		expect(Number(s?.zIndex)).toBeGreaterThan(10000);
	});

	// Wake Lock が正しく効くプラットフォームで動画を回すのは電力の無駄。
	it("iOS 以外では何もしない", () => {
		setUA(PC_UA, 0);
		render(true);
		expect(videoEl()).toBeNull();
		expect(playMock).not.toHaveBeenCalled();
	});

	it("active=false では何もしない", () => {
		render(false);
		expect(videoEl()).toBeNull();
	});

	// 消し忘れると、スライドショーを抜けた後も動画が回り続ける。
	it("active=false へ戻すと停止して要素を取り除く", () => {
		render(true);
		expect(videoEl()).not.toBeNull();
		render(false);
		expect(videoEl()).toBeNull();
		expect(pauseMock).toHaveBeenCalled();
	});

	it("アンマウントでも停止して要素を取り除く", () => {
		render(true);
		act(() => root.unmount());
		expect(videoEl()).toBeNull();
		expect(pauseMock).toHaveBeenCalled();
		root = createRoot(container); // afterEach の unmount 用に作り直す
	});

	// 自動再生が拒否される環境があるため、ユーザー操作を掴んで取り直す。
	it("自動再生が拒否されたらユーザー操作で再試行する", async () => {
		playMock.mockRejectedValue(new Error("NotAllowedError"));
		render(true);
		await act(async () => {});
		expect(playMock).toHaveBeenCalledTimes(1);

		act(() => {
			document.dispatchEvent(new Event("pointerdown", { bubbles: true }));
		});
		expect(playMock).toHaveBeenCalledTimes(2);
	});

	// バックグラウンドから戻ると一時停止したままになることがある。
	it("可視復帰で再生し直す", () => {
		render(true);
		playMock.mockClear();
		Object.defineProperty(document, "visibilityState", {
			get: () => "visible",
			configurable: true,
		});
		act(() => {
			document.dispatchEvent(new Event("visibilitychange"));
		});
		expect(playMock).toHaveBeenCalled();
	});
});
