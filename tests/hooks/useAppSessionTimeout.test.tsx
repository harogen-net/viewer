// SESSION_TIMEOUT_MS を差し替えて「セッション方式 (>0)」の分岐を検証する。実際の既定値は 0
// (猶予なし、tests/hooks/useAppSession.test.tsx 側でテスト済み) だが、定数を戻すだけで
// セッション方式に復帰できるようコードは維持してある。ここではその分岐が壊れていないかを見る。
//
// vi.mock はファイル内で hoist されるため、この差し替えはこのファイル全体に効く
// (tests/components/editOpsPanel.test.tsx の importOriginal パターンと同じ手法)。

// vi.mock はファイル先頭へ hoist されるため、ファクトリ内でトップレベル変数を参照できない
// (TDZ で ReferenceError になる)。値はリテラルで直接埋め込み、テスト本体側は同じ値を
// 別名の定数として持つ (下の TEST_TIMEOUT_MS)。
vi.mock("@/state/appLockStore", async (importOriginal) => {
	const actual = await importOriginal<typeof import("../../src/state/appLockStore")>();
	return { ...actual, SESSION_TIMEOUT_MS: 5_000 };
});

import { createElement, type FC } from "react";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useAppSession } from "../../src/hooks/useAppSession";
import { useAppLockStore } from "../../src/state/appLockStore";
import { useSlideshowStore } from "../../src/state/slideshowStore";
import { AppLockStatus } from "../../src/types/AppLock";

// vi.mock ファクトリ内の値 (5_000) と同じ値。テスト本体側はこちらを使う。
const TEST_TIMEOUT_MS = 5_000;

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

const advance = (ms: number): void => {
	clock += ms;
};
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

// lastActivityAt を明示的に現在の clock へ揃える。setState は浅いマージなので、これを省くと
// 前のテストで進んだ lastActivityAt が残ったまま次のテストの (毎回 1_000 から始まる) clock と
// 突き合わされ、経過時間の計算が壊れる (前のテストの残骸で早期ロック/ロック漏れが起きる)。
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
	useAppLockStore.setState({ status: AppLockStatus.DISABLED, record: null, failureCount: 0 });
	useSlideshowStore.setState({ running: false });
});

describe("useAppSession (SESSION_TIMEOUT_MS > 0、セッション方式)", () => {
	it("無操作で設定時間が経つとロックする", async () => {
		render(true);
		advance(TEST_TIMEOUT_MS);
		await tickPoll();
		expect(statusNow()).toBe(AppLockStatus.LOCKED);
	});

	it("設定時間に達していなければロックしない", async () => {
		render(true);
		advance(TEST_TIMEOUT_MS - 1_000);
		await tickPoll();
		expect(statusNow()).toBe(AppLockStatus.UNLOCKED);
	});

	it("操作するとセッションが延長される", async () => {
		render(true);
		advance(TEST_TIMEOUT_MS - 1_000);
		fireActivity();
		advance(2_000);
		await tickPoll();
		expect(statusNow()).toBe(AppLockStatus.UNLOCKED);
		advance(TEST_TIMEOUT_MS);
		await tickPoll();
		expect(statusNow()).toBe(AppLockStatus.LOCKED);
	});

	it("キー入力・ホイール・タッチも操作として延長する", async () => {
		for (const ev of ["keydown", "wheel", "touchstart"]) {
			seedUnlocked();
			render(true);
			advance(TEST_TIMEOUT_MS - 1_000);
			fireActivity(ev);
			advance(2_000);
			await tickPoll();
			expect(statusNow(), `${ev} で延長されること`).toBe(AppLockStatus.UNLOCKED);
			act(() => root.unmount());
			root = createRoot(container);
			advance(1_000);
		}
	});

	it("セッション内の復帰では再認証を求めない", () => {
		render(true);
		act(() => {
			visibility = "hidden";
			document.dispatchEvent(new Event("visibilitychange"));
		});
		expect(statusNow()).toBe(AppLockStatus.UNLOCKED); // 隠れただけではロックしない
		advance(1_000);
		act(() => {
			visibility = "visible";
			document.dispatchEvent(new Event("visibilitychange"));
		});
		expect(statusNow()).toBe(AppLockStatus.UNLOCKED);
	});

	it("セッション切れで復帰するとロックする", () => {
		render(true);
		act(() => {
			visibility = "hidden";
			document.dispatchEvent(new Event("visibilitychange"));
		});
		advance(TEST_TIMEOUT_MS);
		act(() => {
			visibility = "visible";
			document.dispatchEvent(new Event("visibilitychange"));
		});
		expect(statusNow()).toBe(AppLockStatus.LOCKED);
	});

	it("bfcache 復帰 (pageshow) でも期限を判定する", () => {
		render(true);
		advance(TEST_TIMEOUT_MS);
		act(() => {
			window.dispatchEvent(new Event("pageshow"));
		});
		expect(statusNow()).toBe(AppLockStatus.LOCKED);
	});

	it("非表示のままでは復帰判定を走らせない", () => {
		render(true);
		advance(TEST_TIMEOUT_MS);
		act(() => {
			visibility = "hidden";
			document.dispatchEvent(new Event("visibilitychange"));
		});
		expect(statusNow()).toBe(AppLockStatus.UNLOCKED);
	});

	it("表示中に再生していれば無操作でもロックしない", async () => {
		useSlideshowStore.setState({ running: true });
		render(true);
		advance(TEST_TIMEOUT_MS * 2);
		await tickPoll();
		expect(statusNow()).toBe(AppLockStatus.UNLOCKED);
	});

	it("再生中はセッションが延長され、再生終了後も設定時間は解錠が続く", async () => {
		useSlideshowStore.setState({ running: true });
		render(true);
		for (let i = 0; i < 6; i++) {
			advance(TEST_TIMEOUT_MS);
			await tickPoll();
		}
		expect(statusNow()).toBe(AppLockStatus.UNLOCKED);
		useSlideshowStore.setState({ running: false });
		advance(TEST_TIMEOUT_MS - 1_000);
		await tickPoll();
		expect(statusNow()).toBe(AppLockStatus.UNLOCKED);
		advance(TEST_TIMEOUT_MS);
		await tickPoll();
		expect(statusNow()).toBe(AppLockStatus.LOCKED);
	});

	it("非表示のまま再生していてもセッションは延長されない", async () => {
		useSlideshowStore.setState({ running: true });
		render(true);
		act(() => {
			visibility = "hidden";
			document.dispatchEvent(new Event("visibilitychange"));
		});
		advance(TEST_TIMEOUT_MS);
		await tickPoll();
		expect(statusNow()).toBe(AppLockStatus.LOCKED);
	});

	it("active=false では監視しない", async () => {
		render(false);
		advance(TEST_TIMEOUT_MS);
		await tickPoll();
		act(() => {
			window.dispatchEvent(new Event("pageshow"));
		});
		expect(statusNow()).toBe(AppLockStatus.UNLOCKED);
	});

	it("アンマウント後は反応しない (cleanup で解除されている)", async () => {
		render(true);
		act(() => root.unmount());
		advance(TEST_TIMEOUT_MS);
		await tickPoll();
		act(() => {
			window.dispatchEvent(new Event("pageshow"));
		});
		expect(statusNow()).toBe(AppLockStatus.UNLOCKED);
	});

	it("DISABLED (ロック未設定) では lock が効かない", async () => {
		useAppLockStore.setState({ status: AppLockStatus.DISABLED });
		render(true);
		advance(TEST_TIMEOUT_MS);
		await tickPoll();
		expect(statusNow()).toBe(AppLockStatus.DISABLED);
	});
});
