import JSZip from "jszip";
import fs from "node:fs";
import path from "node:path";

const PNG_SIGNATURE = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
const EMBED_CHUNK_TYPE = "hvDc";

export function getPhase2FixturePaths(root = process.cwd()) {
	return {
		hvd: path.join(root, "fixtures/legacy/v2/compat_v2_minimal.hvd"),
		hvz: path.join(root, "fixtures/legacy/v2/compat_v2_minimal.hvz"),
		png: path.join(root, "fixtures/legacy/png/compat_png_embedded_minimal.png"),
		sensitive: path.join(root, "fixtures/sensitive/sensitive_locked_sample.hvd"),
	};
}

export function ensureCompatShape(json, label) {
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

export async function readHvdJson(paths) {
	const text = fs.readFileSync(paths.hvd, "utf8");
	const json = JSON.parse(text);
	ensureCompatShape(json, "hvd");
	return json;
}

export async function readHvzJson(paths) {
	const zipBuffer = fs.readFileSync(paths.hvz);
	const zip = await JSZip.loadAsync(zipBuffer);
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

export function extractEmbedChunkData(pngBuffer) {
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

export async function readPngEmbeddedHvdJson(paths) {
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

function toStableValue(value) {
	if (Array.isArray(value)) {
		return value.map((item) => toStableValue(item));
	}
	if (value && typeof value === "object") {
		const out = {};
		for (const key of Object.keys(value).sort()) {
			out[key] = toStableValue(value[key]);
		}
		return out;
	}
	return value;
}

export function toStableJsonString(value) {
	return JSON.stringify(toStableValue(value));
}
