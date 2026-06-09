#!/usr/bin/env node

import CRC32 from "crc-32";
import JSZip from "jszip";
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const hvdPath = path.join(root, "fixtures/legacy/v2/compat_v2_minimal.hvd");
const pngPath = path.join(root, "fixtures/legacy/png/compat_png_embedded_minimal.png");

const basePng = Buffer.from(
	"iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO6s7QAAAABJRU5ErkJggg==",
	"base64"
);

function createChunk(type, data) {
	const typeBuf = Buffer.from(type, "ascii");
	const lenBuf = Buffer.alloc(4);
	lenBuf.writeUInt32BE(data.length, 0);

	const crcTarget = Buffer.concat([typeBuf, data]);
	const crc = CRC32.buf(crcTarget) >>> 0;
	const crcBuf = Buffer.alloc(4);
	crcBuf.writeUInt32BE(crc, 0);

	return Buffer.concat([lenBuf, typeBuf, data, crcBuf]);
}

function insertBeforeIdat(png, chunk) {
	const signature = png.subarray(0, 8);
	let offset = 8;
	while (offset + 12 <= png.length) {
		const length = png.readUInt32BE(offset);
		const type = png.subarray(offset + 4, offset + 8).toString("ascii");
		const chunkEnd = offset + 12 + length;
		if (type === "IDAT") {
			return Buffer.concat([signature, png.subarray(8, offset), chunk, png.subarray(offset)]);
		}
		offset = chunkEnd;
	}
	throw new Error("IDAT chunk not found");
}

async function main() {
	const hvdText = fs.readFileSync(hvdPath, "utf8");
	const zip = new JSZip();
	zip.file("data.hvd", hvdText);
	const zipped = await zip.generateAsync({ type: "uint8array", compression: "DEFLATE" });

	const embedChunk = createChunk("hvDc", Buffer.from(zipped));
	const output = insertBeforeIdat(basePng, embedChunk);
	fs.writeFileSync(pngPath, output);

	console.log("Generated PNG fixture with embedded data.hvd");
	console.log("- output: fixtures/legacy/png/compat_png_embedded_minimal.png");
	console.log("- bytes: " + output.length);
}

main().catch((error) => {
	console.error(error instanceof Error ? error.message : String(error));
	process.exit(1);
});
