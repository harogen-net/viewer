#!/usr/bin/env node

import JSZip from "jszip";
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();

const paths = {
	hvd: path.join(root, "fixtures/legacy/v2/compat_v2_minimal.hvd"),
	hvz: path.join(root, "fixtures/legacy/v2/compat_v2_minimal.hvz"),
	png: path.join(root, "fixtures/legacy/png/compat_png_embedded_minimal.png"),
};

const PNG_SIGNATURE = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
const EMBED_CHUNK_TYPE = "hvDc";

function ensureCompatShape(json, label) {
	if (!json || typeof json !== "object") {
		throw new Error(label + ": invalid json root");
	}
	if (typeof json.version !== "number" || json.version < 2) {
		throw new Error(label + ": unsupported version");
	}
	if (!Array.isArray(json.slideData)) {
		throw new Error(label + ": slideData missing");
	}
	if (typeof json.imageData !== "object" || json.imageData == null) {
		throw new Error(label + ": imageData missing");
	}
}

async function readHvd() {
	const text = fs.readFileSync(paths.hvd, "utf8");
	const json = JSON.parse(text);
	ensureCompatShape(json, "hvd");
	return json;
}

async function readHvz() {
	const buffer = fs.readFileSync(paths.hvz);
	const zip = await JSZip.loadAsync(buffer);
	const hvdEntry = Object.values(zip.files).find((entry) => {
		return !entry.dir && entry.name.toLowerCase().endsWith(".hvd");
	});
	if (!hvdEntry) {
		throw new Error("hvz: hvd entry missing");
	}
	const text = await hvdEntry.async("string");
	const json = JSON.parse(text);
	ensureCompatShape(json, "hvz");
	return json;
}

function extractEmbedChunkData(pngBuffer) {
	if (pngBuffer.subarray(0, 8).compare(PNG_SIGNATURE) !== 0) {
		throw new Error("png: invalid signature");
	}

	let offset = 8;
	while (offset + 12 <= pngBuffer.length) {
		const length = pngBuffer.readUInt32BE(offset);
		const type = pngBuffer.subarray(offset + 4, offset + 8).toString("ascii");
		const dataStart = offset + 8;
		const dataEnd = dataStart + length;
		const chunkEnd = dataEnd + 4;
		if (chunkEnd > pngBuffer.length) {
			throw new Error("png: invalid chunk layout");
		}
		if (type === EMBED_CHUNK_TYPE) {
			return pngBuffer.subarray(dataStart, dataEnd);
		}
		offset = chunkEnd;
	}

	throw new Error("png: embedded chunk hvDc not found");
}

async function readPngEmbeddedHvd() {
	const pngBuffer = fs.readFileSync(paths.png);
	const embeddedBytes = extractEmbedChunkData(pngBuffer);
	const zip = await JSZip.loadAsync(embeddedBytes);
	const entry = zip.file("data.hvd");
	if (!entry) {
		throw new Error("png: data.hvd missing");
	}
	const text = await entry.async("string");
	const json = JSON.parse(text);
	ensureCompatShape(json, "png");
	return json;
}

function compareCoreShape(base, other, label) {
	if (base.version !== other.version) {
		throw new Error(label + ": version mismatch");
	}
	if (base.slideData.length !== other.slideData.length) {
		throw new Error(label + ": slide count mismatch");
	}
}

async function main() {
	const hvd = await readHvd();
	const hvz = await readHvz();
	const png = await readPngEmbeddedHvd();

	compareCoreShape(hvd, hvz, "hvz");
	compareCoreShape(hvd, png, "png");

	console.log("Phase2 compat check: OK");
	console.log("- sources: hvd/hvz/png embedded");
	console.log("- version: " + hvd.version);
	console.log("- slide count: " + hvd.slideData.length);
}

main().catch((error) => {
	console.error("Phase2 compat check: NG");
	console.error("- reason: " + (error instanceof Error ? error.message : String(error)));
	process.exit(1);
});
