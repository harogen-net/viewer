import { MantineProvider } from "@mantine/core";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AppLockSettingsModal } from "../../src/components/panels/AppLockSettingsModal";
import { APP_LOCK_RECORD_VERSION, useAppLockStore } from "../../src/state/appLockStore";
import type { AppLockRecord } from "../../src/types/AppLock";
import { AppLockStatus } from "../../src/types/AppLock";

// 設定モーダル (1 画面 1 入力のステップ形式)。パスコードは全て 10 キーで入力する。
//
// 暗号はモック (PBKDF2 15 万回をステップごとに回すとテストが遅い)。ここで検証したいのは
// ステップ遷移と「どの操作が現行パスコードを要求するか」であって暗号強度ではない。

const CORRECT = "135790";
const WRONG = "000000";
const NEXT = "246810";

vi.mock("@/utils/appLockPasscode", () => ({
	PASSCODE_MIN_LENGTH: 4,
	PASSCODE_MAX_LENGTH: 32,
	isValidPasscodeFormat: (p: string) => /^[0-9]{4,32}$/.test(p),
	createPasscodeVerifier: async (p: string) => ({
		security: {
			version: 1,
			kdf: "PBKDF2",
			kdfIterations: 150_000,
			salt: "c2FsdA==",
			cipher: "AES-GCM",
			iv: "aXZpdg==",
		},
		ciphertext: `for:${p}`,
	}),
	verifyPasscode: async (v: { ciphertext: string }, p: string) => v.ciphertext === `for:${p}`,
}));

const registerMock = vi.fn();

vi.mock("@/utils/webauthnLock", () => ({
	isWebAuthnSupported: () => true,
	isPlatformAuthenticatorAvailable: async () => true,
	createUserHandle: () => "dXNlcg==",
	registerLockCredential: (...a: unknown[]) => registerMock(...a),
	assertLockCredential: vi.fn(),
}));

let container: HTMLDivElement;
let root: Root;

const render = (opened = true): void => {
	act(() => {
		root.render(
			<MantineProvider>
				<AppLockSettingsModal opened={opened} onClose={() => {}} />
			</MantineProvider>
		);
	});
};

// Modal は portal で body 直下に出るので document から探す。
const step = (): string | null =>
	document.querySelector("[data-app-lock-step]")?.getAttribute("data-app-lock-step") ?? null;

const q = (sel: string): HTMLButtonElement | null =>
	document.querySelector<HTMLButtonElement>(sel);

const errorText = (): string | undefined =>
	document.querySelector("[data-app-lock-settings-error]")?.textContent ?? undefined;

const typePasscode = (v: string): void => {
	for (const d of v) {
		act(() => {
			document
				.querySelector<HTMLButtonElement>(`[data-passcode-key="${d}"]`)
				?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
		});
	}
};

const click = async (sel: string): Promise<void> => {
	await act(async () => {
		q(sel)?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
	});
	for (let i = 0; i < 30 && useAppLockStore.getState().busy; i++) {
		await act(async () => {
			await new Promise((r) => setTimeout(r, 10));
		});
	}
	await act(async () => {});
};

const submitStep = (): Promise<void> => click("[data-app-lock-step-submit]");

// 現行パスコード画面は桁数到達で自動的に進む (ボタンが無い)。入力後に解決を待つだけ。
const settle = async (): Promise<void> => {
	for (let i = 0; i < 30 && useAppLockStore.getState().busy; i++) {
		await act(async () => {
			await new Promise((r) => setTimeout(r, 10));
		});
	}
	await act(async () => {});
};

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
		ciphertext: `for:${CORRECT}`,
	},
	userHandle: "dXNlcg==",
	credentialId: null,
	failureCount: 0,
	passcodeLength: CORRECT.length,
	...over,
});

const seedEnabled = (over: Partial<AppLockRecord> = {}): void => {
	useAppLockStore.setState({
		status: AppLockStatus.UNLOCKED,
		record: makeRecord(over),
		webauthnAvailable: true,
		failureCount: 0,
		busy: false,
		lastFailure: null,
		lockoutUntil: 0,
	});
};

const seedDisabled = (): void => {
	useAppLockStore.setState({
		status: AppLockStatus.DISABLED,
		record: null,
		webauthnAvailable: true,
		failureCount: 0,
		busy: false,
		lastFailure: null,
		lockoutUntil: 0,
	});
};

beforeEach(() => {
	localStorage.clear();
	container = document.createElement("div");
	document.body.appendChild(container);
	root = createRoot(container);
	registerMock.mockReset();
	registerMock.mockResolvedValue({ status: "ok", credentialId: "Y3JlZA==" });
});

afterEach(() => {
	act(() => root.unmount());
	container.remove();
	localStorage.clear();
	useAppLockStore.setState({
		status: AppLockStatus.DISABLED,
		record: null,
		webauthnAvailable: false,
		failureCount: 0,
		busy: false,
		lastFailure: null,
		lockoutUntil: 0,
	});
});

describe("AppLockSettingsModal 入力方式", () => {
	it("テキスト入力欄を一切置かない (全て 10 キー)", () => {
		seedDisabled();
		render();
		expect(document.querySelector("input")).toBeNull();
		// 説明画面から進むとキーパッドが出る。
		act(() => {
			q("[data-app-lock-intro-next]")?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
		});
		expect(document.querySelector("[data-passcode-keypad]")).not.toBeNull();
		expect(document.querySelector("input")).toBeNull();
	});

	it("キーパッドは明るい配色で描画する (白背景のモーダル上で見えるように)", () => {
		seedDisabled();
		render();
		act(() => {
			q("[data-app-lock-intro-next]")?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
		});
		expect(
			document.querySelector("[data-passcode-keypad]")?.getAttribute("data-passcode-tone")
		).toBe("light");
	});

	it("1 画面に 1 つしかキーパッドを置かない", () => {
		seedDisabled();
		render();
		act(() => {
			q("[data-app-lock-intro-next]")?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
		});
		expect(document.querySelectorAll("[data-passcode-keypad]")).toHaveLength(1);
	});
});

