import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
	APP_LOCK_KEY,
	APP_LOCK_RECORD_VERSION,
	computeLockoutMs,
	parseLockRecord,
	resolveInitialStatus,
	useAppLockStore,
} from "../../src/state/appLockStore";
import type { AppLockRecord } from "../../src/types/AppLock";
import { AppLockStatus, LockFailure } from "../../src/types/AppLock";

const makeRecord = (over: Partial<AppLockRecord> = {}): AppLockRecord => ({
	version: APP_LOCK_RECORD_VERSION,
	verifier: {
		security: {
			version: 1,
			kdf: "PBKDF2",
			kdfIterations: 150_000,
			salt: "c2FsdA==",
			cipher: "AES-GCM",
			iv: "aXZpdg==",
		},
		ciphertext: "Y2lwaGVy",
	},
	userHandle: "dXNlcg==",
	credentialId: null,
	failureCount: 0,
	...over,
});

const resetStore = (): void => {
	useAppLockStore.setState({
		status: AppLockStatus.DISABLED,
		record: null,
		webauthnAvailable: false,
		failureCount: 0,
		busy: false,
		lastFailure: null,
		lockoutUntil: 0,
	});
};

beforeEach(() => {
	localStorage.clear();
	resetStore();
});

afterEach(() => {
	localStorage.clear();
	resetStore();
});

describe("parseLockRecord", () => {
	it("正常なレコードを復元する", () => {
		const record = makeRecord({ credentialId: "Y3JlZA==" });
		expect(parseLockRecord(JSON.stringify(record))).toEqual(record);
	});

	it("null / 空文字は null", () => {
		expect(parseLockRecord(null)).toBeNull();
		expect(parseLockRecord("")).toBeNull();
	});

	it("壊れた JSON は throw せず null", () => {
		expect(parseLockRecord("{not json")).toBeNull();
	});

	it("version 不一致は null (将来の形式変更で誤読しない)", () => {
		expect(parseLockRecord(JSON.stringify(makeRecord({ version: 999 })))).toBeNull();
	});

	it("verifier / userHandle が欠けていれば null", () => {
		const { verifier: _v, ...noVerifier } = makeRecord();
		expect(parseLockRecord(JSON.stringify(noVerifier))).toBeNull();
		expect(parseLockRecord(JSON.stringify(makeRecord({ userHandle: "" })))).toBeNull();
	});

	// 解錠に必要なのは verifier だけ。付随項目の欠損でレコードを捨てると、解錠できる
	// 検証子を持っているのに fail-open でロックが黙って無効化される。
	it("credentialId が欠けていてもレコードを生かす (null に寄せる)", () => {
		const { credentialId: _c, ...noCred } = makeRecord();
		const parsed = parseLockRecord(JSON.stringify(noCred));
		expect(parsed).not.toBeNull();
		expect(parsed?.credentialId).toBeNull();
		expect(parsed?.verifier.ciphertext).toBe("Y2lwaGVy");
	});

	it("credentialId が不正な型でもレコードを生かす (null に寄せる)", () => {
		const parsed = parseLockRecord(
			JSON.stringify({ ...makeRecord(), credentialId: 12345 })
		);
		expect(parsed).not.toBeNull();
		expect(parsed?.credentialId).toBeNull();
	});

	it("failureCount が不正な値なら 0 に寄せる", () => {
		expect(
			parseLockRecord(JSON.stringify({ ...makeRecord(), failureCount: "many" }))?.failureCount
		).toBe(0);
		expect(
			parseLockRecord(JSON.stringify({ ...makeRecord(), failureCount: -5 }))?.failureCount
		).toBe(0);
	});

	it("failureCount が欠けていれば 0 で補う", () => {
		const { failureCount: _f, ...noCount } = makeRecord();
		expect(parseLockRecord(JSON.stringify(noCount))?.failureCount).toBe(0);
	});
});

describe("resolveInitialStatus (fail-open)", () => {
	it("レコードが無ければ DISABLED (fail-open)", () => {
		expect(resolveInitialStatus(null, true)).toBe(AppLockStatus.DISABLED);
	});

	it("PC 環境ではレコードがあっても DISABLED", () => {
		expect(resolveInitialStatus(makeRecord(), false)).toBe(AppLockStatus.DISABLED);
	});

	it("スマホ環境 かつ レコードありなら LOCKED", () => {
		expect(resolveInitialStatus(makeRecord(), true)).toBe(AppLockStatus.LOCKED);
	});
});

