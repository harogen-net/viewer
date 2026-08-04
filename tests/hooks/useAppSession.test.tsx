import { createElement, type FC } from "react";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useAppSession } from "../../src/hooks/useAppSession";
import { SESSION_TIMEOUT_MS, useAppLockStore } from "../../src/state/appLockStore";
import { useSlideshowStore } from "../../src/state/slideshowStore";
import { AppLockStatus } from "../../src/types/AppLock";

// useAppSession: 解錠セッション (無操作 5 分) の管理。
// セッション中はバックグラウンド復帰でも再認証しない。操作で延長される。
//
// 時刻は performance.now() を使うのでスタブして進める。ポーリング間隔は実装内部の定数
// (10 秒) なので、タイマーはフェイクにして明示的に進める。

const W: FC<{ active: boolean }> = ({ active }) => {
	useAppSession(active);
	return null;
};

let container: HTMLDivElement;
let root: Root;
let visibility: "visible" | "hidden";
let clock: number;

const render = (active: boolean): void => {
	act(() => {
		root.render(createElement(W, { active }));
	});
};

/** 仮想時刻を進める (performance.now() の戻り値だけを動かす)。 */
const advance = (ms: number): void => {
	clock += ms;
};

/** ポーリングを 1 回分発火させる (間隔 10 秒より十分長く進める)。 */
const tickPoll = async (): Promise<void> => {
	await act(async () => {
		vi.advanceTimersByTime(10_000);
	});
};

const fireActivity = (type = "pointerdown"): void => {
	act(() => {
		document.dispatchEvent(new Event(type, { bubbles: true }));
	});
};

const seedUnlocked = (): void => {
	useAppLockStore.setState({
		status: AppLockStatus.UNLOCKED,
		record: null,
		failureCount: 0,
		lastActivityAt: clock,
	});
};

const statusNow = (): string => useAppLockStore.getState().status;

beforeEach(() => {
	vi.useFakeTimers();
	clock = 1_000;
	vi.spyOn(performance, "now").mockImplementation(() => clock);
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
	vi.useRealTimers();
	vi.restoreAllMocks();
	useAppLockStore.setState({
		status: AppLockStatus.DISABLED,
		record: null,
		failureCount: 0,
		lastActivityAt: 0,
	});
	useSlideshowStore.setState({ running: false });
});

describe("useAppSession セッションの期限", () => {
	it("無操作で 5 分経つとロックする", async () => {
		render(true);
		advance(SESSION_TIMEOUT_MS);
		await tickPoll();
		expect(statusNow()).toBe(AppLockStatus.LOCKED);
	});

	it("5 分に達していなければロックしない", async () => {
		render(true);
		advance(SESSION_TIMEOUT_MS - 1_000);
		await tickPoll();
		expect(statusNow()).toBe(AppLockStatus.UNLOCKED);
	});

	it("操作するとセッションが延長される", async () => {
		render(true);
		// 期限直前に操作して延長。
		advance(SESSION_TIMEOUT_MS - 1_000);
		fireActivity();
		// 元の期限を跨いでもまだ有効。
		advance(2_000);
		await tickPoll();
		expect(statusNow()).toBe(AppLockStatus.UNLOCKED);
		// 延長後の期限を超えるとロックする。
		advance(SESSION_TIMEOUT_MS);
		await tickPoll();
		expect(statusNow()).toBe(AppLockStatus.LOCKED);
	});

	it("キー入力・ホイール・タッチも操作として延長する", async () => {
		for (const ev of ["keydown", "wheel", "touchstart"]) {
			seedUnlocked();
			render(true);
			advance(SESSION_TIMEOUT_MS - 1_000);
			fireActivity(ev);
			advance(2_000);
			await tickPoll();
			expect(statusNow(), `${ev} で延長されること`).toBe(AppLockStatus.UNLOCKED);
			act(() => root.unmount());
			root = createRoot(container);
			advance(1_000);
		}
	});
});

