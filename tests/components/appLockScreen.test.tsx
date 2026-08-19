import { MantineProvider } from "@mantine/core";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AppLockScreen } from "../../src/components/AppLockScreen";
import { APP_LOCK_RECORD_VERSION, useAppLockStore } from "../../src/state/appLockStore";
import type { AppLockRecord } from "../../src/types/AppLock";
import { AppLockStatus } from "../../src/types/AppLock";
import {
	createPasscodeVerifier,
	PASSCODE_MIN_LENGTH,
} from "../../src/utils/appLockPasscode";

// ロック画面。パスコード / 生体認証で解錠でき、失敗しても LOCKED のままであることを検証する。
//
// 暗号はモックする。ここで見たいのは UI の結線 (キーパッド → 照合 → 状態遷移) であって暗号
// そのものではない。実 PBKDF2 (15 万回) を通すと 1 件あたり数百 ms かかり、全体実行の負荷で
// 待ち時間が伸びてテストがフレーキーになる。実暗号の検証は tests/utils/appLockPasscode.test.ts
// が実物で行っている。

const PASSCODE = "135790";
const CRED_ID = btoa(String.fromCharCode(...new Uint8Array([1, 2, 3, 4])));

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

let container: HTMLDivElement;
let root: Root;
let getMock: ReturnType<typeof vi.fn>;
// 生体認証の自動呼び出しは「可視になったこと」で走る。ボタン経路だけを検証したいテストは
// hidden で始めて自動呼び出しを抑止する。
let visibility: "visible" | "hidden";

const render = (): void => {
	act(() => {
		root.render(
			<MantineProvider>
				<AppLockScreen />
			</MantineProvider>
		);
	});
};

const seedLocked = async (over: Partial<AppLockRecord> = {}): Promise<void> => {
	const record: AppLockRecord = {
		version: APP_LOCK_RECORD_VERSION,
		verifier: await createPasscodeVerifier(PASSCODE),
		userHandle: btoa(String.fromCharCode(...new Uint8Array(16))),
		credentialId: null,
		failureCount: 0,
		...over,
	};
	useAppLockStore.setState({
		status: AppLockStatus.LOCKED,
		record,
		failureCount: record.failureCount,
		busy: false,
		lastFailure: null,
		lockoutUntil: 0,
	});
};

// パスコードは自作 10 キー (PasscodeKeypad)。TextField ではないのでキーを順に押す。
const keypad = (): Element | null => document.querySelector("[data-passcode-keypad]");

const keyOf = (d: string): HTMLButtonElement | null =>
	document.querySelector<HTMLButtonElement>(`[data-passcode-key="${d}"]`);

const enteredLength = (): number =>
	Number(document.querySelector("[data-passcode-dots]")?.getAttribute("data-passcode-length") ?? -1);

const typePasscode = (v: string): void => {
	for (const d of v) {
		act(() => {
			keyOf(d)?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
		});
	}
};

const pressDelete = (): void => {
	act(() => {
		keyOf("delete")?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
	});
};

const click = async (selector: string): Promise<void> => {
	await act(async () => {
		document
			.querySelector<HTMLButtonElement>(selector)
			?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
	});
	// PBKDF2 (15 万回) の非同期解決を待つ。1 回の act では流れ切らないので busy が下りるまで回す。
	for (let i = 0; i < 50 && useAppLockStore.getState().busy; i++) {
		await act(async () => {
			await new Promise((r) => setTimeout(r, 20));
		});
	}
	await act(async () => {});
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
	Object.defineProperty(window, "isSecureContext", { value: true, configurable: true });
	const PKC = function () {} as unknown as typeof PublicKeyCredential;
	(PKC as unknown as Record<string, unknown>).isUserVerifyingPlatformAuthenticatorAvailable = vi
		.fn()
		.mockResolvedValue(true);
	Object.defineProperty(window, "PublicKeyCredential", { value: PKC, configurable: true });
	getMock = vi.fn();
	Object.defineProperty(navigator, "credentials", {
		value: { create: vi.fn(), get: getMock },
		configurable: true,
	});
});

