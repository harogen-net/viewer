import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { type UseAppLock, useAppLock } from "../../src/hooks/useAppLock";
import { APP_LOCK_KEY, useAppLockStore } from "../../src/state/appLockStore";
import { AppLockStatus, LockFailure } from "../../src/types/AppLock";

// useAppLock: store と暗号 / WebAuthn を繋ぐオーケストレーション層。
//
// 暗号 (PBKDF2 15 万回) はモックする。ここで検証したいのは「どの操作がパスコード照合を
// 要求するか」という結線であって暗号強度ではない (暗号自体は appLockPasscode.test.ts で
// 実物を回している)。モックにより高速かつ環境非依存になる。
//
// 最重要ケース: 誤ったパスコードで disableLock / changePasscode / unregisterBiometrics が
// 拒否されること。ここが通ってしまうと唯一の本物のバイパスになる。

const CORRECT = "135790";
const WRONG = "000000";

// 検証子は「正しいパスコードなら復号できる」ことだけを表すダミー。
vi.mock("@/utils/appLockPasscode", () => ({
	PASSCODE_MIN_LENGTH: 6,
	PASSCODE_MAX_LENGTH: 32,
	isValidPasscodeFormat: (p: string) => /^[0-9]{6,32}$/.test(p),
	createPasscodeVerifier: async (p: string) => ({
		security: {
			version: 1,
			kdf: "PBKDF2",
			kdfIterations: 150_000,
			salt: "c2FsdA==",
			cipher: "AES-GCM",
			iv: "aXZpdg==",
		},
		// 実物は暗号文。テストでは「どのパスコードで作られたか」を平文で持たせて照合を模す。
		ciphertext: `for:${p}`,
	}),
	verifyPasscode: async (verifier: { ciphertext: string }, p: string) =>
		verifier.ciphertext === `for:${p}`,
}));

const registerMock = vi.fn();
const assertMock = vi.fn();

vi.mock("@/utils/webauthnLock", () => ({
	isWebAuthnSupported: () => true,
	isPlatformAuthenticatorAvailable: async () => true,
	createUserHandle: () => "dXNlcg==",
	registerLockCredential: (...args: unknown[]) => registerMock(...args),
	assertLockCredential: (...args: unknown[]) => assertMock(...args),
}));

let api: UseAppLock;
let root: Root;
let div: HTMLDivElement;

const mount = (): void => {
	div = document.createElement("div");
	document.body.appendChild(div);
	root = createRoot(div);
	const Probe = (): null => {
		api = useAppLock();
		return null;
	};
	act(() => root.render(<Probe />));
};

// async な API を呼んで React の更新を流す。
const run = async <T,>(fn: () => Promise<T>): Promise<T> => {
	let result: T;
	await act(async () => {
		result = await fn();
	});
	// biome-ignore lint/style/noNonNullAssertion: act 内で必ず代入される
	return result!;
};

const state = () => useAppLockStore.getState();

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
	registerMock.mockReset();
	assertMock.mockReset();
	mount();
});

afterEach(() => {
	act(() => root.unmount());
	div.remove();
	localStorage.clear();
	resetStore();
});

describe("useAppLock 有効化", () => {
	it("enableLock で検証子が保存され UNLOCKED になる", async () => {
		expect(await run(() => api.enableLock(CORRECT))).toBe(true);
		expect(state().status).toBe(AppLockStatus.UNLOCKED);
		expect(state().record?.credentialId).toBeNull();
		expect(localStorage.getItem(APP_LOCK_KEY)).not.toBeNull();
	});

	it("有効化直後は生体認証が未登録", async () => {
		await run(() => api.enableLock(CORRECT));
		expect(state().record?.credentialId).toBeNull();
	});
});

