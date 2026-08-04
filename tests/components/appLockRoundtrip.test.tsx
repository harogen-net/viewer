import { MantineProvider } from "@mantine/core";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AppLockScreen } from "../../src/components/AppLockScreen";
import { AppLockSettingsModal } from "../../src/components/panels/AppLockSettingsModal";
import {
	APP_LOCK_KEY,
	APP_LOCK_RECORD_VERSION,
	parseLockRecord,
	useAppLockStore,
} from "../../src/state/appLockStore";
import { AppLockStatus } from "../../src/types/AppLock";
import { createPasscodeVerifier } from "../../src/utils/appLockPasscode";

// 有効化 → ロック → 解錠 の往復を「実暗号 (crypto.subtle) + 実コンポーネント」で通す。
// 他のロック系テストは暗号をモックして UI の結線だけを見ているため、実際の PBKDF2 /
// AES-GCM を挟んだときに検証子の生成と照合が噛み合うかはここでしか担保できない。
//
// WebAuthn だけはモックする (jsdom に無い)。

vi.mock("@/utils/webauthnLock", () => ({
	isWebAuthnSupported: () => false,
	isPlatformAuthenticatorAvailable: async () => false,
	createUserHandle: () => "dXNlcnVzZXJ1c2VydXNlcg==",
	registerLockCredential: vi.fn(),
	assertLockCredential: vi.fn(),
}));

let container: HTMLDivElement;
let root: Root;

const renderSettings = (): void => {
	act(() => {
		root.render(
			<MantineProvider>
				<AppLockSettingsModal opened onClose={() => {}} />
			</MantineProvider>
		);
	});
};

const renderLockScreen = (): void => {
	act(() => {
		root.render(
			<MantineProvider>
				<AppLockScreen />
			</MantineProvider>
		);
	});
};

const step = (): string | null =>
	document.querySelector("[data-app-lock-step]")?.getAttribute("data-app-lock-step") ?? null;

const tap = (sel: string): void => {
	act(() => {
		document
			.querySelector<HTMLButtonElement>(sel)
			?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
	});
};

const typePasscode = (v: string): void => {
	for (const d of v) tap(`[data-passcode-key="${d}"]`);
};

// 実 PBKDF2 (15 万回) は数百 ms かかる。busy が下りるまで十分に待つ。
const settle = async (): Promise<void> => {
	for (let i = 0; i < 200 && useAppLockStore.getState().busy; i++) {
		await act(async () => {
			await new Promise((r) => setTimeout(r, 25));
		});
	}
	await act(async () => {});
};

const tapAndSettle = async (sel: string): Promise<void> => {
	await act(async () => {
		document
			.querySelector<HTMLButtonElement>(sel)
			?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
	});
	await settle();
};

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
	container = document.createElement("div");
	document.body.appendChild(container);
	root = createRoot(container);
});

afterEach(() => {
	act(() => root.unmount());
	container.remove();
	localStorage.clear();
	resetStore();
});

// 「起動 → 有効化 → リロード相当 → 解錠」を通す。リロードは
// 「localStorage のレコードを読み直して LOCKED を作る」で再現する。
const enableViaUi = async (passcode: string): Promise<void> => {
	renderSettings();
	expect(step()).toBe("intro");
	tap("[data-app-lock-intro-next]");
	expect(step()).toBe("new");
	typePasscode(passcode);
	await tapAndSettle("[data-app-lock-step-submit]");
	expect(step()).toBe("confirm");
	typePasscode(passcode);
	await tapAndSettle("[data-app-lock-step-submit]");
};

const relockFromStorage = (): void => {
	const stored = parseLockRecord(localStorage.getItem(APP_LOCK_KEY));
	expect(stored).not.toBeNull();
	act(() => {
		useAppLockStore.setState({
			status: AppLockStatus.LOCKED,
			record: stored,
			failureCount: stored?.failureCount ?? 0,
			busy: false,
			lastFailure: null,
			lockoutUntil: 0,
		});
	});
};

