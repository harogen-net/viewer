import $ from "jquery";
import JSZip from "jszip";
import { readFileSync, readdirSync } from "node:fs";
import { basename, resolve } from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import { ImageManager } from "../src/utils/ImageManager";
import { PNGEmbedder } from "../src/utils/PNGEmbedder";
import { SlideStorage } from "../src/utils/SlideStorage";

const fixturesDir = resolve(__dirname, "fixtures");

function findAllByExt(...exts: string[]): { name: string; file: string }[] {
	return readdirSync(fixturesDir)
		.filter((f) => !f.startsWith(".") && exts.some((ext) => f.endsWith(ext)))
		.map((f) => ({ name: f, file: resolve(fixturesDir, f) }));
}

const hvdCases = findAllByExt(".hvd");
const hvzCases = findAllByExt(".hvz");
const pngCases = findAllByExt(".png");

beforeAll(() => {
	ImageManager.init($("body"));
});

async function roundtripHvd(hvdJson: string): Promise<string> {
	const storage: any = SlideStorage.getInstance();
	const doc = await storage.parseData(hvdJson);
	return storage.stringifyData(doc);
}

describe("SlideStorage round-trip (P0 regression net)", () => {
	it.each(hvdCases)(".hvd byte-equal: $name", async ({ file }) => {
		const original = readFileSync(file, "utf8");
		const restringified = await roundtripHvd(original);
		expect(restringified, `byte-equal failed for ${basename(file)}`).toBe(original);
	});

	it.each(hvzCases)(".hvz byte-equal: $name", async ({ file }) => {
		const buf = readFileSync(file);
		const zip = await JSZip.loadAsync(buf);
		let hvdJson = "";
		for (const entry of Object.values(zip.files)) {
			if (!entry.dir) {
				hvdJson = await entry.async("string");
				break;
			}
		}
		const restringified = await roundtripHvd(hvdJson);
		expect(restringified, `byte-equal failed for ${basename(file)}`).toBe(hvdJson);
	});

	it.each(pngCases)(".png byte-equal: $name", async ({ file }) => {
		const buf = readFileSync(file);
		const dataUrl = "data:image/png;base64," + buf.toString("base64");
		const embedder = new PNGEmbedder();
		const u8a = embedder.extract(dataUrl);
		// jsdom realm の Uint8Array は Node global と別物で JSZip の instanceof 判定に失敗する。Buffer で wrap。
		const zip = await JSZip.loadAsync(Buffer.from(u8a));
		const entry = zip.file("data.hvd");
		expect(entry, "embedded zip must contain data.hvd").not.toBeNull();
		const hvdJson = await entry!.async("string");
		const restringified = await roundtripHvd(hvdJson);
		expect(restringified, `byte-equal failed for ${basename(file)}`).toBe(hvdJson);
	});
});