describe("useAppLock 解錠", () => {
	beforeEach(async () => {
		await run(() => api.enableLock(CORRECT));
		act(() => state().lock());
	});

	it("正しいパスコードで解錠する", async () => {
		expect(await run(() => api.unlockWithPasscode(CORRECT))).toBe(true);
		expect(state().status).toBe(AppLockStatus.UNLOCKED);
	});

	it("誤ったパスコードでは解錠せず失敗を記録する", async () => {
		expect(await run(() => api.unlockWithPasscode(WRONG))).toBe(false);
		expect(state().status).toBe(AppLockStatus.LOCKED);
		expect(state().failureCount).toBe(1);
		expect(state().lastFailure).toBe(LockFailure.WRONG_PASSCODE);
	});

	it("解錠に成功すると失敗回数がリセットされる", async () => {
		await run(() => api.unlockWithPasscode(WRONG));
		await run(() => api.unlockWithPasscode(CORRECT));
		expect(state().failureCount).toBe(0);
	});

	it("クールダウン中は照合せず THROTTLED を返す (PBKDF2 を回させない)", async () => {
		// 3 回失敗でクールダウンに入る (computeLockoutMs の段階表)。
		for (let i = 0; i < 3; i++) await run(() => api.unlockWithPasscode(WRONG));
		expect(await run(() => api.unlockWithPasscode(CORRECT))).toBe(false);
		expect(state().status).toBe(AppLockStatus.LOCKED);
		expect(state().lastFailure).toBe(LockFailure.THROTTLED);
	});

	// 恒久ロックアウトの回帰テスト。
	// クールダウンを永続化された failureCount から算出すると、3 回失敗した時点で
	// 「照合しない → 解錠できない → failureCount がリセットされない」の輪から抜けられず、
	// 正しいパスコードでも永久に解錠できなくなる。待機は「失敗時点からの時間」でなければならない。
	it("クールダウンが明ければ正しいパスコードで解錠できる (恒久ロックアウトしない)", async () => {
		// 3 回失敗で待機に入る。以降の再試行は THROTTLED なので回数は増えない
		// (待たされている間の連打でクールダウンが伸び続けないようにしている)。
		for (let i = 0; i < 5; i++) await run(() => api.unlockWithPasscode(WRONG));
		expect(state().failureCount).toBe(3);
		// 待機中は拒否される。
		expect(await run(() => api.unlockWithPasscode(CORRECT))).toBe(false);
		expect(state().lastFailure).toBe(LockFailure.THROTTLED);
		// 待機を明かす (メモリ上の明け時刻を過去にする)。
		act(() => {
			useAppLockStore.setState({ lockoutUntil: 0 });
		});
		expect(await run(() => api.unlockWithPasscode(CORRECT))).toBe(true);
		expect(state().status).toBe(AppLockStatus.UNLOCKED);
		expect(state().failureCount).toBe(0);
	});

	// リロードでメモリ上の待機は消える (仕様: 絶対時刻を保存しない)。
	// failureCount は残るので次の失敗時の待機は長いままだが、解錠自体は塞がれない。
	it("リロード相当でも解錠が塞がれない (待機は永続化しない)", async () => {
		for (let i = 0; i < 8; i++) await run(() => api.unlockWithPasscode(WRONG));
		const persisted = state().record?.failureCount;
		// 待機に入って以降は増えないので 3 で止まる。この値が永続化されている。
		expect(persisted).toBe(3);
		// リロード = メモリ状態を初期値へ、レコードは localStorage から復元。
		act(() => {
			useAppLockStore.setState({
				status: AppLockStatus.LOCKED,
				failureCount: persisted ?? 0,
				lockoutUntil: 0,
				lastFailure: null,
			});
		});
		expect(await run(() => api.unlockWithPasscode(CORRECT))).toBe(true);
	});

	it("生体認証が未登録なら unlockWithBiometrics は失敗する", async () => {
		expect(await run(() => api.unlockWithBiometrics())).toBe(false);
		expect(state().lastFailure).toBe(LockFailure.WEBAUTHN_NO_CREDENTIAL);
		expect(assertMock).not.toHaveBeenCalled();
	});
});

// 生体認証の失敗は failureCount に数えない。キャンセルや顔の認識漏れ、自動呼び出しの拒否は
// 日常的に起きるため、混ぜるとパスコード入力が誤ってクールダウンで塞がれる。
// (docs/app-lock-spec.md §5.1: WebAuthn 経路にはバックオフを掛けない)
describe("useAppLock 生体認証の失敗はクールダウンを汚染しない", () => {
	beforeEach(async () => {
		await run(() => api.enableLock(CORRECT));
		registerMock.mockResolvedValue({ status: "ok", credentialId: "Y3JlZA==" });
		await run(() => api.registerBiometrics());
		act(() => state().lock());
	});

	it("生体認証を何度失敗しても failureCount は増えない", async () => {
		assertMock.mockResolvedValue({
			status: "failed",
			reason: LockFailure.WEBAUTHN_CANCELLED,
		});
		for (let i = 0; i < 5; i++) await run(() => api.unlockWithBiometrics());
		expect(state().failureCount).toBe(0);
		// パスコードでの解錠がクールダウンで塞がれていないこと。
		expect(await run(() => api.unlockWithPasscode(CORRECT))).toBe(true);
	});

	it("失敗理由は記録される (UI のメッセージ用)", async () => {
		assertMock.mockResolvedValue({
			status: "failed",
			reason: LockFailure.WEBAUTHN_CANCELLED,
		});
		await run(() => api.unlockWithBiometrics());
		expect(state().lastFailure).toBe(LockFailure.WEBAUTHN_CANCELLED);
	});

	it("silent 指定では失敗理由も記録しない (自動呼び出し用)", async () => {
		assertMock.mockResolvedValue({
			status: "failed",
			reason: LockFailure.WEBAUTHN_CANCELLED,
		});
		await run(() => api.unlockWithBiometrics({ silent: true }));
		expect(state().lastFailure).toBeNull();
		expect(state().failureCount).toBe(0);
	});

	it("silent でも成功すれば解錠する", async () => {
		assertMock.mockResolvedValue({ status: "ok", userVerified: true });
		expect(await run(() => api.unlockWithBiometrics({ silent: true }))).toBe(true);
		expect(state().status).toBe(AppLockStatus.UNLOCKED);
	});
});

