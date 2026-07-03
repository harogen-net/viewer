// @vitest-environment node
// crypto.subtle (Web Crypto) が必要。jsdom には無いことがあるため node 環境で実行する。
import { describe, expect, it } from "vitest";
import {
	decryptImageData,
	encryptImageData,
	verifyPassword,
} from "../../src/utils/sensitiveCrypto";

const sample: Record<string, string> = {
	"img-1": "data:image/png;base64,SEExAAAAsecretPIXELdata1",
	"img-2": "data:image/png;base64,SEEyBBBBsecretPIXELdata2",
};

describe("sensitiveCrypto (PBKDF2 + AES-GCM)", () => {
	it("encrypt→decrypt で元の imageData に戻る", async () => {
		const payload = await encryptImageData(sample, "hunter2");
		const restored = await decryptImageData(payload, "hunter2");
		expect(restored).toEqual(sample);
	});

	it("暗号文に平文 (dataURL の中身) が露出しない", async () => {
		const payload = await encryptImageData(sample, "hunter2");
		expect(payload.ciphertext).not.toContain("secretPIXELdata");
		expect(payload.ciphertext).not.toContain("data:image");
	});

	it("誤ったパスワードでは復号が throw する", async () => {
		const payload = await encryptImageData(sample, "correct-horse");
		await expect(decryptImageData(payload, "wrong")).rejects.toThrow();
	});

	it("verifyPassword が正誤を判定する (復号可否ベース)", async () => {
		const payload = await encryptImageData(sample, "pw");
		expect(await verifyPassword(payload, "pw")).toBe(true);
		expect(await verifyPassword(payload, "nope")).toBe(false);
	});

	it("salt/iv は毎回ランダム (同一入力でも ciphertext が変わる)", async () => {
		const a = await encryptImageData(sample, "pw");
		const b = await encryptImageData(sample, "pw");
		expect(a.security.salt).not.toBe(b.security.salt);
		expect(a.security.iv).not.toBe(b.security.iv);
		expect(a.ciphertext).not.toBe(b.ciphertext);
	});

	it("security メタが仕様通り (PBKDF2 / AES-GCM / version1)", async () => {
		const { security } = await encryptImageData(sample, "pw");
		expect(security).toMatchObject({ version: 1, kdf: "PBKDF2", cipher: "AES-GCM" });
		expect(security.kdfIterations).toBeGreaterThanOrEqual(100_000);
	});

	it("未対応 version は復号を拒否する", async () => {
		const payload = await encryptImageData(sample, "pw");
		const tampered = { ...payload, security: { ...payload.security, version: 99 } };
		await expect(decryptImageData(tampered, "pw")).rejects.toThrow(/未対応/);
	});

	it("空 imageData も round-trip する", async () => {
		const payload = await encryptImageData({}, "pw");
		expect(await decryptImageData(payload, "pw")).toEqual({});
	});

	it("大容量 (base64 チャンク分岐を跨ぐ) データも round-trip する", async () => {
		// bytesToBase64 の CHUNK(32KB) 境界を確実に跨ぐ大きさ。
		const big = { "img-big": `data:image/png;base64,${"A".repeat(200_000)}` };
		const payload = await encryptImageData(big, "pw");
		expect(await decryptImageData(payload, "pw")).toEqual(big);
	});

	it("暗号文を改竄すると復号が throw する (GCM 認証タグ)", async () => {
		const payload = await encryptImageData(sample, "pw");
		const head = payload.ciphertext[0] === "A" ? "B" : "A";
		const tampered = { ...payload, ciphertext: head + payload.ciphertext.slice(1) };
		await expect(decryptImageData(tampered, "pw")).rejects.toThrow();
	});
});