afterEach(() => {
	act(() => root.unmount());
	container.remove();
	useAppLockStore.setState({
		status: AppLockStatus.DISABLED,
		record: null,
		failureCount: 0,
		busy: false,
		lastFailure: null,
		lockoutUntil: 0,
	});
	Object.defineProperty(navigator, "credentials", { value: undefined, configurable: true });
	Object.defineProperty(window, "PublicKeyCredential", { value: undefined, configurable: true });
	Object.defineProperty(window, "isSecureContext", { value: false, configurable: true });
});

describe("AppLockScreen パスコード解錠", () => {
	it("正しいパスコードで解錠する", async () => {
		await seedLocked();
		render();
		typePasscode(PASSCODE);
		await click("[data-app-lock-submit]");
		expect(statusNow()).toBe(AppLockStatus.UNLOCKED);
	});

	it("誤ったパスコードでは LOCKED のままでエラーを表示し、失敗回数が増える", async () => {
		await seedLocked();
		render();
		typePasscode("000000");
		await click("[data-app-lock-submit]");
		expect(statusNow()).toBe(AppLockStatus.LOCKED);
		expect(useAppLockStore.getState().failureCount).toBe(1);
		expect(document.querySelector("[data-app-lock-error]")?.textContent).toContain("パスコード");
	});

	// 仕様 (クールダウン / 復旧導線) を入れたなら、その状態が画面から分かること。
	// ここが無いと「正しいパスコードなのに反応しない」としか見えない。
	it("待機中は残り秒数を表示する", async () => {
		await seedLocked();
		render();
		// 3 回失敗させて待機に入れる。
		for (let i = 0; i < 3; i++) {
			typePasscode("000000");
			await click("[data-app-lock-submit]");
		}
		const cooldown = document.querySelector("[data-app-lock-cooldown]");
		expect(cooldown).not.toBeNull();
		expect(cooldown?.textContent).toMatch(/あと \d+ 秒/);
	});

	// 待機中は入力自体を塞ぐので、待機情報は専用バナーが担う (hook に到達しないため
	// THROTTLED のエラー文は出ない)。バナーが無いと「反応しないアプリ」になる。
	it("待機中は入力が塞がれ、待機バナーが残り秒数を示す", async () => {
		await seedLocked();
		render();
		for (let i = 0; i < 3; i++) {
			typePasscode("000000");
			await click("[data-app-lock-submit]");
		}
		// キーが塞がれている。
		expect(keyOf("1")?.disabled).toBe(true);
		// 残り秒数が 1 秒以上で表示される (0 秒のまま固まらない)。
		const banner = document.querySelector("[data-app-lock-cooldown]")?.textContent ?? "";
		expect(banner).toMatch(/あと [1-9]\d* 秒/);
	});

	it("連続失敗の回数を表示する", async () => {
		await seedLocked();
		render();
		for (let i = 0; i < 2; i++) {
			typePasscode("000000");
			await click("[data-app-lock-submit]");
		}
		expect(document.querySelector("[data-app-lock-error]")?.textContent).toContain("2 回連続");
	});

	// 開かないアプリにしないための導線案内。
	it("失敗が続いたら復旧導線への案内を出す", async () => {
		await seedLocked();
		render();
		expect(document.querySelector("[data-app-lock-recovery-hint]")).toBeNull();
		for (let i = 0; i < 3; i++) {
			typePasscode("000000");
			await click("[data-app-lock-submit]");
		}
		expect(document.querySelector("[data-app-lock-recovery-hint]")).not.toBeNull();
	});

	it("ドキュメント名などの中身をロック画面に出さない", async () => {
		await seedLocked();
		render();
		// 認証 UI 以外の情報源 (スライド一覧 / トップバー) が無いこと。
		expect(document.querySelector("[data-top-bar]")).toBeNull();
		expect(document.querySelector("[data-slide-list-area]")).toBeNull();
	});
});

