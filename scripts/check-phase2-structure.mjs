#!/usr/bin/env node

import {
	compareNormalizedJson,
	getPhase2FixturePaths,
	readHvdJson,
	readHvzJson,
	readPngEmbeddedHvdJson,
} from "./phase2-fixture-lib.mjs";

function fail(message) {
	throw new Error(message);
}

function assertSame(baseJson, actualJson, label) {
	const result = compareNormalizedJson(baseJson, actualJson);
	if (!result.same) {
		fail(label + ": structure mismatch at " + (result.firstDiffPath || "unknown"));
	}
}

async function main() {
	const paths = getPhase2FixturePaths();
	const hvdJson = await readHvdJson(paths);
	const hvzJson = await readHvzJson(paths);
	const pngJson = await readPngEmbeddedHvdJson(paths);

	assertSame(hvdJson, hvzJson, "hvz");
	assertSame(hvdJson, pngJson, "png");

	console.log("Phase2 structure check: OK");
	console.log("- compared sources: hvd/hvz/png embedded");
	console.log("- slideCount: " + hvdJson.slideData.length);
	console.log("- imageCount: " + Object.keys(hvdJson.imageData || {}).length);
}

main().catch((error) => {
	console.error("Phase2 structure check: NG");
	console.error("- reason: " + (error instanceof Error ? error.message : String(error)));
	process.exit(1);
});
