#!/usr/bin/env node

import {
    getPhase2FixturePaths,
    readHvdJson,
    readHvzJson,
    readPngEmbeddedHvdJson,
} from "./phase2-fixture-lib.mjs";

function compareCoreShape(base, other, label) {
	if (base.version !== other.version) {
		throw new Error(label + ": version mismatch");
	}
	if (base.slideData.length !== other.slideData.length) {
		throw new Error(label + ": slide count mismatch");
	}
}

async function main() {
	const paths = getPhase2FixturePaths();
	const hvd = await readHvdJson(paths);
	const hvz = await readHvzJson(paths);
	const png = await readPngEmbeddedHvdJson(paths);

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
