#!/usr/bin/env node

import {
	getPhase2FixturePaths,
	readHvdJson,
	readHvzJson,
	readPngEmbeddedHvdJson,
} from "./phase2-fixture-lib.mjs";

function pickCoreFields(json) {
	const firstSlide = json.slideData[0] || {};
	const layers = Array.isArray(firstSlide.layers) ? firstSlide.layers : [];
	const firstLayer = layers[0] || null;

	const picked = {
		bgColor: json.bgColor || null,
		slideCount: json.slideData.length,
		firstSlide: {
			durationRatio: firstSlide.durationRatio ?? null,
			joining: firstSlide.joining ?? null,
			disabled: firstSlide.disabled ?? null,
			layerCount: layers.length,
		},
		firstLayerTransform: firstLayer
			? {
				transX: firstLayer.transX ?? null,
				transY: firstLayer.transY ?? null,
				scaleX: firstLayer.scaleX ?? null,
				scaleY: firstLayer.scaleY ?? null,
				rotation: firstLayer.rotation ?? null,
			}
			: null,
	};

	return picked;
}

function assertDeepEqual(base, actual, label) {
	const baseStr = JSON.stringify(base);
	const actualStr = JSON.stringify(actual);
	if (baseStr !== actualStr) {
		fail(label + ": core fields mismatch\nbase=" + baseStr + "\nactual=" + actualStr);
	}
}

async function readHvd() {
	const paths = getPhase2FixturePaths();
	return readHvdJson(paths);
}

async function readHvz() {
	const paths = getPhase2FixturePaths();
	return readHvzJson(paths);
}

async function readPngEmbeddedHvd() {
	const paths = getPhase2FixturePaths();
	return readPngEmbeddedHvdJson(paths);
}

async function main() {
	const hvdJson = await readHvd();
	const hvzJson = await readHvz();
	const pngJson = await readPngEmbeddedHvd();

	const hvdCore = pickCoreFields(hvdJson);
	assertDeepEqual(hvdCore, pickCoreFields(hvzJson), "hvz");
	assertDeepEqual(hvdCore, pickCoreFields(pngJson), "png");

	console.log("Phase2 core-field check: OK");
	console.log("- compared sources: hvd/hvz/png embedded");
	console.log("- bgColor: " + (hvdCore.bgColor ?? "null"));
	console.log("- slideCount: " + hvdCore.slideCount);
	console.log("- firstSlide.layerCount: " + hvdCore.firstSlide.layerCount);
}

main().catch((error) => {
	console.error("Phase2 core-field check: NG");
	console.error("- reason: " + (error instanceof Error ? error.message : String(error)));
	process.exit(1);
});
