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

function fail(message) {
	throw new Error(message);
}

function ensureCompatShape(json, label) {
	if (!json || typeof json !== "object") fail(label + ": invalid json root");
	if (typeof json.version !== "number" || json.version < 2) fail(label + ": unsupported version");
	if (!Array.isArray(json.slideData)) fail(label + ": slideData missing");
	if (typeof json.imageData !== "object" || json.imageData == null) fail(label + ": imageData missing");
}

function pickCoreFields(json) {
	const firstSlide = json.slideData[0] || {};
	const layers = Array.isArray(firstSlide.layers) ? firstSlide.layers : [];
	const firstLayer = layers[0] || null;

	const picked = {
		bgColor: json.bgColor || null,
		slideCount: json.slideData.length,
		firstSlide: {
			durationRatio: firstSlide.durationRatio ?? null,
			joining: firstSlide.joining ?? null,
			disabled: firstSlide.disabled ?? null,
			layerCount: layers.length,
		},
		firstLayerTransform: firstLayer
			? {
				transX: firstLayer.transX ?? null,
				transY: firstLayer.transY ?? null,
				scaleX: firstLayer.scaleX ?? null,
				scaleY: firstLayer.scaleY ?? null,
				rotation: firstLayer.rotation ?? null,
			}
			: null,
	};

	return picked;
}

function assertDeepEqual(base, actual, label) {
	const baseStr = JSON.stringify(base);
	const actualStr = JSON.stringify(actual);
	if (baseStr !== actualStr) {
		fail(label + ": core fields mismatch\nbase=" + baseStr + "\nactual=" + actualStr);
	}
}

async function readHvd() {
	const text = fs.readFileSync(paths.hvd, "utf8");
	const json = JSON.parse(text);
	ensureCompatShape(json, "hvd");
	return json;
}

async function readHvz() {
	const zipBuffer = fs.readFileSync(paths.hvz);
	const zip = await JSZip.loadAsync(zipBuffer);
	const hvdEntry = Object.values(zip.files).find((entry) => !entry.dir && entry.name.toLowerCase().endsWith(".hvd"));
	if (!hvdEntry) fail("hvz: hvd entry missing");
	const text = await hvdEntry.async("string");
	const json = JSON.parse(text);
	ensureCompatShape(json, "hvz");
	return json;
}

function extractEmbedChunkData(pngBuffer) {
	if (pngBuffer.subarray(0, 8).compare(PNG_SIGNATURE) !== 0) fail("png: invalid signature");

	let offset = 8;
	while (offset + 12 <= pngBuffer.length) {
		const length = pngBuffer.readUInt32BE(offset);
		const type = pngBuffer.subarray(offset + 4, offset + 8).toString("ascii");
		const dataStart = offset + 8;
		const dataEnd = dataStart + length;
		const chunkEnd = dataEnd + 4;
		if (chunkEnd > pngBuffer.length) fail("png: invalid chunk layout");
		if (type === EMBED_CHUNK_TYPE) return pngBuffer.subarray(dataStart, dataEnd);
		offset = chunkEnd;
	}

	fail("png: embedded chunk hvDc not found");
}

async function readPngEmbeddedHvd() {
	const pngBuffer = fs.readFileSync(paths.png);
	const embeddedBytes = extractEmbedChunkData(pngBuffer);
	const zip = await JSZip.loadAsync(embeddedBytes);
	const entry = zip.file("data.hvd");
	if (!entry) fail("png: data.hvd missing");
	const text = await entry.async("string");
	const json = JSON.parse(text);
	ensureCompatShape(json, "png");
	return json;
}

async function main() {
	const hvdJson = await readHvd();
	const hvzJson = await readHvz();
	const pngJson = await readPngEmbeddedHvd();

	const hvdCore = pickCoreFields(hvdJson);
	assertDeepEqual(hvdCore, pickCoreFields(hvzJson), "hvz");
	assertDeepEqual(hvdCore, pickCoreFields(pngJson), "png");

	console.log("Phase2 core-field check: OK");
	console.log("- compared sources: hvd/hvz/png embedded");
	console.log("- bgColor: " + (hvdCore.bgColor ?? "null"));
	console.log("- slideCount: " + hvdCore.slideCount);
	console.log("- firstSlide.layerCount: " + hvdCore.firstSlide.layerCount);
}

main().catch((error) => {
	console.error("Phase2 core-field check: NG");
	console.error("- reason: " + (error instanceof Error ? error.message : String(error)));
	process.exit(1);
});
