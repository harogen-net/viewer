// @vitest-environment node
// crypto.subtle (Web Crypto) が必要。jsdom には無いことがあるため node 環境で実行する
// (tests/utils/sensitiveCrypto.test.ts と同方針)。

import { describe, expect, it } from "vitest";
import {
	createPasscodeVerifier,
	isValidPasscodeFormat,
	PASSCODE_MAX_LENGTH,
	PASSCODE_MIN_LENGTH,
	verifyPasscode,
} from "../../src/utils/appLockPasscode";

describe("appLockPasscode 形式チェック", () => {
	it("最小桁数未満は拒否する", () => {
		expect(isValidPasscodeFormat("1".repeat(PASSCODE_MIN_LENGTH - 1))).toBe(false);
	});

	it("最小桁数ちょうどは許可する", () => {
		expect(isValidPasscodeFormat("1".repeat(PASSCODE_MIN_LENGTH))).toBe(true);
	});

	it("最大桁数ちょうどは許可し、超過は拒否する", () => {
		expect(isValidPasscodeFormat("1".repeat(PASSCODE_MAX_LENGTH))).toBe(true);
		expect(isValidPasscodeFormat("1".repeat(PASSCODE_MAX_LENGTH + 1))).toBe(false);
	});

	it("ASCII 数字以外は拒否する (全角数字・英字・記号)", () => {
		expect(isValidPasscodeFormat("１２３４５６")).toBe(false);
		expect(isValidPasscodeFormat("abcdef")).toBe(false);
		expect(isValidPasscodeFormat("12345-")).toBe(false);
		expect(isValidPasscodeFormat("")).toBe(false);
	});
});

describe("appLockPasscode 検証子", () => {
	it("正しいパスコードで検証が通り、誤りでは通らない", async () => {
		const verifier = await createPasscodeVerifier("123456");
		expect(await verifyPasscode(verifier, "123456")).toBe(true);
		expect(await verifyPasscode(verifier, "123457")).toBe(false);
	});

	it("検証子に平文パスコードも sentinel 文字列も現れない", async () => {
		const verifier = await createPasscodeVerifier("135790");
		const serialized = JSON.stringify(verifier);
		expect(serialized).not.toContain("135790");
		expect(serialized).not.toContain("viewer-app-lock");
	});

	it("生成のたびに salt/iv が変わる (同じパスコードでも暗号文が一致しない)", async () => {
		const a = await createPasscodeVerifier("123456");
		const b = await createPasscodeVerifier("123456");
		expect(a.security.salt).not.toBe(b.security.salt);
		expect(a.security.iv).not.toBe(b.security.iv);
		expect(a.ciphertext).not.toBe(b.ciphertext);
		// salt/iv が違っても、どちらも同じパスコードで開ける。
		expect(await verifyPasscode(b, "123456")).toBe(true);
	});

	it("kdfIterations を十分な回数で記録する (総当たり耐性の下限)", async () => {
		const verifier = await createPasscodeVerifier("123456");
		expect(verifier.security.kdf).toBe("PBKDF2");
		expect(verifier.security.kdfIterations).toBeGreaterThanOrEqual(100_000);
	});

	it("kdfIterations を下限未満へ書き換えたレコードは拒否する (ダウングレード防止)", async () => {
		const verifier = await createPasscodeVerifier("123456");
		const tampered = {
			...verifier,
			security: { ...verifier.security, kdfIterations: 1 },
		};
		expect(await verifyPasscode(tampered, "123456")).toBe(false);
	});
});
