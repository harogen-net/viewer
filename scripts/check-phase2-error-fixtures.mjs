#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import {
	ensureCompatShape,
	getPhase2FixturePaths,
	readHvzJson,
	readPngEmbeddedHvdJson,
	writeJsonFile,
} from "./phase2-fixture-lib.mjs";

const reportPath = path.resolve(
	process.cwd(),
	process.env.PHASE2_ERROR_FIXTURE_REPORT || "artifacts/phase2/error-fixture-report.json"
);

function fail(message) {
	throw new Error(message);
}

function runCase(label, expectedMessagePart, fn) {
	try {
		fn();
		return {
			label,
			ok: false,
			expectedMessagePart,
			actualMessage: "did not throw",
		};
	} catch (error) {
		const actualMessage = error instanceof Error ? error.message : String(error);
		const ok = expectedMessagePart
			? actualMessage.includes(expectedMessagePart)
			: actualMessage.length > 0;
		return {
			label,
			ok,
			expectedMessagePart: expectedMessagePart || "<non-empty>",
			actualMessage,
		};
	}
}

async function main() {
	const fixtureRoot = path.join(process.cwd(), "fixtures/error");
	const unsupportedPath = path.join(fixtureRoot, "unsupported_v1_sample.hvd");
	const brokenHvzPath = path.join(fixtureRoot, "broken_payload_sample.hvz");
	const brokenPngPath = path.join(fixtureRoot, "broken_embed_sample.png");
	const basePaths = getPhase2FixturePaths();

	const unsupportedText = fs.readFileSync(unsupportedPath, "utf8");
	const unsupportedJson = JSON.parse(unsupportedText);
	const unsupportedResult = runCase(
		"unsupported-version-fixture",
		"unsupported version",
		() => ensureCompatShape(unsupportedJson, "unsupported-fixture")
	);

	const hvzResult = await (async () => {
		try {
			await readHvzJson({ ...basePaths, hvz: brokenHvzPath });
			return {
				label: "broken-hvz-fixture",
				ok: false,
				expectedMessagePart: "<throw>",
				actualMessage: "did not throw",
			};
		} catch (error) {
			return {
				label: "broken-hvz-fixture",
				ok: true,
				expectedMessagePart: "<throw>",
				actualMessage: error instanceof Error ? error.message : String(error),
			};
		}
	})();

	const pngResult = await (async () => {
		try {
			await readPngEmbeddedHvdJson({ ...basePaths, png: brokenPngPath });
			return {
				label: "broken-png-fixture",
				ok: false,
				expectedMessagePart: "invalid signature",
				actualMessage: "did not throw",
			};
		} catch (error) {
			const actualMessage = error instanceof Error ? error.message : String(error);
			return {
				label: "broken-png-fixture",
				ok: actualMessage.includes("invalid signature"),
				expectedMessagePart: "invalid signature",
				actualMessage,
			};
		}
	})();

	const results = [unsupportedResult, hvzResult, pngResult];
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

	console.log("Phase2 error-fixture check: OK");
	console.log("- validated fixtures: unsupported_v1_sample.hvd, broken_payload_sample.hvz, broken_embed_sample.png");
	console.log("- report: " + reportPath);
}

main().catch((error) => {
	console.error("Phase2 error-fixture check: NG");
	console.error("- reason: " + (error instanceof Error ? error.message : String(error)));
	process.exit(1);
});
