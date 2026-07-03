// @vitest-environment node
// 暗号化 (crypto.subtle) が要るため node 環境。sensitive 文書の HVD/HVZ 永続化 (Phase 2)。
import { describe, expect, it } from "vitest";
import type { Slide } from "../../src/types/Slide";
import type { ViewerDocument } from "../../src/types/ViewerDocument";
import { decryptImageData, encryptImageData } from "../../src/utils/sensitiveCrypto";
import { parseHvd, parseHvz, serializeHvd, serializeHvz } from "../../src/utils/storageCodec";

const imageMap: Record<string, string> = {
	"img-1": "data:image/png;base64,SECRETpixelsAAAA",
};

const makeSlide = (): Slide => ({
	id: 1,
	uuid: "s1",
	width: 800,
	height: 600,
	durationRatio: 1,
	joining: true,
	disabled: false,
	layers: [
		{
			id: 1,
			uuid: "l1",
			name: "",
			opacity: 1,
			locked: false,
			visible: true,
			shared: false,
			transX: 0,
			transY: 0,
			scaleX: 1,
			scaleY: 1,
			rotation: 0,
			mirrorH: false,
			mirrorV: false,
			type: "image",
			imageId: "img-1",
			clipRect: [0, 0, 0, 0],
			isText: false,
		},
	],
});

const makeSensitiveDoc = (): ViewerDocument => ({
	title: "secret",
	width: 800,
	height: 600,
	createTime: 1000,
	editTime: 2000,
	isSensitive: true,
	slides: [makeSlide()],
});

describe("storageCodec sensitive (Phase 2 永続化)", () => {
	it("HVD: encrypt→serialize→parse→decrypt で imageData が復元する", async () => {
		const doc = makeSensitiveDoc();
		const encrypted = await encryptImageData(imageMap, "pw");
		const json = serializeHvd(doc, imageMap, { encrypted });

		const parsed = parseHvd(json, "secret");
		expect(parsed.doc.isSensitive).toBe(true);
		expect(parsed.imageData).toEqual({}); // parse は復号しない
		expect(parsed.encrypted).toBeDefined();

		const restored = await decryptImageData(parsed.encrypted!, "pw");
		expect(restored).toEqual(imageMap);
	});

	it("HVD: 直列化 JSON に平文画像データが露出しない", async () => {
		const doc = makeSensitiveDoc();
		const encrypted = await encryptImageData(imageMap, "pw");
		const json = serializeHvd(doc, imageMap, { encrypted });
		expect(json).not.toContain("SECRETpixels");
		expect(json).not.toContain("data:image");
		expect(json).toContain("imageDataEnc");
		expect(json).toContain("AES-GCM");
	});

	it("HVD: 誤ったパスワードでは復号が throw する", async () => {
		const doc = makeSensitiveDoc();
		const encrypted = await encryptImageData(imageMap, "correct");
		const parsed = parseHvd(serializeHvd(doc, imageMap, { encrypted }), "secret");
		await expect(decryptImageData(parsed.encrypted!, "wrong")).rejects.toThrow();
	});

	it("安全弁: sensitive 文書を encrypted なしで serialize すると throw する", () => {
		const doc = makeSensitiveDoc();
		expect(() => serializeHvd(doc, imageMap)).toThrow(/暗号化済みペイロード/);
	});

	it("HVZ: sensitive の round-trip でも暗号化 imageData が保たれる", async () => {
		const doc = makeSensitiveDoc();
		const encrypted = await encryptImageData(imageMap, "pw");
		const hvz = await serializeHvz(doc, imageMap, { encrypted });

		const parsed = await parseHvz(hvz, "secret");
		expect(parsed.doc.isSensitive).toBe(true);
		expect(parsed.encrypted).toBeDefined();
		expect(await decryptImageData(parsed.encrypted!, "pw")).toEqual(imageMap);
	});

	it("非 sensitive 文書は従来通り平文 imageData を保持する (回帰)", () => {
		const doc: ViewerDocument = { ...makeSensitiveDoc(), isSensitive: false };
		const json = serializeHvd(doc, imageMap);
		const parsed = parseHvd(json, "plain");
		expect(parsed.encrypted).toBeUndefined();
		expect(parsed.imageData).toEqual(imageMap); // 参照されている img-1 が平文で入る
	});
});