describe("computeLockoutMs", () => {
	it("失敗が少ないうちは待たせない", () => {
		expect(computeLockoutMs(0)).toBe(0);
		expect(computeLockoutMs(2)).toBe(0);
	});

	it("回数に応じて増え、上限で頭打ちになる", () => {
		expect(computeLockoutMs(3)).toBeGreaterThan(0);
		expect(computeLockoutMs(5)).toBeGreaterThan(computeLockoutMs(3));
		expect(computeLockoutMs(100)).toBe(computeLockoutMs(50));
	});

	it("負値でも 0 (異常値で NaN を返さない)", () => {
		expect(computeLockoutMs(-1)).toBe(0);
	});
});

describe("appLockStore 状態遷移", () => {
	it("enable でレコードが永続化され UNLOCKED になる", () => {
		const record = makeRecord();
		expect(useAppLockStore.getState().enable(record)).toBe(true);
		expect(useAppLockStore.getState().status).toBe(AppLockStatus.UNLOCKED);
		expect(parseLockRecord(localStorage.getItem(APP_LOCK_KEY))).toEqual(record);
	});

	it("lock は UNLOCKED のときだけ効く (DISABLED では no-op)", () => {
		useAppLockStore.getState().lock();
		expect(useAppLockStore.getState().status).toBe(AppLockStatus.DISABLED);
		useAppLockStore.getState().enable(makeRecord());
		useAppLockStore.getState().lock();
		expect(useAppLockStore.getState().status).toBe(AppLockStatus.LOCKED);
	});

	it("unlock は LOCKED のときだけ効き、失敗回数をリセットする", () => {
		useAppLockStore.getState().enable(makeRecord());
		useAppLockStore.getState().lock();
		useAppLockStore.getState().noteFailure(LockFailure.WRONG_PASSCODE);
		expect(useAppLockStore.getState().failureCount).toBe(1);
		useAppLockStore.getState().unlock();
		expect(useAppLockStore.getState().status).toBe(AppLockStatus.UNLOCKED);
		expect(useAppLockStore.getState().failureCount).toBe(0);
		// 永続レコード側の失敗回数もリセットされる。
		expect(parseLockRecord(localStorage.getItem(APP_LOCK_KEY))?.failureCount).toBe(0);
	});

	it("DISABLED からは unlock で遷移しない", () => {
		useAppLockStore.getState().unlock();
		expect(useAppLockStore.getState().status).toBe(AppLockStatus.DISABLED);
	});

	it("noteFailure は回数を永続化する (リロードしてもリセットされない)", () => {
		useAppLockStore.getState().enable(makeRecord());
		useAppLockStore.getState().noteFailure(LockFailure.WRONG_PASSCODE);
		useAppLockStore.getState().noteFailure(LockFailure.WRONG_PASSCODE);
		expect(useAppLockStore.getState().failureCount).toBe(2);
		expect(parseLockRecord(localStorage.getItem(APP_LOCK_KEY))?.failureCount).toBe(2);
		expect(useAppLockStore.getState().lastFailure).toBe(LockFailure.WRONG_PASSCODE);
	});

	it("disable でレコードが消え DISABLED になる", () => {
		useAppLockStore.getState().enable(makeRecord());
		useAppLockStore.getState().disable();
		expect(useAppLockStore.getState().status).toBe(AppLockStatus.DISABLED);
		expect(useAppLockStore.getState().record).toBeNull();
		expect(localStorage.getItem(APP_LOCK_KEY)).toBeNull();
	});

	// 回帰防止: 解錠済みフラグを永続化してしまうと、リロードや SW の autoUpdate による
	// 再読み込みでロックを素通りできてしまう。
	it("UNLOCKED は localStorage に一切書かれない", () => {
		useAppLockStore.getState().enable(makeRecord());
		useAppLockStore.getState().lock();
		useAppLockStore.getState().unlock();
		expect(useAppLockStore.getState().status).toBe(AppLockStatus.UNLOCKED);
		const raw = localStorage.getItem(APP_LOCK_KEY) ?? "";
		expect(raw).not.toContain("unlocked");
		expect(raw).not.toContain("status");
		// 保存されているのはレコードだけ = 再起動時は resolveInitialStatus で LOCKED になる。
		expect(resolveInitialStatus(parseLockRecord(raw), true)).toBe(AppLockStatus.LOCKED);
	});
});
