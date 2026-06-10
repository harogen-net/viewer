#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";

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

function validateStructureReport(report) {
	assertNumber(report.reportVersion, "structure.reportVersion");
	assertBoolean(report.ok, "structure.ok");
	assertString(report.checkedAt, "structure.checkedAt");
	assertNumber(report.maxDiffsPerSource, "structure.maxDiffsPerSource");
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
		assertString(entry.expectedMessagePart, label + ".expectedMessagePart");
		assertString(entry.actualMessage, label + ".actualMessage");
	}
}

function validateErrorReport(report, label) {
	assertNumber(report.reportVersion, label + ".reportVersion");
	assertBoolean(report.ok, label + ".ok");
	assertString(report.checkedAt, label + ".checkedAt");
	validateResultEntries(report.results, label + ".results");
	if (!report.ok) {
		fail(label + ".ok: expected true");
	}
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
	validateErrorReport(errorCase, "error-case");
	validateErrorReport(errorFixture, "error-fixture");

	console.log("Phase2 report check: OK");
	console.log("- reports: structure-check-report.json, error-case-report.json, error-fixture-report.json");
}

try {
	main();
} catch (error) {
	console.error("Phase2 report check: NG");
	console.error("- reason: " + (error instanceof Error ? error.message : String(error)));
	process.exit(1);
}