describe("useAppLock 生体認証の登録", () => {
	beforeEach(async () => {
		await run(() => api.enableLock(CORRECT));
	});

	it("登録が成功すると credentialId が保存される", async () => {
		registerMock.mockResolvedValue({ status: "ok", credentialId: "Y3JlZA==" });
		expect(await run(() => api.registerBiometrics())).toBe(true);
		expect(state().record?.credentialId).toBe("Y3JlZA==");
	});

	it("登録済みの credentialId を excludeCredentials 用に渡す", async () => {
		registerMock.mockResolvedValue({ status: "ok", credentialId: "Y3JlZA==" });
		await run(() => api.registerBiometrics());
		registerMock.mockResolvedValue({ status: "ok", credentialId: "bmV3" });
		await run(() => api.registerBiometrics());
		expect(registerMock.mock.calls[1][0].existingCredentialId).toBe("Y3JlZA==");
	});

	it("登録が失敗すると理由を記録し credentialId は変わらない", async () => {
		registerMock.mockResolvedValue({
			status: "failed",
			reason: LockFailure.WEBAUTHN_CANCELLED,
		});
		expect(await run(() => api.registerBiometrics())).toBe(false);
		expect(state().record?.credentialId).toBeNull();
		expect(state().lastFailure).toBe(LockFailure.WEBAUTHN_CANCELLED);
	});

	// 回帰テスト: 生体認証の登録キャンセル/失敗は「間違ったパスコード」ではない。
	// noteFailure (パスコード用カウンタ) を使ってしまうと、生体認証の登録を何度かキャンセル
	// しただけでパスコードの連続失敗カウントが永続レコードへ書き込まれ、後で正しいパスコードを
	// 入力しても THROTTLED で待たされる恒久ロックアウトと同じ症状になる。
	it("登録の失敗を繰り返してもパスコードの失敗回数は増えない", async () => {
		registerMock.mockResolvedValue({
			status: "failed",
			reason: LockFailure.WEBAUTHN_CANCELLED,
		});
		for (let i = 0; i < 5; i++) await run(() => api.registerBiometrics());
		expect(state().failureCount).toBe(0);
		expect(state().record?.failureCount).toBe(0);
		// クールダウンも発動していない = 正しいパスコードで即座に解錠できる。
		act(() => state().lock());
		expect(await run(() => api.unlockWithPasscode(CORRECT))).toBe(true);
	});

	it("登録済みなら生体認証で解錠できる", async () => {
		registerMock.mockResolvedValue({ status: "ok", credentialId: "Y3JlZA==" });
		await run(() => api.registerBiometrics());
		act(() => state().lock());
		assertMock.mockResolvedValue({ status: "ok", userVerified: true });
		expect(await run(() => api.unlockWithBiometrics())).toBe(true);
		expect(state().status).toBe(AppLockStatus.UNLOCKED);
		expect(assertMock.mock.calls[0][0].credentialId).toBe("Y3JlZA==");
	});
});

