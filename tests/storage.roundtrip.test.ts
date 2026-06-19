import $ from "jquery";
import JSZip from "jszip";
import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import { ImageManager } from "../src/utils/ImageManager";
import { PNGEmbedder } from "../src/utils/PNGEmbedder";
import { SlideStorage } from "../src/utils/SlideStorage";

const fixturesDir = resolve(__dirname, "fixtures");

function findByExt(...exts: string[]): string | null {
	const files = readdirSync(fixturesDir).filter(
		(f) => !f.startsWith(".") && exts.some((ext) => f.endsWith(ext))
	);
	return files[0] ? resolve(fixturesDir, files[0]) : null;
}

const hvdFile = findByExt(".hvd");
const hvzFile = findByExt(".hvz");
const pngFile = findByExt(".png");

beforeAll(() => {
	ImageManager.init($("body"));
});

async function roundtripHvd(hvdJson: string): Promise<string> {
	const storage: any = SlideStorage.getInstance();
	const doc = await storage.parseData(hvdJson);
	return storage.stringifyData(doc);
}

describe("SlideStorage round-trip (P0 regression net)", () => {
	it.skipIf(!hvdFile)(".hvd: parseData → stringifyData is byte-equal", async () => {
		const original = readFileSync(hvdFile!, "utf8");
		const restringified = await roundtripHvd(original);
		expect(restringified).toBe(original);
	});

	it.skipIf(!hvzFile)(".hvz: unzip → parseData → stringifyData is byte-equal", async () => {
		const buf = readFileSync(hvzFile!);
		const zip = await JSZip.loadAsync(buf);
		let hvdJson = "";
		for (const entry of Object.values(zip.files)) {
			if (!entry.dir) {
				hvdJson = await entry.async("string");
				break;
			}
		}
		const restringified = await roundtripHvd(hvdJson);
		expect(restringified).toBe(hvdJson);
	});

	it.skipIf(!pngFile)(".png: PNGEmbedder → unzip → parseData → stringifyData is byte-equal", async () => {
		const buf = readFileSync(pngFile!);
		const dataUrl = "data:image/png;base64," + buf.toString("base64");
		const embedder = new PNGEmbedder();
		const u8a = embedder.extract(dataUrl);
		// jsdom realm の Uint8Array は Node global と別物で JSZip の instanceof 判定に失敗する。Buffer で wrap。
		const zip = await JSZip.loadAsync(Buffer.from(u8a));
		const entry = zip.file("data.hvd");
		expect(entry, "embedded zip must contain data.hvd").not.toBeNull();
		const hvdJson = await entry!.async("string");
		const restringified = await roundtripHvd(hvdJson);
		expect(restringified).toBe(hvdJson);
	});
});
