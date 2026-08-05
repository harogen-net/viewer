import { createElement, type FC } from "react";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { useAppSession } from "../../src/hooks/useAppSession";
import { useAppLockStore } from "../../src/state/appLockStore";
import { useSlideshowStore } from "../../src/state/slideshowStore";
import { AppLockStatus } from "../../src/types/AppLock";

// useAppSession: SESSION_TIMEOUT_MS (state/appLockStore.ts) が 0 (現在の既定値) のときの挙動。
// 実機で試した結果、猶予 (セッションの延長/キャッシュ) は不要と判断し 0 にした。
// 0 のときは延長/ポーリングの類を一切走らせず、バックグラウンド遷移を検知した瞬間に即ロックする
// (セッション導入前の useAppRelock と同じ挙動)。
//
// SESSION_TIMEOUT_MS > 0 (セッション方式) の分岐は tests/hooks/useAppSessionTimeout.test.tsx で
// 定数をモックして検証している (このファイルでは実際の定数 = 0 のままテストする)。

const W: FC<{ active: boolean }> = ({ active }) => {
	useAppSession(active);
	return null;
};

let container: HTMLDivElement;
let root: Root;
let visibility: "visible" | "hidden";

const render = (active: boolean): void => {
	act(() => {
		root.render(createElement(W, { active }));
	});
};

const seedUnlocked = (): void => {
	useAppLockStore.setState({ status: AppLockStatus.UNLOCKED, record: null, failureCount: 0 });
};

const statusNow = (): string => useAppLockStore.getState().status;

beforeEach(() => {
	container = document.createElement("div");
	document.body.appendChild(container);
	root = createRoot(container);
	visibility = "visible";
	Object.defineProperty(document, "visibilityState", {
		get: () => visibility,
		configurable: true,
	});
	useSlideshowStore.setState({ running: false });
	seedUnlocked();
});

afterEach(() => {
	act(() => root.unmount());
	container.remove();
	useAppLockStore.setState({ status: AppLockStatus.DISABLED, record: null, failureCount: 0 });
	useSlideshowStore.setState({ running: false });
});

describe("useAppSession (SESSION_TIMEOUT_MS = 0、猶予なし即ロック)", () => {
	it("hidden への遷移で即ロックする", () => {
		render(true);
		act(() => {
			visibility = "hidden";
			document.dispatchEvent(new Event("visibilitychange"));
		});
		expect(statusNow()).toBe(AppLockStatus.LOCKED);
	});

	it("visible のままの visibilitychange ではロックしない", () => {
		render(true);
		act(() => {
			document.dispatchEvent(new Event("visibilitychange"));
		});
		expect(statusNow()).toBe(AppLockStatus.UNLOCKED);
	});

	it("pagehide でロックする (bfcache 退避で visibilitychange が来ないケース)", () => {
		render(true);
		act(() => {
			window.dispatchEvent(new Event("pagehide"));
		});
		expect(statusNow()).toBe(AppLockStatus.LOCKED);
	});

	it("freeze でロックする (hidden を見逃した場合の保険)", () => {
		render(true);
		act(() => {
			document.dispatchEvent(new Event("freeze"));
		});
		expect(statusNow()).toBe(AppLockStatus.LOCKED);
	});

	// 猶予が無いので、再生中かどうかに関わらず即ロックする (延長ロジックが一切走らないため)。
	it("スライドショー再生中でも hidden で即ロックする (延長しない)", () => {
		useSlideshowStore.setState({ running: true });
		render(true);
		act(() => {
			visibility = "hidden";
			document.dispatchEvent(new Event("visibilitychange"));
		});
		expect(statusNow()).toBe(AppLockStatus.LOCKED);
		expect(useSlideshowStore.getState().running).toBe(false);
	});

	it("active=false では 3 イベントとも無反応 (listener を張らない)", () => {
		render(false);
		act(() => {
			visibility = "hidden";
			document.dispatchEvent(new Event("visibilitychange"));
			window.dispatchEvent(new Event("pagehide"));
			document.dispatchEvent(new Event("freeze"));
		});
		expect(statusNow()).toBe(AppLockStatus.UNLOCKED);
	});

	it("アンマウント後に発火しても無反応 (cleanup で解除されている)", () => {
		render(true);
		act(() => root.unmount());
		act(() => {
			window.dispatchEvent(new Event("pagehide"));
		});
		expect(statusNow()).toBe(AppLockStatus.UNLOCKED);
	});

	it("DISABLED (ロック未設定) のときはロックしない", () => {
		useAppLockStore.setState({ status: AppLockStatus.DISABLED });
		render(true);
		act(() => {
			window.dispatchEvent(new Event("pagehide"));
		});
		expect(statusNow()).toBe(AppLockStatus.DISABLED);
	});
});
