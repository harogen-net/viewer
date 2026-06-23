import { act, useState } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { NumberAdjustInput } from "../../src/components/common/NumberAdjustInput";

// v4 Group D D-10: NumberAdjustInput (§12 入力欄での値調整) 単体テスト。
// Enter 反映 / ↑↓ 増減 / ホイール増減 / clamp / multiply / focus-blur コールバック。

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
	container = document.createElement("div");
	document.body.appendChild(container);
	root = createRoot(container);
});
afterEach(() => {
	act(() => root.unmount());
	container.remove();
});

interface HarnessProps {
	initial: number;
	step?: number;
	multiply?: boolean;
	min?: number;
	max?: number;
	shiftStep?: number;
	invert?: boolean;
	onStart?: () => void;
	onEnd?: () => void;
}

// value を state で持ち onAdjust で更新する制御ハーネス (live binding 再現)。
const lastValue = { v: 0 };
const Harness = ({ initial, step = 1, multiply, min, max, shiftStep, invert, onStart, onEnd }: HarnessProps) => {
	const [v, setV] = useState(initial);
	lastValue.v = v;
	return (
		<NumberAdjustInput
			value={v}
			step={step}
			multiply={multiply}
			min={min}
			max={max}
			shiftStep={shiftStep}
			invert={invert}
			dataAdjust="t"
			onAdjust={(n) => {
				setV(n);
				lastValue.v = n;
			}}
			onAdjustStart={onStart}
			onAdjustEnd={onEnd}
		/>
	);
};

const renderHarness = (props: HarnessProps): HTMLInputElement => {
	act(() => root.render(<Harness {...props} />));
	const el = container.querySelector<HTMLInputElement>('[data-adjust="t"]');
	if (!el) throw new Error("input not found");
	return el;
};

const key = (el: HTMLInputElement, k: string): void => {
	act(() => el.dispatchEvent(new KeyboardEvent("keydown", { key: k, bubbles: true })));
};
const setInput = (el: HTMLInputElement, value: string): void => {
	const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
	setter?.call(el, value);
	el.dispatchEvent(new Event("input", { bubbles: true }));
};

describe("NumberAdjustInput (v4 Group D D-10, §12)", () => {
	it("↑ で step 増、↓ で step 減 (加算モード)", () => {
		const el = renderHarness({ initial: 10, step: 1 });
		key(el, "ArrowUp");
		expect(lastValue.v).toBe(11);
		key(el, "ArrowDown");
		key(el, "ArrowDown");
		expect(lastValue.v).toBe(9);
	});

	it("multiply モードは ↑ ×(1+step) / ↓ ÷(1+step) (legacy parity)", () => {
		const el = renderHarness({ initial: 2, step: 0.1, multiply: true });
		key(el, "ArrowUp");
		expect(lastValue.v).toBeCloseTo(2.2); // 2 * 1.1
		key(el, "ArrowDown");
		expect(lastValue.v).toBeCloseTo(2.2 / 1.1); // ÷1.1 (= 2.0)、×0.9 ではない
	});

	it("Enter で入力文字列を parse して反映", () => {
		const el = renderHarness({ initial: 0, step: 1 });
		setInput(el, "42.5");
		key(el, "Enter");
		expect(lastValue.v).toBe(42.5);
	});

	it("min / max で clamp", () => {
		const el = renderHarness({ initial: 0.2, step: 1, min: 0.1, max: 5 });
		// ↓ で 0.2-1 = -0.8 → clamp 0.1
		key(el, "ArrowDown");
		expect(lastValue.v).toBe(0.1);
		// Enter で 100 → clamp 5
		setInput(el, "100");
		key(el, "Enter");
		expect(lastValue.v).toBe(5);
	});

	it("ホイール: フォーカス中は 上スクロール=増 / 下スクロール=減", () => {
		const el = renderHarness({ initial: 10, step: 1 });
		// フォーカスしないと無効
		act(() => el.dispatchEvent(new WheelEvent("wheel", { deltaY: -100, bubbles: true })));
		expect(lastValue.v).toBe(10);
		// focus 後は有効
		act(() => el.dispatchEvent(new FocusEvent("focusin", { bubbles: true })));
		act(() => el.dispatchEvent(new WheelEvent("wheel", { deltaY: -100, bubbles: true })));
		expect(lastValue.v).toBe(11);
		act(() => el.dispatchEvent(new WheelEvent("wheel", { deltaY: 100, bubbles: true })));
		expect(lastValue.v).toBe(10);
	});

	it("focus で onAdjustStart、blur で onAdjustEnd が呼ばれる", () => {
		let started = 0;
		let ended = 0;
		const el = renderHarness({
			initial: 0,
			step: 1,
			onStart: () => started++,
			onEnd: () => ended++,
		});
		act(() => el.dispatchEvent(new FocusEvent("focusin", { bubbles: true })));
		expect(started).toBe(1);
		act(() => el.dispatchEvent(new FocusEvent("focusout", { bubbles: true })));
		expect(ended).toBe(1);
	});

	it("shiftStep 指定なら Shift+↑↓ は shiftStep の増減量 (25→100)", () => {
		const el = renderHarness({ initial: 0, step: 25, shiftStep: 100 });
		act(() => el.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowUp", shiftKey: true, bubbles: true })));
		expect(lastValue.v).toBe(100);
		act(() => el.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowDown", shiftKey: true, bubbles: true })));
		expect(lastValue.v).toBe(0);
		// Shift なしは通常 step (25)
		act(() => el.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowUp", bubbles: true })));
		expect(lastValue.v).toBe(25);
	});

	it("shiftStep 指定なら Shift+ホイールも shiftStep (フォーカス中)", () => {
		const el = renderHarness({ initial: 0, step: 25, shiftStep: 100 });
		act(() => el.dispatchEvent(new FocusEvent("focusin", { bubbles: true })));
		act(() => el.dispatchEvent(new WheelEvent("wheel", { deltaY: -100, shiftKey: true, bubbles: true })));
		expect(lastValue.v).toBe(100);
	});

	it("invert=true で ↑ が減・↓ が増 (legacy 位置 v:-25 相当)", () => {
		const el = renderHarness({ initial: 100, step: 25, invert: true });
		key(el, "ArrowUp");
		expect(lastValue.v).toBe(75); // ↑ で -25
		key(el, "ArrowDown");
		expect(lastValue.v).toBe(100); // ↓ で +25
	});

	it("invert=true はホイールも反転 (上スクロール=減)", () => {
		const el = renderHarness({ initial: 100, step: 25, invert: true });
		act(() => el.dispatchEvent(new FocusEvent("focusin", { bubbles: true })));
		act(() => el.dispatchEvent(new WheelEvent("wheel", { deltaY: -100, bubbles: true })));
		expect(lastValue.v).toBe(75); // 上スクロール=減
	});

	it("shiftStep 未指定なら Shift は無視 (通常 step)", () => {
		const el = renderHarness({ initial: 0, step: 5 });
		act(() => el.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowUp", shiftKey: true, bubbles: true })));
		expect(lastValue.v).toBe(5);
	});

	it("外部 value 変化はフォーカス外なら表示に同期", () => {
		const el = renderHarness({ initial: 5, step: 1 });
		key(el, "ArrowUp"); // 6 に反映 → state 更新 → 表示同期
		expect(el.value).toBe("6");
	});
});