describe("AppLockSettingsModal 有効化フロー", () => {
	beforeEach(() => {
		seedDisabled();
		render();
	});

	it("説明 → 入力 → 確認 → 生体認証の確認 → 完了 と進む", async () => {
		expect(step()).toBe("intro");
		act(() => {
			q("[data-app-lock-intro-next]")?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
		});
		expect(step()).toBe("new");
		typePasscode(CORRECT);
		await submitStep();
		expect(step()).toBe("confirm");
		typePasscode(CORRECT);
		await submitStep();
		// 生体認証が使える端末なので登録を勧める画面へ。
		expect(step()).toBe("biometric");
		expect(useAppLockStore.getState().record).not.toBeNull();
		await click("[data-app-lock-skip-bio]");
		expect(step()).toBe("done");
	});

	it("確認が一致しなければ入力画面へ戻す", async () => {
		act(() => {
			q("[data-app-lock-intro-next]")?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
		});
		typePasscode(CORRECT);
		await submitStep();
		typePasscode(WRONG);
		await submitStep();
		expect(step()).toBe("new");
		expect(errorText()).toContain("一致しません");
		// 有効化されていないこと。
		expect(useAppLockStore.getState().record).toBeNull();
	});

	it("最小桁数に達するまで次へ進めない", () => {
		act(() => {
			q("[data-app-lock-intro-next]")?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
		});
		typePasscode("123");
		expect(q("[data-app-lock-step-submit]")?.disabled).toBe(true);
		typePasscode("4");
		expect(q("[data-app-lock-step-submit]")?.disabled).toBe(false);
	});

	it("生体認証を登録するとその場で完了へ進む", async () => {
		act(() => {
			q("[data-app-lock-intro-next]")?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
		});
		typePasscode(CORRECT);
		await submitStep();
		typePasscode(CORRECT);
		await submitStep();
		await click("[data-app-lock-register-bio]");
		expect(step()).toBe("done");
		expect(useAppLockStore.getState().record?.credentialId).toBe("Y3JlZA==");
	});
});

describe("AppLockSettingsModal 設定済みメニュー", () => {
	it("有効時はメニューから始まる", () => {
		seedEnabled();
		render();
		expect(step()).toBe("menu");
		expect(document.querySelector("[data-app-lock-state]")?.textContent).toContain("未登録");
	});

	it("生体認証の登録はパスコードを要求しない (ロックを弱めない操作)", async () => {
		seedEnabled();
		render();
		await click("[data-app-lock-register-bio]");
		expect(step()).toBe("done");
		expect(useAppLockStore.getState().record?.credentialId).toBe("Y3JlZA==");
	});

	it("生体認証の解除はパスコードを要求する", async () => {
		seedEnabled({ credentialId: "Y3JlZA==" });
		render();
		act(() => {
			q("[data-app-lock-unregister-bio]")?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
		});
		expect(step()).toBe("current");
		typePasscode(CORRECT);
		await settle();
		expect(step()).toBe("done");
		expect(useAppLockStore.getState().record?.credentialId).toBeNull();
	});
});

describe("AppLockSettingsModal パスコード変更", () => {
	beforeEach(() => {
		seedEnabled();
		render();
		act(() => {
			q("[data-app-lock-change-passcode]")?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
		});
	});

	it("現行 → 新規 → 確認 と進んで変更できる", async () => {
		expect(step()).toBe("current");
		typePasscode(CORRECT);
		await settle();
		expect(step()).toBe("new");
		typePasscode(NEXT);
		await submitStep();
		expect(step()).toBe("confirm");
		typePasscode(NEXT);
		await submitStep();
		expect(step()).toBe("done");
		expect(useAppLockStore.getState().record?.verifier.ciphertext).toBe(`for:${NEXT}`);
	});

	// 新しいパスコードを 2 回入力させた最後に「現行が違う」と突き返さないための挙動。
	it("現行パスコードが違えば新規入力へ進ませない", async () => {
		typePasscode(WRONG);
		await settle();
		expect(step()).toBe("current");
		expect(errorText()).toContain("違います");
	});
});

describe("AppLockSettingsModal 無効化 (バイパス防止)", () => {
	beforeEach(() => {
		seedEnabled();
		render();
		act(() => {
			q("[data-app-lock-disable]")?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
		});
	});

	it("正しいパスコードで無効化できる", async () => {
		typePasscode(CORRECT);
		await settle();
		expect(step()).toBe("done");
		expect(useAppLockStore.getState().status).toBe(AppLockStatus.DISABLED);
		expect(useAppLockStore.getState().record).toBeNull();
	});

	it("誤ったパスコードでは無効化できない", async () => {
		typePasscode(WRONG);
		await settle();
		expect(step()).toBe("current");
		expect(useAppLockStore.getState().record).not.toBeNull();
		expect(useAppLockStore.getState().status).not.toBe(AppLockStatus.DISABLED);
	});
});

describe("AppLockSettingsModal 開き直し", () => {
	it("閉じて開き直すと入力が持ち越されない", async () => {
		seedEnabled();
		render();
		act(() => {
			q("[data-app-lock-change-passcode]")?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
		});
		typePasscode("123");
		expect(
			document.querySelector("[data-passcode-dots]")?.getAttribute("data-passcode-length")
		).toBe("3");
		render(false);
		render(true);
		expect(step()).toBe("menu");
	});
});
