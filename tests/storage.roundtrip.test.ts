import JSZip from "jszip";
import { readFileSync, readdirSync } from "node:fs";
import { basename, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { PNGEmbedder } from "../src/utils/PNGEmbedder";
import { parseHvd, serializeHvd } from "../src/utils/storageCodec";

// P0 regression net: 保存形式 (HVD/HVZ/PNG) の byte-equal 厳密要件 (§0-9)。
// 旧版は legacy SlideStorage で round-trip していたが、Group E で legacy を削除するため
// 新コーデック (storageCodec) の parse→serialize が fixture と byte-equal になることを直接検証する。
// これにより legacy 撤去後も「新側が旧保存データと byte 互換」であることを保証し続ける。

const fixturesDir = resolve(__dirname, "fixtures");

function findAllByExt(...exts: string[]): { name: string; file: string }[] {
	return readdirSync(fixturesDir)
		.filter((f) => !f.startsWith(".") && exts.some((ext) => f.endsWith(ext)))
		.map((f) => ({ name: f, file: resolve(fixturesDir, f) }));
}

const hvdCases = findAllByExt(".hvd");
const hvzCases = findAllByExt(".hvz");
const pngCases = findAllByExt(".png");

// 新コーデックで HVD JSON を parse→再直列化。byte-equal ならフィールド順・値が完全一致。
function roundtripHvd(hvdJson: string): string {
	const { doc, imageData, imageNames } = parseHvd(hvdJson, "roundtrip");
	// imageNames を透過 (名前なし fixture では undefined → 出力に含まれず version 3 のまま = byte-equal)。
	return serializeHvd(doc, imageData, { imageNames });
}

describe("storageCodec round-trip (P0 regression net, byte-equal §0-9)", () => {
	it.each(hvdCases)(".hvd byte-equal: $name", ({ file }) => {
		const original = readFileSync(file, "utf8");
		expect(roundtripHvd(original), `byte-equal failed for ${basename(file)}`).toBe(original);
	});

	it.each(hvzCases)(".hvz byte-equal (inner .hvd): $name", async ({ file }) => {
		const zip = await JSZip.loadAsync(readFileSync(file));
		let hvdJson = "";
		for (const entry of Object.values(zip.files)) {
			if (!entry.dir) {
				hvdJson = await entry.async("string");
				break;
			}
		}
		expect(roundtripHvd(hvdJson), `byte-equal failed for ${basename(file)}`).toBe(hvdJson);
	});

	it.each(pngCases)(".png byte-equal (embedded .hvd): $name", async ({ file }) => {
		const dataUrl = `data:image/png;base64,${readFileSync(file).toString("base64")}`;
		const u8a = new PNGEmbedder().extract(dataUrl);
		// jsdom realm の Uint8Array は Node global と別物で JSZip の instanceof に失敗するため Buffer で wrap。
		const zip = await JSZip.loadAsync(Buffer.from(u8a));
		const entry = zip.file("data.hvd");
		expect(entry, "embedded zip must contain data.hvd").not.toBeNull();
		const hvdJson = await entry!.async("string");
		expect(roundtripHvd(hvdJson), `byte-equal failed for ${basename(file)}`).toBe(hvdJson);
	});
});
