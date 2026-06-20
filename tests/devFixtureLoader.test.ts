import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { parseHvdJson } from "../src/devFixtureLoader";
import { useImageLibraryStore } from "../src/state/imageLibraryStore";
import { LayerType } from "../src/types/Layer";

// v3 Group A swap: devFixtureLoader.parseHvdJson が HVD JSON を
// 純粋型 ViewerDocument に正しく変換し、imageData が imageLibraryStore に
// 投入されることを検証 (§0-6 = 新側 round-trip 同等)。

describe("devFixtureLoader.parseHvdJson (v3 Group A)", () => {
	it("HVD fixture を ViewerDocument に変換できる", () => {
		const text = readFileSync(resolve(__dirname, "fixtures/2026-06-16_170948.hvd"), "utf-8");
		const doc = parseHvdJson(text, "fixture.hvd");

		expect(doc.title).toBe("fixture.hvd");
		expect(doc.width).toBe(1792);
		expect(doc.height).toBe(1120);
		expect(doc.bgColor).toBe("#ffffff");
		expect(doc.slides.length).toBe(3);

		const slide0 = doc.slides[0];
		expect(slide0.width).toBe(1792);
		expect(slide0.height).toBe(1120);
		expect(typeof slide0.uuid).toBe("string");
		expect(slide0.uuid.length).toBeGreaterThan(0);
		expect(slide0.layers.length).toBeGreaterThan(0);

		const layer0 = slide0.layers[0];
		expect(["image", "text"]).toContain(layer0.type);
		expect(typeof layer0.uuid).toBe("string");
		expect(layer0.visible).toBe(true); // default
		expect(layer0.opacity).toBe(1); // default
	});

	it("imageData が imageLibraryStore に投入される (副作用)", () => {
		const text = readFileSync(resolve(__dirname, "fixtures/2026-06-16_170948.hvd"), "utf-8");
		useImageLibraryStore.getState().setImageLibrary({}); // reset
		expect(Object.keys(useImageLibraryStore.getState().imageById).length).toBe(0);

		parseHvdJson(text, "fixture.hvd");
		const library = useImageLibraryStore.getState().imageById;
		expect(Object.keys(library).length).toBeGreaterThan(0);
		const firstEntry = Object.values(library)[0];
		expect(firstEntry.dataURL).toMatch(/^data:image\/[a-z]+;base64,/);
	});

	it("imageData なしの HVD でも変換できる (空 library)", () => {
		const minimal = JSON.stringify({
			version: 3,
			screen: { width: 800, height: 600 },
			slideData: [
				{
					id: 1,
					layers: [
						{
							transX: 10,
							transY: 20,
							scaleX: 1,
							scaleY: 1,
							rotation: 0,
							mirrorH: false,
							mirrorV: false,
							type: "text",
							text: "hello",
						},
					],
				},
			],
		});
		useImageLibraryStore.getState().setImageLibrary({});
		const doc = parseHvdJson(minimal, "minimal.hvd");
		expect(doc.slides[0].layers[0].type).toBe(LayerType.TEXT);
		expect((doc.slides[0].layers[0] as { text?: string }).text).toBe("hello");
		expect(Object.keys(useImageLibraryStore.getState().imageById).length).toBe(0);
	});
});