// 自作 10 キー。TextField を置かないので、入力経路が数字 10 個 + 削除に限定されることを担保する。
describe("AppLockScreen パスコードキーパッド", () => {
	beforeEach(async () => {
		await seedLocked();
		render();
	});

	it("TextField を置かない (入力欄が DOM に存在しない)", () => {
		expect(document.querySelector("input")).toBeNull();
		expect(keypad()).not.toBeNull();
	});

	it("0〜9 と削除キーが揃っている", () => {
		for (let d = 0; d <= 9; d++) expect(keyOf(String(d))).not.toBeNull();
		expect(keyOf("delete")).not.toBeNull();
	});

	it("キーを押すと桁数が増える", () => {
		expect(enteredLength()).toBe(0);
		typePasscode("135");
		expect(enteredLength()).toBe(3);
	});

	it("削除キーで 1 桁ずつ消える", () => {
		typePasscode("135");
		pressDelete();
		expect(enteredLength()).toBe(2);
		pressDelete();
		pressDelete();
		expect(enteredLength()).toBe(0);
	});

	it("未入力では削除キーが押せない", () => {
		expect(keyOf("delete")?.disabled).toBe(true);
	});

	// 下限に達していない入力で照合を走らせると PBKDF2 が無駄に回り、失敗回数まで増えてしまう。
	it("最小桁数に達するまで解錠ボタンが押せない", () => {
		const submit = (): HTMLButtonElement | null =>
			document.querySelector<HTMLButtonElement>("[data-app-lock-submit]");
		typePasscode("1".repeat(PASSCODE_MIN_LENGTH - 1));
		expect(submit()?.disabled).toBe(true);
		typePasscode("1");
		expect(submit()?.disabled).toBe(false);
	});

	it("最大桁数を超えて入力できない", () => {
		typePasscode("1".repeat(40));
		expect(enteredLength()).toBe(32);
		expect(keyOf("1")?.disabled).toBe(true);
	});

	it("桁数不明 (旧レコード) では解錠ボタンを出す", () => {
		expect(document.querySelector("[data-app-lock-submit]")).not.toBeNull();
	});
});