describe("アプリロック 実暗号での往復", () => {
	for (const passcode of ["1234", "135790", "1234567890"]) {
		it(`${passcode.length} 桁: UI で有効化したパスコードでそのまま解錠できる`, async () => {
			await enableViaUi(passcode);
			// 生体認証が使えない環境なので、有効化の直後は完了画面。
			expect(step()).toBe("done");
			expect(useAppLockStore.getState().status).toBe(AppLockStatus.UNLOCKED);
			expect(useAppLockStore.getState().record?.passcodeLength).toBe(passcode.length);

			// リロード相当 → ロック画面で同じパスコードを入れる。
			relockFromStorage();
			renderLockScreen();
			typePasscode(passcode);
			await settle();
			expect(useAppLockStore.getState().status).toBe(AppLockStatus.UNLOCKED);
		});
	}

	it("誤ったパスコードでは解錠されない (実暗号)", async () => {
		await enableViaUi("135790");
		relockFromStorage();
		renderLockScreen();
		typePasscode("000000");
		await settle();
		expect(useAppLockStore.getState().status).toBe(AppLockStatus.LOCKED);
	});

	it("保存された検証子は 4 桁でも下限反復回数を満たす", async () => {
		await enableViaUi("1234");
		const stored = parseLockRecord(localStorage.getItem(APP_LOCK_KEY));
		expect(stored?.verifier.security.kdfIterations).toBeGreaterThanOrEqual(100_000);
	});
});

// passcodeLength を持たない旧レコード (初期バージョンで登録したもの) の解錠経路。
// 実暗号で通す。桁数が無いので自動照合はせず、解錠ボタンで照合する。
describe("アプリロック 旧レコード (桁数なし) の解錠", () => {
	// 初期バージョンが書いたレコードを再現する: passcodeLength フィールドが存在しない。
	const seedLegacyRecord = async (passcode: string): Promise<void> => {
		const verifier = await createPasscodeVerifier(passcode);
		const legacy = {
			version: APP_LOCK_RECORD_VERSION,
			verifier,
			userHandle: "dXNlcnVzZXJ1c2VydXNlcg==",
			credentialId: null,
			failureCount: 0,
		};
		localStorage.setItem(APP_LOCK_KEY, JSON.stringify(legacy));
		const parsed = parseLockRecord(localStorage.getItem(APP_LOCK_KEY));
		expect(parsed).not.toBeNull();
		// 桁数を持たないことを前提条件として明示する。
		expect(parsed?.passcodeLength).toBeUndefined();
		act(() => {
			useAppLockStore.setState({
				status: AppLockStatus.LOCKED,
				record: parsed,
				failureCount: 0,
				busy: false,
				lastFailure: null,
				lockoutUntil: 0,
			});
		});
	};

	it("旧レコードでも解錠ボタンで解錠できる", async () => {
		await seedLegacyRecord("135790");
		renderLockScreen();
		// 桁数不明なので解錠ボタンが出ている。
		expect(document.querySelector("[data-app-lock-submit]")).not.toBeNull();
		typePasscode("135790");
		await tapAndSettle("[data-app-lock-submit]");
		expect(useAppLockStore.getState().status).toBe(AppLockStatus.UNLOCKED);
	});

	it("旧レコードは解錠成功時に桁数が補完され、次回から自動照合になる", async () => {
		await seedLegacyRecord("135790");
		renderLockScreen();
		typePasscode("135790");
		await tapAndSettle("[data-app-lock-submit]");
		expect(useAppLockStore.getState().record?.passcodeLength).toBe(6);
		// localStorage 側にも書き戻されている。
		expect(parseLockRecord(localStorage.getItem(APP_LOCK_KEY))?.passcodeLength).toBe(6);
	});

	it("旧レコード + 6 桁より長いパスコードでも解錠できる", async () => {
		await seedLegacyRecord("1234567890");
		renderLockScreen();
		typePasscode("1234567890");
		await tapAndSettle("[data-app-lock-submit]");
		expect(useAppLockStore.getState().status).toBe(AppLockStatus.UNLOCKED);
	});

	it("旧レコード + 誤ったパスコードでは解錠されない", async () => {
		await seedLegacyRecord("135790");
		renderLockScreen();
		typePasscode("000000");
		await tapAndSettle("[data-app-lock-submit]");
		expect(useAppLockStore.getState().status).toBe(AppLockStatus.LOCKED);
	});
});
