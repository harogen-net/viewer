#!/usr/bin/env node

import path from "node:path";
import { ensureCompatShape, extractEmbedChunkData, writeJsonFile } from "./phase2-fixture-lib.mjs";

const reportPath = path.resolve(process.cwd(), process.env.PHASE2_ERROR_REPORT || "artifacts/phase2/error-case-report.json");

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
		return message;
	}
}

function runCase(label, expectedMessagePart, fn) {
	try {
		const message = assertThrows(fn, expectedMessagePart, label);
		return {
			label,
			ok: true,
			expectedMessagePart,
			actualMessage: message,
		};
	} catch (error) {
		return {
			label,
			ok: false,
			expectedMessagePart,
			actualMessage: error instanceof Error ? error.message : String(error),
		};
	}
}

function main() {
	const results = [
		runCase("invalid-root", "invalid json root", () => ensureCompatShape(null, "invalid")),
		runCase("unsupported-version", "unsupported version", () => ensureCompatShape({ version: 1, slideData: [], imageData: {} }, "v1")),
		runCase("missing-image", "imageData missing", () => ensureCompatShape({ version: 3, slideData: [] }, "missing-image")),
		runCase("png-invalid-signature", "invalid signature", () => extractEmbedChunkData(Buffer.from("not a png", "utf8"))),
	];

	const failed = results.filter((item) => !item.ok);
	const report = {
		checkedAt: new Date().toISOString(),
		reportVersion: 1,
		ok: failed.length === 0,
		results,
	};
	writeJsonFile(reportPath, report);

	if (failed.length > 0) {
		fail(failed[0].label + ": " + failed[0].actualMessage + " (report: " + reportPath + ")");
	}

	console.log("Phase2 error-case check: OK");
	console.log("- validated cases: invalid-root, unsupported-version, missing-image, png-invalid-signature");
	console.log("- report: " + reportPath);
}

try {
	main();
} catch (error) {
	console.error("Phase2 error-case check: NG");
	console.error("- reason: " + (error instanceof Error ? error.message : String(error)));
	process.exit(1);
}