// 正解の桁数がレコードにあるときは、その桁数に達した時点で自動照合する (iOS と同じ挙動)。
describe("AppLockScreen 桁数到達で自動照合", () => {
	const settle = async (): Promise<void> => {
		for (let i = 0; i < 50 && useAppLockStore.getState().busy; i++) {
			await act(async () => {
				await new Promise((r) => setTimeout(r, 20));
			});
		}
		await act(async () => {});
	};

	it("桁数が分かっているときは解錠ボタンを出さない", async () => {
		await seedLocked({ passcodeLength: PASSCODE.length });
		render();
		expect(document.querySelector("[data-app-lock-submit]")).toBeNull();
	});

	it("ドットは正解の桁数ぶん表示する (残り桁数が見える)", async () => {
		await seedLocked({ passcodeLength: PASSCODE.length });
		render();
		expect(document.querySelectorAll("[data-passcode-dot]")).toHaveLength(PASSCODE.length);
	});

	it("桁数に達した時点でボタンを押さずに解錠する", async () => {
		await seedLocked({ passcodeLength: PASSCODE.length });
		render();
		typePasscode(PASSCODE);
		await settle();
		expect(statusNow()).toBe(AppLockStatus.UNLOCKED);
	});

	it("桁数に達する前は照合しない", async () => {
		await seedLocked({ passcodeLength: PASSCODE.length });
		render();
		typePasscode(PASSCODE.slice(0, -1));
		await settle();
		expect(statusNow()).toBe(AppLockStatus.LOCKED);
		expect(useAppLockStore.getState().failureCount).toBe(0);
	});

	it("失敗すると入力がクリアされ、そのまま打ち直して解錠できる", async () => {
		await seedLocked({ passcodeLength: PASSCODE.length });
		render();
		typePasscode("0".repeat(PASSCODE.length));
		await settle();
		expect(statusNow()).toBe(AppLockStatus.LOCKED);
		expect(useAppLockStore.getState().failureCount).toBe(1);
		// 入力はクリアされる (⌫ で消す手間を省く)。
		expect(enteredLength()).toBe(0);
		// そのまま正しいコードを打てば、桁数到達で自動的に解錠される。
		typePasscode(PASSCODE);
		await settle();
		expect(statusNow()).toBe(AppLockStatus.UNLOCKED);
	});

	// 失敗しても解錠ボタンは出さない (トルツメ)。自動照合だけで完結させる。
	it("失敗後も解錠ボタンは出さない", async () => {
		await seedLocked({ passcodeLength: PASSCODE.length });
		render();
		typePasscode("0".repeat(PASSCODE.length));
		await settle();
		expect(document.querySelector("[data-app-lock-submit]")).toBeNull();
		expect(document.querySelector("[data-app-lock-error]")?.textContent).toContain("パスコード");
	});

	// expectedLength では入力を打ち止めない。保存桁数が実際と食い違った場合 (localStorage を
	// 手で書き換えたケース) に、キーまで塞ぐと打ち直しの余地がなくなるため。
	// なお正規の経路では passcodeLength に実際の値しか書かないので、この状況は起こらない。
	it("キーは expectedLength で塞がない (上限は maxLength だけ)", async () => {
		await seedLocked({ passcodeLength: 4 });
		render();
		typePasscode("999");
		expect(enteredLength()).toBe(3);
		expect(keyOf("5")?.disabled).toBe(false);
	});

	// 旧レコード (桁数なし) は、解錠に成功した時点で実際の桁数を書き戻す。
	// これが無いと既に有効化済みの端末では自動照合が永久に働かない。
	it("桁数を持たないレコードは解錠成功時に桁数が補完される", async () => {
		await seedLocked();
		render();
		typePasscode(PASSCODE);
		await click("[data-app-lock-submit]");
		expect(statusNow()).toBe(AppLockStatus.UNLOCKED);
		expect(useAppLockStore.getState().record?.passcodeLength).toBe(PASSCODE.length);
	});

	// PC (幅 900px 以下) でもロック画面が出るため、物理キーボードからも入力できるようにしてある。
	// 桁数が分かっていれば Enter を押さずとも桁数到達で照合される。
	it("物理キーボードの数字 / Backspace で入力でき、桁数到達で照合される", async () => {
		await seedLocked({ passcodeLength: PASSCODE.length });
		render();
		const type = (keys: string): void => {
			act(() => {
				for (const k of keys) {
					window.dispatchEvent(new KeyboardEvent("keydown", { key: k, bubbles: true }));
				}
			});
		};
		type("135");
		expect(enteredLength()).toBe(3);
		act(() => {
			window.dispatchEvent(new KeyboardEvent("keydown", { key: "Backspace", bubbles: true }));
		});
		expect(enteredLength()).toBe(2);
		type("5790");
		await settle();
		expect(statusNow()).toBe(AppLockStatus.UNLOCKED);
	});

	// 桁数不明の旧レコードでは Enter が送信のトリガになる。
	it("桁数不明のときは Enter で照合できる", async () => {
		await seedLocked();
		render();
		act(() => {
			for (const k of PASSCODE) {
				window.dispatchEvent(new KeyboardEvent("keydown", { key: k, bubbles: true }));
			}
		});
		expect(enteredLength()).toBe(PASSCODE.length);
		await act(async () => {
			window.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
		});
		await settle();
		expect(statusNow()).toBe(AppLockStatus.UNLOCKED);
	});
});

