import { createElement, type FC } from "react";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useWakeLock } from "../../src/hooks/useWakeLock";

// useWakeLock: active の間だけ Screen Wake Lock を保持し、可視復帰で再取得するフック。
// jsdom には navigator.wakeLock が無いので、request/sentinel をモックして検証する。

const W: FC<{ active: boolean }> = ({ active }) => {
	useWakeLock(active);
	return null;
};

let container: HTMLDivElement;
let root: Root;
let requestMock: ReturnType<typeof vi.fn>;
let releaseMock: ReturnType<typeof vi.fn>;
let releaseListener: (() => void) | undefined;
let visibility: "visible" | "hidden";

const render = async (active: boolean): Promise<void> => {
	await act(async () => {
		root.render(createElement(W, { active }));
	});
	await act(async () => {}); // acquire() の async 解決を流す
};

beforeEach(() => {
	container = document.createElement("div");
	document.body.appendChild(container);
	root = createRoot(container);
	visibility = "visible";
	Object.defineProperty(document, "visibilityState", {
		get: () => visibility,
		configurable: true,
	});
	releaseListener = undefined;
	releaseMock = vi.fn().mockResolvedValue(undefined);
	const sentinel = {
		release: releaseMock,
		addEventListener: vi.fn((_ev: string, cb: () => void) => {
			releaseListener = cb;
		}),
	};
	requestMock = vi.fn().mockResolvedValue(sentinel);
	Object.defineProperty(navigator, "wakeLock", {
		value: { request: requestMock },
		configurable: true,
	});
});

afterEach(() => {
	act(() => root.unmount());
	container.remove();
	Object.defineProperty(navigator, "wakeLock", { value: undefined, configurable: true });
});

describe("useWakeLock", () => {
	it("active=true で screen wake lock を取得する", async () => {
		await render(true);
		expect(requestMock).toHaveBeenCalledTimes(1);
		expect(requestMock).toHaveBeenCalledWith("screen");
	});

	it("active=false へ変わると sentinel を解放する", async () => {
		await render(true);
		expect(requestMock).toHaveBeenCalledTimes(1);
		await render(false);
		expect(releaseMock).toHaveBeenCalledTimes(1);
	});

	it("アンマウントで sentinel を解放する", async () => {
		await render(true);
		act(() => root.unmount());
		await act(async () => {});
		expect(releaseMock).toHaveBeenCalledTimes(1);
	});

	it("navigator.wakeLock 非対応環境では何もしない (no-op)", async () => {
		Object.defineProperty(navigator, "wakeLock", { value: undefined, configurable: true });
		await render(true);
		expect(requestMock).not.toHaveBeenCalled();
	});

	it("不可視の間は取得せず、可視復帰で取得する", async () => {
		visibility = "hidden";
		await render(true);
		expect(requestMock).not.toHaveBeenCalled(); // 不可視では取りにいかない
		await act(async () => {
			visibility = "visible";
			document.dispatchEvent(new Event("visibilitychange"));
		});
		await act(async () => {});
		expect(requestMock).toHaveBeenCalledTimes(1);
	});

	it("OS 自動解放後、可視復帰で再取得する", async () => {
		await render(true);
		expect(requestMock).toHaveBeenCalledTimes(1);
		// バックグラウンド遷移等での OS 自動解放をシミュレート (sentinel の release イベント)。
		act(() => releaseListener?.());
		await act(async () => {
			document.dispatchEvent(new Event("visibilitychange")); // visible のまま復帰通知
		});
		await act(async () => {});
		expect(requestMock).toHaveBeenCalledTimes(2);
	});

	// 可視のまま解放されるケース (iOS のホーム画面 Web App など) では取り直す。
	// visibilitychange を挟まないので、release ハンドラ自身の再取得だけが効く経路。
	it("可視のまま解放されたら取り直す", async () => {
		await render(true);
		expect(requestMock).toHaveBeenCalledTimes(1);

		act(() => releaseListener?.());
		await act(async () => {});
		expect(requestMock).toHaveBeenCalledTimes(2);
	});

	// 「取得 → 即解放」が続くプラットフォームで無限ループにならないこと。
	// 上限が無いと request と release を延々繰り返してバッテリーを食う。
	it("可視のままの再取得は上限で打ち止めになる", async () => {
		await render(true);
		expect(requestMock).toHaveBeenCalledTimes(1);

		// 解放が延々続く状況を模す。上限 (3 回) を超えても止まること。
		for (let i = 0; i < 10; i++) {
			act(() => releaseListener?.());
			await act(async () => {});
		}
		// 初回 1 + 再取得 3 = 4 で打ち止め。
		expect(requestMock).toHaveBeenCalledTimes(4);
	});

	// 可視復帰は正常な経路なので、再取得の予算を使い切っていても回復する。
	it("可視復帰で再取得の予算が戻る", async () => {
		await render(true);
		for (let i = 0; i < 10; i++) {
			act(() => releaseListener?.());
			await act(async () => {});
		}
		expect(requestMock).toHaveBeenCalledTimes(4); // 上限まで消費済み

		await act(async () => {
			document.dispatchEvent(new Event("visibilitychange"));
		});
		await act(async () => {});
		expect(requestMock).toHaveBeenCalledTimes(5);
	});
});
