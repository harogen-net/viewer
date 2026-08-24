import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { TweenCurveEditor } from "../../src/components/panels/slideshow/TweenCurveEditor";
import { type TweenEase, TWEEN_EASE_DEFAULT } from "../../src/state/slideshowStore";

// 結合トランジションのカーブ編集 UI。
// 押さえるのは「4 つのハンドルがあり、いずれも左右にしか動かないこと」。
// 制御点の y を固定しているのがカーブが折れない (進捗が単調になる) 根拠なので、
// ドラッグで y が動かないことを明示的に確認する。
//
// jsdom の getBoundingClientRect は 0 を返すため、SVG の実寸を stub して座標変換を成立させる。

// TweenCurveEditor 内の viewBox と同じ値 (座標変換の前提)。
const W = 320;
const H = 160;
const PAD_X = 18;
const PLOT_W = W - PAD_X * 2;
/** 図の左端からの割合 (0..1) を clientX に変換。 */
const xToClient = (ratio: number): number => PAD_X + ratio * PLOT_W;

let container: HTMLDivElement;
let root: Root;
let preCalls: number[];
let postCalls: number[];
let easeCalls: TweenEase[];

beforeEach(() => {
	preCalls = [];
	postCalls = [];
	easeCalls = [];
	container = document.createElement("div");
	document.body.appendChild(container);
	root = createRoot(container);
});

afterEach(() => {
	act(() => root.unmount());
	container.remove();
});

const render = (
	opts: { pre?: number; post?: number; ease?: TweenEase } = {}
): void => {
	act(() => {
		root.render(
			<TweenCurveEditor
				prePercent={opts.pre ?? 0}
				postPercent={opts.post ?? 0}
				ease={opts.ease ?? TWEEN_EASE_DEFAULT}
				onChangePre={(v) => preCalls.push(v)}
				onChangePost={(v) => postCalls.push(v)}
				onChangeEase={(e) => easeCalls.push(e)}
			/>
		);
	});
	// 座標変換のため実寸を stub (viewBox と 1:1 に対応させる)。
	const svg = container.querySelector<SVGSVGElement>("[data-tween-curve-svg]");
	if (!svg) throw new Error("svg が見つからない");
	svg.getBoundingClientRect = () =>
		({ left: 0, top: 0, width: W, height: H, right: W, bottom: H, x: 0, y: 0 }) as DOMRect;
};

const handle = (name: string): Element => {
	const el = container.querySelector(`[data-tween-handle="${name}"]`);
	if (!el) throw new Error(`handle ${name} が見つからない`);
	return el;
};
const svgEl = (): Element => {
	const el = container.querySelector("[data-tween-curve-svg]");
	if (!el) throw new Error("svg が見つからない");
	return el;
};

const firePointer = (
	el: Element,
	type: "pointerdown" | "pointermove" | "pointerup",
	clientX: number,
	clientY = 0
): void => {
	const ev = new Event(type, { bubbles: true, cancelable: true });
	Object.defineProperty(ev, "clientX", { value: clientX });
	Object.defineProperty(ev, "clientY", { value: clientY });
	Object.defineProperty(ev, "pointerId", { value: 1 });
	act(() => {
		el.dispatchEvent(ev);
	});
};

/** ハンドルを掴んで図の指定割合の位置まで動かす。 */
const drag = (name: string, toRatio: number, clientY = 0): void => {
	firePointer(handle(name), "pointerdown", xToClient(0.5), clientY);
	firePointer(svgEl(), "pointermove", xToClient(toRatio), clientY);
	firePointer(svgEl(), "pointerup", xToClient(toRatio), clientY);
};

describe("TweenCurveEditor", () => {
	it("起点 / 終点 / 制御点 2 つの 4 ハンドルを持つ", () => {
		render();
		for (const n of ["pre", "post", "p1", "p2"]) {
			expect(container.querySelector(`[data-tween-handle="${n}"]`)).not.toBeNull();
		}
	});

	it("起点のドラッグで前オフセット (%) を通知する", () => {
		render();
		drag("pre", 0.25);
		expect(preCalls.at(-1)).toBeCloseTo(25, 5);
		expect(postCalls).toEqual([]);
	});

	it("終点のドラッグでは「右端からの距離」が後オフセットになる", () => {
		render();
		drag("post", 0.7);
		expect(postCalls.at(-1)).toBeCloseTo(30, 5);
		expect(preCalls).toEqual([]);
	});

	it("制御点 P1 のドラッグは x1 だけを変え、y は動かさない (左右移動のみ)", () => {
		render();
		// clientY を大きく動かしても y は変わらないこと
		drag("p1", 0.25, 999);
		const e = easeCalls.at(-1);
		expect(e?.x1).toBeCloseTo(0.25, 5);
		expect(e?.y1).toBe(0);
		expect(e?.y2).toBe(1);
		// x2 は触っていない
		expect(e?.x2).toBe(TWEEN_EASE_DEFAULT.x2);
	});

	it("制御点 P2 のドラッグは x2 だけを変える", () => {
		render();
		drag("p2", 0.8, -999);
		const e = easeCalls.at(-1);
		expect(e?.x2).toBeCloseTo(0.8, 5);
		expect(e?.x1).toBe(TWEEN_EASE_DEFAULT.x1);
		expect(e?.y1).toBe(0);
		expect(e?.y2).toBe(1);
	});

	it("制御点の x はアニメ区間の相対値になる (前後オフセットの影響を受ける)", () => {
		// 前 20% / 後 20% → アニメ区間は 0.2..0.8。図の 0.5 は区間の中央 = 0.5
		render({ pre: 20, post: 20 });
		drag("p1", 0.5);
		expect(easeCalls.at(-1)?.x1).toBeCloseTo(0.5, 5);
	});

	it("制御点の x は 0..1 にクランプされる (CSS の cubic-bezier の制約)", () => {
		render({ pre: 20, post: 20 });
		drag("p1", 0); // アニメ区間より左
		expect(easeCalls.at(-1)?.x1).toBe(0);
		drag("p2", 1); // アニメ区間より右
		expect(easeCalls.at(-1)?.x2).toBe(1);
	});

	it("掴んでいない状態の pointermove では何も通知しない", () => {
		render();
		firePointer(svgEl(), "pointermove", xToClient(0.5));
		expect(preCalls).toEqual([]);
		expect(postCalls).toEqual([]);
		expect(easeCalls).toEqual([]);
	});

	it("pointerup 後の pointermove では通知しない (掴みが解除されている)", () => {
		render();
		drag("pre", 0.25);
		const before = preCalls.length;
		firePointer(svgEl(), "pointermove", xToClient(0.9));
		expect(preCalls.length).toBe(before);
	});
});