// ボタン経路のみを検証する。hidden で始めて自動呼び出しを抑止し、クリック起因の挙動だけを見る。
describe("AppLockScreen 生体認証 (ボタン操作)", () => {
	beforeEach(() => {
		visibility = "hidden";
	});

	it("credential 未登録なら生体認証ボタンを出さない", async () => {
		await seedLocked({ credentialId: null });
		render();
		expect(document.querySelector("[data-app-lock-biometric]")).toBeNull();
	});

	it("credential 登録済みなら生体認証で解錠できる", async () => {
		await seedLocked({ credentialId: CRED_ID });
		const bytes = new Uint8Array([1, 2, 3, 4]);
		const authData = new Uint8Array(37);
		authData[32] = 0x05; // UP + UV
		getMock.mockResolvedValue({
			type: "public-key",
			rawId: bytes.buffer.slice(0),
			response: { authenticatorData: authData.buffer.slice(0) },
		});
		render();
		expect(getMock).not.toHaveBeenCalled(); // 自動呼び出しは走っていない
		await click("[data-app-lock-biometric]");
		expect(statusNow()).toBe(AppLockStatus.UNLOCKED);
	});

	it("生体認証をキャンセルしても LOCKED のまま (パスコード導線が残る)", async () => {
		await seedLocked({ credentialId: CRED_ID });
		const err = new Error("cancel");
		err.name = "NotAllowedError";
		getMock.mockRejectedValue(err);
		render();
		await click("[data-app-lock-biometric]");
		expect(statusNow()).toBe(AppLockStatus.LOCKED);
		expect(keypad()).not.toBeNull();
	});

	// ボタン操作での失敗も failureCount には数えない (パスコード側のクールダウンを汚染しない)。
	it("生体認証の失敗はパスコードのクールダウンを発動させない", async () => {
		await seedLocked({ credentialId: CRED_ID });
		const err = new Error("cancel");
		err.name = "NotAllowedError";
		getMock.mockRejectedValue(err);
		render();
		for (let i = 0; i < 4; i++) await click("[data-app-lock-biometric]");
		expect(useAppLockStore.getState().failureCount).toBe(0);
		// パスコード入力が塞がれていないこと。
		expect(keyOf("1")?.disabled).toBe(false);
		typePasscode(PASSCODE);
		await click("[data-app-lock-submit]");
		expect(statusNow()).toBe(AppLockStatus.UNLOCKED);
	});

});

