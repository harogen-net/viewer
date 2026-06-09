#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const sensitivePath = path.join(root, "fixtures/sensitive/sensitive_locked_sample.hvd");

function fail(message) {
	throw new Error(message);
}

function main() {
	if (!fs.existsSync(sensitivePath)) {
		fail("sensitive fixture missing");
	}

	const text = fs.readFileSync(sensitivePath, "utf8");
	const json = JSON.parse(text);

	if (!json || typeof json !== "object") {
		fail("invalid json root");
	}
	if (typeof json.version !== "number" || json.version < 2) {
		fail("unsupported version");
	}
	if (json.isSensitive !== true) {
		fail("isSensitive must be true");
	}
	if (!Array.isArray(json.slideData)) {
		fail("slideData missing");
	}

	console.log("Phase2 sensitive check: OK");
	console.log("- fixture: fixtures/sensitive/sensitive_locked_sample.hvd");
	console.log("- version: " + json.version);
	console.log("- slideCount: " + json.slideData.length);
}

try {
	main();
} catch (error) {
	console.error("Phase2 sensitive check: NG");
	console.error("- reason: " + (error instanceof Error ? error.message : String(error)));
	process.exit(1);
}