describe("useAppSession バックグラウンド復帰", () => {
	it("セッション内の復帰では再認証を求めない", async () => {
		render(true);
		// 隠れて 1 分後に戻る。
		act(() => {
			visibility = "hidden";
			document.dispatchEvent(new Event("visibilitychange"));
		});
		expect(statusNow()).toBe(AppLockStatus.UNLOCKED); // 隠れただけではロックしない
		advance(60_000);
		act(() => {
			visibility = "visible";
			document.dispatchEvent(new Event("visibilitychange"));
		});
		expect(statusNow()).toBe(AppLockStatus.UNLOCKED);
	});

	it("セッション切れで復帰するとロックする", async () => {
		render(true);
		act(() => {
			visibility = "hidden";
			document.dispatchEvent(new Event("visibilitychange"));
		});
		advance(SESSION_TIMEOUT_MS);
		act(() => {
			visibility = "visible";
			document.dispatchEvent(new Event("visibilitychange"));
		});
		expect(statusNow()).toBe(AppLockStatus.LOCKED);
	});

	it("bfcache 復帰 (pageshow) でも期限を判定する", async () => {
		render(true);
		advance(SESSION_TIMEOUT_MS);
		act(() => {
			window.dispatchEvent(new Event("pageshow"));
		});
		expect(statusNow()).toBe(AppLockStatus.LOCKED);
	});

	it("非表示のままでは復帰判定を走らせない", () => {
		render(true);
		advance(SESSION_TIMEOUT_MS);
		act(() => {
			visibility = "hidden";
			document.dispatchEvent(new Event("visibilitychange"));
		});
		// hidden 側の visibilitychange ではロックしない (復帰時に判定する)。
		expect(statusNow()).toBe(AppLockStatus.UNLOCKED);
	});
});

describe("useAppSession スライドショー", () => {
	// 再生は無人で進むため操作が発生しない。表示中の無操作ロックから除外しないと
	// 必ず 5 分で再生が止まる。
	it("表示中に再生していれば無操作でもロックしない", async () => {
		useSlideshowStore.setState({ running: true });
		render(true);
		advance(SESSION_TIMEOUT_MS * 2);
		await tickPoll();
		expect(statusNow()).toBe(AppLockStatus.UNLOCKED);
	});

	// 期限チェックを飛ばすだけでは不十分 — lastActivityAt が古いままだと、再生を止めた
	// 直後の 1 回目のポーリングで期限切れと判定されて即ロックしてしまう。
	it("再生中はセッションが延長され、再生終了後も 5 分は解錠が続く", async () => {
		useSlideshowStore.setState({ running: true });
		render(true);
		// 長時間再生する (ポーリングを何度も通す)。
		for (let i = 0; i < 40; i++) {
			advance(10_000);
			await tickPoll();
		}
		expect(statusNow()).toBe(AppLockStatus.UNLOCKED);
		// 再生終了。直後のポーリングでロックされないこと。
		useSlideshowStore.setState({ running: false });
		advance(10_000);
		await tickPoll();
		expect(statusNow()).toBe(AppLockStatus.UNLOCKED);
		// 終了時点から 5 分でロックする。
		advance(SESSION_TIMEOUT_MS);
		await tickPoll();
		expect(statusNow()).toBe(AppLockStatus.LOCKED);
	});

	// 伏せて放置した端末が永久に解錠されたままにならないこと。
	it("非表示のまま再生していてもセッションは延長されない", async () => {
		useSlideshowStore.setState({ running: true });
		render(true);
		act(() => {
			visibility = "hidden";
			document.dispatchEvent(new Event("visibilitychange"));
		});
		advance(SESSION_TIMEOUT_MS);
		await tickPoll();
		expect(statusNow()).toBe(AppLockStatus.LOCKED);
	});

	// 一方でバックグラウンドに長く置かれた場合は再生中でもロックする。
	it("再生中でもセッション切れで復帰したらロックする", () => {
		useSlideshowStore.setState({ running: true });
		render(true);
		advance(SESSION_TIMEOUT_MS);
		act(() => {
			visibility = "visible";
			document.dispatchEvent(new Event("visibilitychange"));
		});
		expect(statusNow()).toBe(AppLockStatus.LOCKED);
		expect(useSlideshowStore.getState().running).toBe(false);
	});
});

describe("useAppSession 購読の制御", () => {
	it("active=false では監視しない", async () => {
		render(false);
		advance(SESSION_TIMEOUT_MS);
		await tickPoll();
		act(() => {
			window.dispatchEvent(new Event("pageshow"));
		});
		expect(statusNow()).toBe(AppLockStatus.UNLOCKED);
	});

	it("アンマウント後は反応しない (cleanup で解除されている)", async () => {
		render(true);
		act(() => root.unmount());
		advance(SESSION_TIMEOUT_MS);
		await tickPoll();
		act(() => {
			window.dispatchEvent(new Event("pageshow"));
		});
		expect(statusNow()).toBe(AppLockStatus.UNLOCKED);
	});

	it("DISABLED (ロック未設定) では lock が効かない", async () => {
		useAppLockStore.setState({ status: AppLockStatus.DISABLED });
		render(true);
		advance(SESSION_TIMEOUT_MS);
		await tickPoll();
		expect(statusNow()).toBe(AppLockStatus.DISABLED);
	});
});