// ここが機能の生命線。誤ったパスコードで通ってしまうとロックの意味が消える。
describe("useAppLock バイパス防止 (回帰テスト)", () => {
	beforeEach(async () => {
		await run(() => api.enableLock(CORRECT));
		registerMock.mockResolvedValue({ status: "ok", credentialId: "Y3JlZA==" });
		await run(() => api.registerBiometrics());
	});

	it("誤ったパスコードでは disableLock を拒否する", async () => {
		expect(await run(() => api.disableLock(WRONG))).toBe(false);
		expect(state().status).not.toBe(AppLockStatus.DISABLED);
		expect(state().record).not.toBeNull();
		expect(localStorage.getItem(APP_LOCK_KEY)).not.toBeNull();
		expect(state().lastFailure).toBe(LockFailure.WRONG_PASSCODE);
	});

	it("誤ったパスコードでは changePasscode を拒否する (乗っ取り防止)", async () => {
		expect(await run(() => api.changePasscode(WRONG, "999999"))).toBe(false);
		// 元のパスコードで解錠できるままであること。
		act(() => state().lock());
		expect(await run(() => api.unlockWithPasscode(CORRECT))).toBe(true);
	});

	it("誤ったパスコードでは unregisterBiometrics を拒否する", async () => {
		expect(await run(() => api.unregisterBiometrics(WRONG))).toBe(false);
		expect(state().record?.credentialId).toBe("Y3JlZA==");
	});

	it("正しいパスコードなら disableLock が通り、レコードが消える", async () => {
		expect(await run(() => api.disableLock(CORRECT))).toBe(true);
		expect(state().status).toBe(AppLockStatus.DISABLED);
		expect(state().record).toBeNull();
		expect(localStorage.getItem(APP_LOCK_KEY)).toBeNull();
	});

	it("正しいパスコードなら changePasscode が通り、新旧が入れ替わる", async () => {
		expect(await run(() => api.changePasscode(CORRECT, "999999"))).toBe(true);
		act(() => state().lock());
		expect(await run(() => api.unlockWithPasscode(CORRECT))).toBe(false);
		expect(await run(() => api.unlockWithPasscode("999999"))).toBe(true);
	});

	it("正しいパスコードなら unregisterBiometrics が通る", async () => {
		expect(await run(() => api.unregisterBiometrics(CORRECT))).toBe(true);
		expect(state().record?.credentialId).toBeNull();
	});

	// 回帰テスト: verifyCurrentPasscode (設定モーダルの「パスコードを変更」フロー) だけが
	// クールダウン無しの総当たりを許すオラクルになっていた。解錠済みの端末を一時的に借りた
	// 第三者が総当たりでパスコードを言い当て、変更フローで新しいパスコードに差し替えて
	// 正規の持ち主を締め出す、という経路になり得る欠陥。
	it("verifyCurrentPasscode の誤答も他の照合経路と同じくカウントされ、クールダウンが働く", async () => {
		for (let i = 0; i < 3; i++) expect(await run(() => api.verifyCurrentPasscode(WRONG))).toBe(false);
		expect(state().failureCount).toBe(3);
		// クールダウン中は正しいパスコードでも通らない (照合すら行わない)。
		expect(await run(() => api.verifyCurrentPasscode(CORRECT))).toBe(false);
		expect(state().lastFailure).toBe(LockFailure.THROTTLED);
	});

	it("disableLock / unregisterBiometrics / changePasscode もクールダウン中は照合しない", async () => {
		for (let i = 0; i < 3; i++) await run(() => api.unlockWithPasscode(WRONG));
		// ここまでで待機中のはず。以降はどの経路も正しいパスコードで通らない。
		expect(await run(() => api.disableLock(CORRECT))).toBe(false);
		expect(await run(() => api.unregisterBiometrics(CORRECT))).toBe(false);
		expect(await run(() => api.changePasscode(CORRECT, "999999"))).toBe(false);
		expect(state().record).not.toBeNull(); // 何も変更されていない
	});

	// ロックだけを解除する経路が存在しないことの担保。
	it("パスコードなしでロックを無効化する API が公開されていない", () => {
		const keys = Object.keys(api);
		expect(keys).not.toContain("forceDisable");
		expect(keys).not.toContain("resetLock");
		// disable 系は必ず引数 (パスコード) を取る。
		expect(api.disableLock.length).toBe(1);
		expect(api.unregisterBiometrics.length).toBe(1);
	});
});

describe("useAppLock 破壊的リセット", () => {
	it("eraseAllAndDisable はパスコード無しで通るが、ロックも設定も消える", async () => {
		await run(() => api.enableLock(CORRECT));
		await run(() => api.eraseAllAndDisable());
		expect(state().status).toBe(AppLockStatus.DISABLED);
		expect(state().record).toBeNull();
		expect(localStorage.getItem(APP_LOCK_KEY)).toBeNull();
	});

	// TEMP (要 revert): 正しいはずのパスコードで解錠できない事象の切り分け用の一時脱出口。
	// 原因判明後、この describe ブロックごと削除すること (useAppLock.ts / AppLockScreen.tsx の
	// TEMP コメントに合わせて revert)。
	it("[TEMP] clearAuthOnly_TEMP はパスコード無しで通り、ロック設定だけ消える", async () => {
		await run(() => api.enableLock(CORRECT));
		act(() => {
			api.clearAuthOnly_TEMP();
		});
		expect(state().status).toBe(AppLockStatus.DISABLED);
		expect(state().record).toBeNull();
		expect(localStorage.getItem(APP_LOCK_KEY)).toBeNull();
	});
});
