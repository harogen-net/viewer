#!/usr/bin/env node

import path from "node:path";
import {
	compareNormalizedJson,
    getPhase2FixturePaths,
    readHvdJson,
    readHvzJson,
    readPngEmbeddedHvdJson,
	writeJsonFile,
} from "./phase2-fixture-lib.mjs";

const reportPath = path.resolve(process.cwd(), process.env.PHASE2_STRUCTURE_REPORT || "artifacts/phase2/structure-check-report.json");

function fail(message) {
	throw new Error(message);
}

function summarizeMismatch(label, baseJson, actualJson) {
	const result = compareNormalizedJson(baseJson, actualJson);
	if (result.same) {
		return null;
	}
	return {
		label,
		firstDiffPath: result.firstDiffPath || "unknown",
		baseValueAtDiff: result.baseValueAtDiff,
		actualValueAtDiff: result.actualValueAtDiff,
	};
}

async function main() {
	const paths = getPhase2FixturePaths();
	const hvdJson = await readHvdJson(paths);
	const hvzJson = await readHvzJson(paths);
	const pngJson = await readPngEmbeddedHvdJson(paths);

	const mismatches = [];
	const hvzMismatch = summarizeMismatch("hvz", hvdJson, hvzJson);
	if (hvzMismatch) {
		mismatches.push(hvzMismatch);
	}
	const pngMismatch = summarizeMismatch("png", hvdJson, pngJson);
	if (pngMismatch) {
		mismatches.push(pngMismatch);
	}

	const report = {
		checkedAt: new Date().toISOString(),
		sources: ["hvd", "hvz", "png embedded"],
		reportVersion: 1,
		slideCount: hvdJson.slideData.length,
		imageCount: Object.keys(hvdJson.imageData || {}).length,
		ok: mismatches.length === 0,
		mismatches,
	};
	writeJsonFile(reportPath, report);

	if (mismatches.length > 0) {
		const first = mismatches[0];
		fail(first.label + ": structure mismatch at " + first.firstDiffPath + " (report: " + reportPath + ")");
	}

	console.log("Phase2 structure check: OK");
	console.log("- compared sources: hvd/hvz/png embedded");
	console.log("- slideCount: " + hvdJson.slideData.length);
	console.log("- imageCount: " + Object.keys(hvdJson.imageData || {}).length);
	console.log("- report: " + reportPath);
}

main().catch((error) => {
	console.error("Phase2 structure check: NG");
	console.error("- reason: " + (error instanceof Error ? error.message : String(error)));
	process.exit(1);
});
