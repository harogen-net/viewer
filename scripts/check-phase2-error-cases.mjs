#!/usr/bin/env node

import { ensureCompatShape, extractEmbedChunkData } from "./phase2-fixture-lib.mjs";

function fail(message) {
	throw new Error(message);
}

function assertThrows(fn, expectedMessagePart, label) {
	try {
		fn();
		fail(label + ": did not throw");
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error);
		if (!message.includes(expectedMessagePart)) {
			fail(label + ": unexpected message: " + message);
		}
	}
}

function main() {
	assertThrows(() => ensureCompatShape(null, "invalid"), "invalid json root", "invalid-root");

	assertThrows(
		() => ensureCompatShape({ version: 1, slideData: [], imageData: {} }, "v1"),
		"unsupported version",
		"unsupported-version"
	);

	assertThrows(
		() => ensureCompatShape({ version: 3, slideData: [] }, "missing-image"),
		"imageData missing",
		"missing-image"
	);

	assertThrows(
		() => extractEmbedChunkData(Buffer.from("not a png", "utf8")),
		"invalid signature",
		"png-invalid-signature"
	);

	console.log("Phase2 error-case check: OK");
	console.log("- validated cases: invalid-root, unsupported-version, missing-image, png-invalid-signature");
}

try {
	main();
} catch (error) {
	console.error("Phase2 error-case check: NG");
	console.error("- reason: " + (error instanceof Error ? error.message : String(error)));
	process.exit(1);
}