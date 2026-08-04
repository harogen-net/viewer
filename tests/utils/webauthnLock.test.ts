import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { LockFailure } from "../../src/types/AppLock";
import {
	assertLockCredential,
	isPlatformAuthenticatorAvailable,
	isWebAuthnSupported,
	registerLockCredential,
} from "../../src/utils/webauthnLock";

// jsdom には navigator.credentials / PublicKeyCredential が無いのでモックする
// (tests/hooks/useWakeLock.test.tsx の Object.defineProperty パターン)。
//
// 注意: vitest の jsdom は既定 URL が http://localhost:3000 なので window.isSecureContext は
// false。明示的に上書きしないと feature detection が全て落ちる。

const CRED_ID_BYTES = new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8]);
// bytesToBase64 と同じ変換 (AQIDBAUGBwg=)。
const CRED_ID_B64 = btoa(String.fromCharCode(...CRED_ID_BYTES));
const USER_HANDLE_B64 = btoa(String.fromCharCode(...new Uint8Array(16)));

let createMock: ReturnType<typeof vi.fn>;
let getMock: ReturnType<typeof vi.fn>;

const toArrayBuffer = (bytes: Uint8Array): ArrayBuffer =>
	bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;

// UV (0x04) と UP (0x01) を立てた 37 byte の authenticatorData。
const authDataWithUv = (uv: boolean): ArrayBuffer => {
	const bytes = new Uint8Array(37);
	bytes[32] = uv ? 0x05 : 0x01;
	return toArrayBuffer(bytes);
};

const fakeCredential = (rawId: Uint8Array = CRED_ID_BYTES) => ({
	type: "public-key",
	rawId: toArrayBuffer(rawId),
	response: { authenticatorData: authDataWithUv(true) },
});

const domError = (name: string): DOMException => {
	const e = new Error(name);
	e.name = name;
	return e as unknown as DOMException;
};

beforeEach(() => {
	Object.defineProperty(window, "isSecureContext", { value: true, configurable: true });
	const PKC = function () {} as unknown as typeof PublicKeyCredential;
	(PKC as unknown as Record<string, unknown>).isUserVerifyingPlatformAuthenticatorAvailable = vi
		.fn()
		.mockResolvedValue(true);
	Object.defineProperty(window, "PublicKeyCredential", { value: PKC, configurable: true });
	createMock = vi.fn().mockResolvedValue(fakeCredential());
	getMock = vi.fn().mockResolvedValue(fakeCredential());
	Object.defineProperty(navigator, "credentials", {
		value: { create: createMock, get: getMock },
		configurable: true,
	});
});

afterEach(() => {
	Object.defineProperty(navigator, "credentials", { value: undefined, configurable: true });
	Object.defineProperty(window, "PublicKeyCredential", { value: undefined, configurable: true });
	Object.defineProperty(window, "isSecureContext", { value: false, configurable: true });
});

describe("webauthnLock feature detection", () => {
	it("secure context かつ API が揃っていれば supported", () => {
		expect(isWebAuthnSupported()).toBe(true);
	});

	it("secure context でなければ supported ではない (LAN IP + http のケース)", () => {
		Object.defineProperty(window, "isSecureContext", { value: false, configurable: true });
		expect(isWebAuthnSupported()).toBe(false);
	});

	it("navigator.credentials が無ければ supported ではない", () => {
		Object.defineProperty(navigator, "credentials", { value: undefined, configurable: true });
		expect(isWebAuthnSupported()).toBe(false);
	});

	it("isUVPAA が throw しても false を返す (古い WebView 対策)", async () => {
		const PKC = function () {} as unknown as typeof PublicKeyCredential;
		(PKC as unknown as Record<string, unknown>).isUserVerifyingPlatformAuthenticatorAvailable = vi
			.fn()
			.mockRejectedValue(new Error("boom"));
		Object.defineProperty(window, "PublicKeyCredential", { value: PKC, configurable: true });
		expect(await isPlatformAuthenticatorAvailable()).toBe(false);
	});
});

