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
});
