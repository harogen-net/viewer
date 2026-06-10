#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";

const projectRoot = process.cwd();

const expectedFiles = [
	{ path: "fixtures/legacy/v2/compat_v2_minimal.hvd", minBytes: 32 },
	{ path: "fixtures/legacy/v2/compat_v2_minimal.hvz", minBytes: 32 },
	{ path: "fixtures/legacy/png/compat_png_embedded_minimal.png", minBytes: 64 },
	{ path: "fixtures/sensitive/sensitive_locked_sample.hvd", minBytes: 32 },
	{ path: "fixtures/error/unsupported_v1_sample.hvd", minBytes: 16 },
	{ path: "fixtures/error/broken_payload_sample.hvz", minBytes: 8 },
	{ path: "fixtures/error/broken_embed_sample.png", minBytes: 8 },
];

const missing = [];
const tooSmall = [];

expectedFiles.forEach((entry) => {
	const absolutePath = path.join(projectRoot, entry.path);
	if (!fs.existsSync(absolutePath)) {
		missing.push(entry.path);
		return;
	}

	const stats = fs.statSync(absolutePath);
	if (stats.size < entry.minBytes) {
		tooSmall.push({ path: entry.path, size: stats.size, minBytes: entry.minBytes });
	}
});

if (missing.length === 0 && tooSmall.length === 0) {
	console.log("Phase2 fixture check: OK");
	console.log("- checked files: " + expectedFiles.length);
	process.exit(0);
}

console.error("Phase2 fixture check: NG");

if (missing.length > 0) {
	console.error("missing files:");
	missing.forEach((relativePath) => {
		console.error("- " + relativePath);
	});
}

if (tooSmall.length > 0) {
	console.error("files below minimum size:");
	tooSmall.forEach((entry) => {
		console.error(
			"- " + entry.path + " (actual=" + entry.size + " bytes, required>=" + entry.minBytes + ")"
		);
	});
}

console.error(
	"summary: missing=" + missing.length + ", tooSmall=" + tooSmall.length + ", checked=" + expectedFiles.length
);

process.exit(1);