describe("webauthnLock 登録 (registerLockCredential)", () => {
	const register = () =>
		registerLockCredential({ userHandle: USER_HANDLE_B64, existingCredentialId: null });

	it("成功すると rawId を base64 で返す", async () => {
		const result = await register();
		expect(result).toEqual({ status: "ok", credentialId: CRED_ID_B64 });
	});

	it("生体認証を強制するオプションで呼ぶ", async () => {
		await register();
		const opts = createMock.mock.calls[0][0].publicKey;
		expect(opts.authenticatorSelection.userVerification).toBe("required");
		expect(opts.authenticatorSelection.authenticatorAttachment).toBe("platform");
		expect(opts.authenticatorSelection.residentKey).toBe("discouraged");
		expect(opts.attestation).toBe("none");
		expect(opts.timeout).toBeGreaterThan(0);
	});

	it("rp.id を指定しない (現オリジンから導出させる。ハードコードは localhost で落ちる)", async () => {
		await register();
		const opts = createMock.mock.calls[0][0].publicKey;
		expect(opts.rp.id).toBeUndefined();
	});

	it("challenge は 32 byte で、呼び出しごとに異なる", async () => {
		await register();
		await register();
		const a = createMock.mock.calls[0][0].publicKey.challenge as Uint8Array;
		const b = createMock.mock.calls[1][0].publicKey.challenge as Uint8Array;
		expect(a.length).toBe(32);
		expect(Array.from(a)).not.toEqual(Array.from(b));
	});

	it("既存 credential があれば excludeCredentials に入れる (登録の増殖を防ぐ)", async () => {
		await registerLockCredential({
			userHandle: USER_HANDLE_B64,
			existingCredentialId: CRED_ID_B64,
		});
		const opts = createMock.mock.calls[0][0].publicKey;
		expect(opts.excludeCredentials).toHaveLength(1);
		expect(Array.from(new Uint8Array(opts.excludeCredentials[0].id))).toEqual(
			Array.from(CRED_ID_BYTES)
		);
	});

	it("非対応環境では create を呼ばず UNSUPPORTED を返す", async () => {
		Object.defineProperty(navigator, "credentials", { value: undefined, configurable: true });
		expect(await register()).toEqual({
			status: "failed",
			reason: LockFailure.WEBAUTHN_UNSUPPORTED,
		});
		expect(createMock).not.toHaveBeenCalled();
	});

	it("InvalidStateError は ALREADY_REGISTERED にマップする", async () => {
		createMock.mockRejectedValue(domError("InvalidStateError"));
		expect(await register()).toEqual({
			status: "failed",
			reason: LockFailure.WEBAUTHN_ALREADY_REGISTERED,
		});
	});

	it("NotAllowedError (キャンセル/タイムアウト) は CANCELLED にマップする", async () => {
		createMock.mockRejectedValue(domError("NotAllowedError"));
		expect(await register()).toEqual({
			status: "failed",
			reason: LockFailure.WEBAUTHN_CANCELLED,
		});
	});

	it("失敗しても in-flight フラグが残らない (次の呼び出しが IN_FLIGHT にならない)", async () => {
		createMock.mockRejectedValueOnce(domError("NotAllowedError"));
		await register();
		const result = await register();
		expect(result).toEqual({ status: "ok", credentialId: CRED_ID_B64 });
	});
});

describe("webauthnLock 解錠 (assertLockCredential)", () => {
	const assert = () => assertLockCredential({ credentialId: CRED_ID_B64 });

	it("成功すると UV フラグ付きで ok を返す", async () => {
		expect(await assert()).toEqual({ status: "ok", userVerified: true });
	});

	it("allowCredentials に保存済み ID を internal transport で渡す", async () => {
		await assert();
		const opts = getMock.mock.calls[0][0].publicKey;
		expect(opts.userVerification).toBe("required");
		expect(opts.allowCredentials).toHaveLength(1);
		expect(Array.from(new Uint8Array(opts.allowCredentials[0].id))).toEqual(
			Array.from(CRED_ID_BYTES)
		);
		expect(opts.allowCredentials[0].transports).toEqual(["internal"]);
	});

	it("UV ビットが立っていなければ userVerified=false で返す (downgrade 検知)", async () => {
		getMock.mockResolvedValue({
			type: "public-key",
			rawId: toArrayBuffer(CRED_ID_BYTES),
			response: { authenticatorData: authDataWithUv(false) },
		});
		expect(await assert()).toEqual({ status: "ok", userVerified: false });
	});

	it("登録したものと違う credential が返ったら失敗扱い", async () => {
		getMock.mockResolvedValue(fakeCredential(new Uint8Array([9, 9, 9, 9])));
		expect(await assert()).toEqual({
			status: "failed",
			reason: LockFailure.WEBAUTHN_NO_CREDENTIAL,
		});
	});

	it("credential が null なら CANCELLED", async () => {
		getMock.mockResolvedValue(null);
		expect(await assert()).toEqual({
			status: "failed",
			reason: LockFailure.WEBAUTHN_CANCELLED,
		});
	});

	it("未解決の要求がある間は get を再呼び出しせず IN_FLIGHT を返す", async () => {
		let resolveGet: ((v: unknown) => void) | undefined;
		getMock.mockImplementation(
			() =>
				new Promise((resolve) => {
					resolveGet = resolve;
				})
		);
		const first = assert();
		const second = await assert();
		expect(second).toEqual({ status: "failed", reason: LockFailure.IN_FLIGHT });
		expect(getMock).toHaveBeenCalledTimes(1);
		resolveGet?.(fakeCredential());
		await first;
	});
});
