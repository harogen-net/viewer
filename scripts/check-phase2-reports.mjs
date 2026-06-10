#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";

const EXPECTED_ERROR_CASE_LABELS = [
	"invalid-root",
	"unsupported-version",
	"missing-image",
	"png-invalid-signature",
];

const EXPECTED_ERROR_FIXTURE_LABELS = [
	"unsupported-version-fixture",
	"broken-hvz-fixture",
	"broken-png-fixture",
];

function fail(message) {
	throw new Error(message);
}

function readJson(filePath, label) {
	if (!fs.existsSync(filePath)) {
		fail(label + ": report file missing at " + filePath);
	}
	const text = fs.readFileSync(filePath, "utf8");
	try {
		return JSON.parse(text);
	} catch (error) {
		fail(label + ": invalid json: " + (error instanceof Error ? error.message : String(error)));
	}
}

function assertBoolean(value, label) {
	if (typeof value !== "boolean") {
		fail(label + ": boolean expected");
	}
}

function assertString(value, label) {
	if (typeof value !== "string" || value.length === 0) {
		fail(label + ": non-empty string expected");
	}
}

function assertNumber(value, label) {
	if (typeof value !== "number" || Number.isNaN(value)) {
		fail(label + ": number expected");
	}
}

function assertIsoDateString(value, label) {
	assertString(value, label);
	const time = Date.parse(value);
	if (Number.isNaN(time)) {
		fail(label + ": invalid ISO date string");
	}
}

function assertExactLabels(results, expectedLabels, label) {
	const actualLabels = results.map((entry) => entry.label).sort();
	const sortedExpected = [...expectedLabels].sort();
	if (actualLabels.length !== sortedExpected.length) {
		fail(label + ": label count mismatch");
	}
	for (let i = 0; i < sortedExpected.length; i += 1) {
		if (actualLabels[i] !== sortedExpected[i]) {
			fail(label + ": unexpected labels set");
		}
	}
}

function validateStructureReport(report) {
	assertNumber(report.reportVersion, "structure.reportVersion");
	assertBoolean(report.ok, "structure.ok");
	assertIsoDateString(report.checkedAt, "structure.checkedAt");
	assertNumber(report.maxDiffsPerSource, "structure.maxDiffsPerSource");
	assertNumber(report.slideCount, "structure.slideCount");
	assertNumber(report.imageCount, "structure.imageCount");
	if (!Array.isArray(report.mismatches)) {
		fail("structure.mismatches: array expected");
	}
	if (!report.ok) {
		fail("structure.ok: expected true");
	}
}

function validateResultEntries(results, label) {
	if (!Array.isArray(results)) {
		fail(label + ": array expected");
	}
	if (results.length === 0) {
		fail(label + ": at least one entry expected");
	}
	for (const entry of results) {
		assertString(entry.label, label + ".label");
		assertBoolean(entry.ok, label + ".ok");
		if (!entry.ok) {
			fail(label + ": all entries must be ok=true");
		}
		assertString(entry.expectedMessagePart, label + ".expectedMessagePart");
		assertString(entry.actualMessage, label + ".actualMessage");
	}
}

function validateErrorReport(report, label, expectedLabels) {
	assertNumber(report.reportVersion, label + ".reportVersion");
	assertBoolean(report.ok, label + ".ok");
	assertIsoDateString(report.checkedAt, label + ".checkedAt");
	validateResultEntries(report.results, label + ".results");
	assertExactLabels(report.results, expectedLabels, label + ".results");
	if (!report.ok) {
		fail(label + ".ok: expected true");
	}
}

function writeSummaryReport(reportsDir, structure, errorCase, errorFixture) {
	const summaryPath = path.join(reportsDir, "phase2-report-summary.json");
	const summary = {
		generatedAt: new Date().toISOString(),
		reportVersion: 1,
		ok: true,
		sources: {
			structure: {
				checkedAt: structure.checkedAt,
				slideCount: structure.slideCount,
				imageCount: structure.imageCount,
			},
			errorCase: {
				checkedAt: errorCase.checkedAt,
				validatedCount: errorCase.results.length,
				labels: errorCase.results.map((entry) => entry.label),
			},
			errorFixture: {
				checkedAt: errorFixture.checkedAt,
				validatedCount: errorFixture.results.length,
				labels: errorFixture.results.map((entry) => entry.label),
			},
		},
	};
	fs.writeFileSync(summaryPath, JSON.stringify(summary, null, 2));
	return summaryPath;
}

function main() {
	const reportsDir = path.resolve(process.cwd(), "artifacts/phase2");
	const structurePath = path.join(reportsDir, "structure-check-report.json");
	const errorCasePath = path.join(reportsDir, "error-case-report.json");
	const errorFixturePath = path.join(reportsDir, "error-fixture-report.json");

	const structure = readJson(structurePath, "structure");
	const errorCase = readJson(errorCasePath, "error-case");
	const errorFixture = readJson(errorFixturePath, "error-fixture");

	validateStructureReport(structure);
	validateErrorReport(errorCase, "error-case", EXPECTED_ERROR_CASE_LABELS);
	validateErrorReport(errorFixture, "error-fixture", EXPECTED_ERROR_FIXTURE_LABELS);

	const summaryPath = writeSummaryReport(reportsDir, structure, errorCase, errorFixture);

	console.log("Phase2 report check: OK");
	console.log("- reports: structure-check-report.json, error-case-report.json, error-fixture-report.json");
	console.log("- summary: " + summaryPath);
}

try {
	main();
} catch (error) {
	console.error("Phase2 report check: NG");
	console.error("- reason: " + (error instanceof Error ? error.message : String(error)));
	process.exit(1);
}