// 自動呼び出し (タップ数削減)。トリガは「マウント」ではなく「可視になったこと」。
// 再ロックは hidden で発火するため、マウント時点ではまだ非表示のことがある。
describe("AppLockScreen 生体認証の自動呼び出し", () => {
	const okAssertion = () => {
		const bytes = new Uint8Array([1, 2, 3, 4]);
		const authData = new Uint8Array(37);
		authData[32] = 0x05;
		return {
			type: "public-key",
			rawId: bytes.buffer.slice(0),
			response: { authenticatorData: authData.buffer.slice(0) },
		};
	};

	const flush = async (): Promise<void> => {
		for (let i = 0; i < 20 && useAppLockStore.getState().busy; i++) {
			await act(async () => {
				await new Promise((r) => setTimeout(r, 10));
			});
		}
		await act(async () => {});
	};

	it("可視状態でマウントされると自動で解錠を試みる", async () => {
		await seedLocked({ credentialId: CRED_ID });
		getMock.mockResolvedValue(okAssertion());
		render();
		await flush();
		expect(getMock).toHaveBeenCalledTimes(1);
		expect(statusNow()).toBe(AppLockStatus.UNLOCKED);
	});

	it("生体認証が未登録なら自動呼び出しもしない", async () => {
		await seedLocked({ credentialId: null });
		render();
		await flush();
		expect(getMock).not.toHaveBeenCalled();
	});

	it("非表示でマウントされた時は呼ばず、可視になってから呼ぶ (再ロック経路)", async () => {
		visibility = "hidden";
		await seedLocked({ credentialId: CRED_ID });
		getMock.mockResolvedValue(okAssertion());
		render();
		await flush();
		expect(getMock).not.toHaveBeenCalled();
		await act(async () => {
			visibility = "visible";
			document.dispatchEvent(new Event("visibilitychange"));
		});
		await flush();
		expect(getMock).toHaveBeenCalledTimes(1);
		expect(statusNow()).toBe(AppLockStatus.UNLOCKED);
	});

	it("ロック 1 サイクルにつき 1 回しか試さない (可視イベントが複数来ても増えない)", async () => {
		await seedLocked({ credentialId: CRED_ID });
		const err = new Error("cancel");
		err.name = "NotAllowedError";
		getMock.mockRejectedValue(err);
		render();
		await flush();
		for (let i = 0; i < 3; i++) {
			await act(async () => {
				document.dispatchEvent(new Event("visibilitychange"));
			});
			await flush();
		}
		expect(getMock).toHaveBeenCalledTimes(1);
	});

	// 自動呼び出しの失敗は日常的に起きる (user activation なしでの拒否)。
	// ここでエラー文を出したり失敗回数を増やしたりすると、起動するたび身に覚えのない警告が出て、
	// さらにパスコード入力がクールダウンで塞がれてしまう。
	it("自動呼び出しの失敗はエラー表示せず、失敗回数も増やさない", async () => {
		await seedLocked({ credentialId: CRED_ID });
		const err = new Error("no user activation");
		err.name = "NotAllowedError";
		getMock.mockRejectedValue(err);
		render();
		await flush();
		expect(statusNow()).toBe(AppLockStatus.LOCKED);
		expect(useAppLockStore.getState().failureCount).toBe(0);
		expect(useAppLockStore.getState().lastFailure).toBeNull();
		expect(document.querySelector("[data-app-lock-error]")).toBeNull();
	});

	it("自動呼び出しが失敗してもボタンとパスコード入力は使える", async () => {
		await seedLocked({ credentialId: CRED_ID });
		const err = new Error("no user activation");
		err.name = "NotAllowedError";
		getMock.mockRejectedValue(err);
		render();
		await flush();
		expect(document.querySelector("[data-app-lock-biometric]")).not.toBeNull();
		expect(keypad()).not.toBeNull();
		// ボタン経由なら (モックを成功に差し替えれば) 解錠できる。
		getMock.mockResolvedValue(okAssertion());
		await click("[data-app-lock-biometric]");
		expect(statusNow()).toBe(AppLockStatus.UNLOCKED);
	});
});

describe("AppLockScreen セーフエリアの塗り", () => {
	// ロック中は safe-area (ノッチ / ホームインジケータ) までオーバーレイと同色にする。
	// これが無いと画面本体は暗くても safe-area にアプリ本体の白背景が残る。
	const LOCK_BG = "#111111";

	it("ロック中は safe-area がオーバーレイと同色になる", async () => {
		await seedLocked();
		render();
		await act(async () => {});
		const html = document.documentElement;
		expect(html.hasAttribute("data-safe-area-bg")).toBe(true);
		expect(html.style.getPropertyValue("--safe-area-bg")).toBe(LOCK_BG);
		expect(
			document.querySelector<HTMLMetaElement>('meta[name="theme-color"]')?.getAttribute("content")
		).toBe(LOCK_BG);
	});

	// 戻し漏れると、解錠後もアプリ全体が暗いままになる。
	it("アンマウント (解錠) で元へ戻る", async () => {
		await seedLocked();
		render();
		await act(async () => {});
		expect(document.documentElement.hasAttribute("data-safe-area-bg")).toBe(true);

		act(() => root.unmount());
		expect(document.documentElement.hasAttribute("data-safe-area-bg")).toBe(false);
		expect(document.querySelector('meta[name="theme-color"]')).toBeNull();
		// afterEach の unmount が二重にならないよう作り直す。
		root = createRoot(container);
	});
});
