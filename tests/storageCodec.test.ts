import JSZip from "jszip";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import type { ImageLayer, TextLayer } from "../src/types/Layer";
import { LayerType } from "../src/types/Layer";
import type { ViewerDocument } from "../src/types/ViewerDocument";
import {
	buildImageEntries,
	parseHvd,
	parseHvz,
	parsePng,
	serializeHvd,
	serializeHvz,
	serializePng,
} from "../src/utils/storageCodec";

// v3 Group B build 1: storageCodec 純関数の単体テスト。
// HVD JSON ↔ ViewerDocument 変換の正常性と round-trip 安定性を検証。

describe("storageCodec (v3 Group B build 1)", () => {
	const fixtureText = readFileSync(resolve(__dirname, "fixtures/2026-06-16_170948.hvd"), "utf-8");

	describe("parseHvd", () => {
		it("fixture を ViewerDocument + imageData に分解する", () => {
			const { doc, imageData } = parseHvd(fixtureText, "fixture.hvd");
			expect(doc.title).toBe("fixture.hvd");
			expect(doc.width).toBe(1792);
			expect(doc.height).toBe(1120);
			expect(doc.bgColor).toBe("#ffffff");
			expect(doc.slides.length).toBe(3);
			expect(Object.keys(imageData).length).toBeGreaterThan(0);
			const firstImg = Object.values(imageData)[0];
			expect(firstImg).toMatch(/^data:image\/[a-z]+;base64,/);
		});

		it("layer の default 値を補完する", () => {
			const minimal = JSON.stringify({
				version: 3,
				screen: { width: 800, height: 600 },
				slideData: [
					{
						id: 1,
						layers: [
							{
								transX: 0,
								transY: 0,
								scaleX: 1,
								scaleY: 1,
								rotation: 0,
								mirrorH: false,
								mirrorV: false,
								type: LayerType.TEXT,
								text: "hi",
							},
						],
					},
				],
			});
			const { doc } = parseHvd(minimal, "minimal.hvd");
			const layer = doc.slides[0].layers[0];
			expect(layer.opacity).toBe(1);
			expect(layer.visible).toBe(true);
			expect(layer.locked).toBe(false);
			expect(layer.shared).toBe(false);
			expect(layer.name).toBe("");
		});

		it("legacy 旧形式 (version < 2.1): slide.images をレイヤとして読む", () => {
			const legacy = JSON.stringify({
				version: 2,
				screen: { width: 640, height: 480 },
				slideData: [
					{
						id: 1,
						// 旧形式は layers ではなく images にレイヤ配列が入る (type 無し = image 扱い)。
						images: [
							{
								transX: 10,
								transY: 20,
								scaleX: 1,
								scaleY: 1,
								rotation: 0,
								mirrorH: false,
								mirrorV: false,
								imageId: "img-1",
							},
						],
					},
				],
				imageData: { "img-1": "data:image/png;base64,AAAA" },
			});
			const { doc } = parseHvd(legacy, "legacy.hvd");
			expect(doc.slides).toHaveLength(1);
			expect(doc.slides[0].layers).toHaveLength(1);
			const layer = doc.slides[0].layers[0];
			expect(layer.type).toBe(LayerType.IMAGE);
			expect(layer.transX).toBe(10);
		});

		it("layers も images も無い slide は空レイヤ (throw しない)", () => {
			const noLayers = JSON.stringify({
				version: 3,
				screen: { width: 100, height: 100 },
				slideData: [{ id: 1 }],
			});
			const { doc } = parseHvd(noLayers, "x.hvd");
			expect(doc.slides[0].layers).toEqual([]);
		});
	});

	describe("serializeHvd", () => {
		// docId (docs/document-id-plan.md)。持つ文書だけ version 3.2 で出力し、
		// 持たない文書はキーごと省略する = 既存ファイルとの byte-equal を保つ。
		it("docId を持つと version 3.2 で docId を出力する", () => {
			const doc: ViewerDocument = {
				docId: "doc-uuid-1",
				title: "t",
				width: 100,
				height: 200,
				createTime: 0,
				editTime: 0,
				slides: [],
			};
			const json = JSON.parse(serializeHvd(doc, {}));
			expect(json.version).toBe(3.2);
			expect(json.docId).toBe("doc-uuid-1");
		});

		it("docId が無ければキー自体を出力しない (version は 3 のまま)", () => {
			const doc: ViewerDocument = {
				title: "t",
				width: 100,
				height: 200,
				createTime: 0,
				editTime: 0,
				slides: [],
			};
			const json = JSON.parse(serializeHvd(doc, {}));
			expect(json.version).toBe(3);
			expect("docId" in json).toBe(false);
		});

		it("parseHvd は docId を読み、無ければ undefined (読込時に採番しない)", () => {
			const withId = parseHvd(
				'{"version":3.2,"docId":"abc","screen":{"width":8,"height":6},"slideData":[]}',
				"fallback"
			);
			expect(withId.doc.docId).toBe("abc");
			const without = parseHvd(
				'{"version":3,"screen":{"width":8,"height":6},"slideData":[]}',
				"fallback"
			);
			expect(without.doc.docId).toBeUndefined();
		});

		it("最小 doc が version=3 / screen / slideData / 空 imageData を含む", () => {
			const doc: ViewerDocument = {
				title: "t",
				width: 100,
				height: 200,
				createTime: 0,
				editTime: 0,
				slides: [],
			};
			const json = JSON.parse(serializeHvd(doc, {}));
			expect(json.version).toBe(3);
			expect(json.screen).toEqual({ width: 100, height: 200 });
			expect(json.slideData).toEqual([]);
			expect(json.imageData).toEqual({});
		});

		it("default 値の layer フィールドを省略する (visible/locked/opacity/shared/name)", () => {
			const doc: ViewerDocument = {
				title: "t",
				width: 100,
				height: 100,
				createTime: 0,
				editTime: 0,
				slides: [
					{
						id: 1,
						uuid: "u",
						width: 100,
						height: 100,
						durationRatio: 1,
						joining: true,
						disabled: false,
						layers: [
							{
								id: 1,
								uuid: "u-l",
								name: "",
								opacity: 1,
								locked: false,
								visible: true,
								shared: false,
								transX: 10,
								transY: 20,
								scaleX: 1,
								scaleY: 1,
								rotation: 0,
								mirrorH: false,
								mirrorV: false,
								type: LayerType.TEXT,
								text: "hello",
							},
						],
					},
				],
			};
			const json = JSON.parse(serializeHvd(doc, {}));
			const rawLayer = json.slideData[0].layers[0];
			expect(rawLayer.visible).toBeUndefined();
			expect(rawLayer.locked).toBeUndefined();
			expect(rawLayer.opacity).toBeUndefined();
			expect(rawLayer.shared).toBeUndefined();
			expect(rawLayer.name).toBeUndefined();
			expect(rawLayer.text).toBe("hello");
			expect(rawLayer.type).toBe("text");
			expect(rawLayer.transX).toBe(10);
		});

		it("uuid は HVD に出力しない", () => {
			const doc: ViewerDocument = {
				title: "t",
				width: 100,
				height: 100,
				createTime: 0,
				editTime: 0,
				slides: [
					{
						id: 1,
						uuid: "should-not-appear",
						width: 100,
						height: 100,
						durationRatio: 1,
						joining: true,
						disabled: false,
						layers: [],
					},
				],
			};
			const out = serializeHvd(doc, {});
			expect(out).not.toContain("should-not-appear");
			expect(out).not.toContain("uuid");
		});

		it("imageData は参照されている imageId のみ含める (孤児は除外)", () => {
			const imgLayer: ImageLayer = {
				id: 1,
				uuid: "u",
				name: "",
				opacity: 1,
				locked: false,
				visible: true,
				shared: false,
				transX: 0,
				transY: 0,
				scaleX: 1,
				scaleY: 1,
				rotation: 0,
				mirrorH: false,
				mirrorV: false,
				type: LayerType.IMAGE,
				imageId: "used",
				clipRect: [0, 0, 0, 0],
				isText: false,
			};
			const doc: ViewerDocument = {
				title: "t",
				width: 100,
				height: 100,
				createTime: 0,
				editTime: 0,
				slides: [
					{
						id: 1,
						uuid: "su",
						width: 100,
						height: 100,
						durationRatio: 1,
						joining: true,
						disabled: false,
						layers: [imgLayer],
					},
				],
			};
			const json = JSON.parse(
				serializeHvd(doc, {
					used: "data:image/png;base64,AAA=",
					orphan: "data:image/png;base64,BBB=",
				})
			);
			expect(Object.keys(json.imageData)).toEqual(["used"]);
			expect(json.imageData.used).toBe("data:image/png;base64,AAA=");
		});
	});

	describe("imageNames (画像ファイル名の永続化 v3.1)", () => {
		// image layer 1 枚 (imageId="used") を持つ最小 doc。
		const makeImageDoc = (): ViewerDocument => {
			const imgLayer: ImageLayer = {
				id: 1,
				uuid: "u",
				name: "",
				opacity: 1,
				locked: false,
				visible: true,
				shared: false,
				transX: 0,
				transY: 0,
				scaleX: 1,
				scaleY: 1,
				rotation: 0,
				mirrorH: false,
				mirrorV: false,
				type: LayerType.IMAGE,
				imageId: "used",
				clipRect: [0, 0, 0, 0],
				isText: false,
			};
			return {
				title: "t",
				width: 100,
				height: 100,
				createTime: 0,
				editTime: 0,
				slides: [
					{
						id: 1,
						uuid: "su",
						width: 100,
						height: 100,
						durationRatio: 1,
						joining: true,
						disabled: false,
						layers: [imgLayer],
					},
				],
			};
		};
		const imageMap = { used: "data:image/png;base64,AAA=" };

		it("名前ありで serialize → version 3.1 + imageNames を含み、parse で往復する", () => {
			const jsonText = serializeHvd(makeImageDoc(), imageMap, {
				imageNames: { used: "会議資料.png" },
			});
			const json = JSON.parse(jsonText);
			expect(json.version).toBe(3.1);
			expect(json.imageNames).toEqual({ used: "会議資料.png" });
			// parse で imageNames が復元される
			const parsed = parseHvd(jsonText, "t");
			expect(parsed.imageNames).toEqual({ used: "会議資料.png" });
		});

		// version は「含まれる最上位の拡張」を表す単一の値。imageNames の分岐が後に評価されるので、
		// Math.max で解決しないと docId の 3.2 を 3.1 へ引き下げてしまう。
		it("docId と imageNames の両方があっても version は 3.2 (3.1 へ下がらない)", () => {
			const json = JSON.parse(
				serializeHvd({ ...makeImageDoc(), docId: "doc-1" }, imageMap, {
					imageNames: { used: "会議資料.png" },
				})
			);
			expect(json.version).toBe(3.2);
			expect(json.docId).toBe("doc-1");
			expect(json.imageNames).toEqual({ used: "会議資料.png" });
		});

		it("名前なし (imageNames 未指定) は version 3 のまま imageNames キーを出さない", () => {
			const json = JSON.parse(serializeHvd(makeImageDoc(), imageMap));
			expect(json.version).toBe(3);
			expect("imageNames" in json).toBe(false);
		});

		it("空名/未参照 imageId は imageNames に載らない (全て空なら version 3)", () => {
			const json = JSON.parse(
				serializeHvd(makeImageDoc(), imageMap, {
					imageNames: { used: "", orphan: "無関係.png" },
				})
			);
			expect(json.version).toBe(3);
			expect("imageNames" in json).toBe(false);
		});

		it("センシティブ (encrypted) 時は imageNames を渡しても出力に含めない (平文名の漏洩防止)", () => {
			const json = JSON.parse(
				serializeHvd(makeImageDoc(), imageMap, {
					encrypted: {
						security: {
							version: 1,
							kdf: "PBKDF2",
							kdfIterations: 150000,
							salt: "c2FsdA==",
							cipher: "AES-GCM",
							iv: "aXY=",
						},
						ciphertext: "Zm9v",
					},
					imageNames: { used: "秘密.png" },
				})
			);
			expect(json.isSensitive).toBe(true);
			expect("imageNames" in json).toBe(false);
			expect(json.version).toBe(3);
		});

		it("buildImageEntries は name があれば付与、無ければ dataURL のみ", () => {
			const entries = buildImageEntries(
				{ a: "data:1", b: "data:2" },
				{ a: "図.png" } // b は名前なし
			);
			expect(entries.a).toEqual({ dataURL: "data:1", name: "図.png" });
			expect(entries.b).toEqual({ dataURL: "data:2" });
		});
	});

	describe("round-trip", () => {
		it("parse → serialize → parse で構造が保たれる (fixture)", () => {
			const first = parseHvd(fixtureText, "fixture.hvd");
			const round = serializeHvd(first.doc, first.imageData);
			const second = parseHvd(round, "fixture.hvd");

			expect(second.doc.width).toBe(first.doc.width);
			expect(second.doc.height).toBe(first.doc.height);
			expect(second.doc.bgColor).toBe(first.doc.bgColor);
			expect(second.doc.createTime).toBe(first.doc.createTime);
			expect(second.doc.editTime).toBe(first.doc.editTime);
			expect(second.doc.slides.length).toBe(first.doc.slides.length);

			for (let i = 0; i < first.doc.slides.length; i++) {
				const a = first.doc.slides[i];
				const b = second.doc.slides[i];
				expect(b.id).toBe(a.id);
				expect(b.durationRatio).toBe(a.durationRatio);
				expect(b.joining).toBe(a.joining);
				expect(b.disabled).toBe(a.disabled);
				expect(b.layers.length).toBe(a.layers.length);
				for (let j = 0; j < a.layers.length; j++) {
					const la = a.layers[j];
					const lb = b.layers[j];
					expect(lb.type).toBe(la.type);
					expect(lb.transX).toBe(la.transX);
					expect(lb.transY).toBe(la.transY);
					expect(lb.scaleX).toBe(la.scaleX);
					expect(lb.scaleY).toBe(la.scaleY);
					expect(lb.rotation).toBe(la.rotation);
					expect(lb.opacity).toBe(la.opacity);
					expect(lb.visible).toBe(la.visible);
					if (la.type === "image" && lb.type === "image") {
						expect((lb as ImageLayer).imageId).toBe((la as ImageLayer).imageId);
					}
					if (la.type === "text" && lb.type === "text") {
						expect((lb as TextLayer).text).toBe((la as TextLayer).text);
					}
				}
			}

			expect(Object.keys(second.imageData).sort()).toEqual(Object.keys(first.imageData).sort());
		});
	});

	describe("serializeHvz / parseHvz", () => {
		it("HVZ round-trip: parse(serialize(doc)) で構造が保たれる (fixture)", async () => {
			const first = parseHvd(fixtureText, "fixture.hvd");
			const u8a = await serializeHvz(first.doc, first.imageData);
			// jsdom realm の Uint8Array と Node global の違いを避けるため Buffer.from で wrap。
			const second = await parseHvz(Buffer.from(u8a), "fixture.hvd");

			expect(second.doc.width).toBe(first.doc.width);
			expect(second.doc.height).toBe(first.doc.height);
			expect(second.doc.slides.length).toBe(first.doc.slides.length);
			expect(Object.keys(second.imageData).sort()).toEqual(Object.keys(first.imageData).sort());
		});

		it("空 zip は parseHvz でエラー", async () => {
			const empty = await new JSZip().generateAsync({ type: "uint8array" });
			await expect(parseHvz(Buffer.from(empty), "x")).rejects.toThrow(/zip に有効なエントリ/);
		});

		it("serializeHvz は zip 内に doc.title.hvd エントリを含む", async () => {
			const doc: ViewerDocument = {
				title: "my-doc",
				width: 100,
				height: 100,
				createTime: 0,
				editTime: 0,
				slides: [],
			};
			const u8a = await serializeHvz(doc, {});
			const zip = await JSZip.loadAsync(Buffer.from(u8a));
			expect(Object.keys(zip.files)).toContain("my-doc.hvd");
		});
	});

	describe("serializePng / parsePng", () => {
		it("PNG round-trip: parse(serialize(doc)) で構造が保たれる (fixture、デフォルト透明 PNG)", async () => {
			const first = parseHvd(fixtureText, "fixture.hvd");
			const pngBytes = await serializePng(first.doc, first.imageData);
			// jsdom realm の Uint8Array 罠回避のため Buffer.from でラップ
			const second = await parsePng(Buffer.from(pngBytes), "fixture.hvd");

			expect(second.doc.width).toBe(first.doc.width);
			expect(second.doc.height).toBe(first.doc.height);
			expect(second.doc.slides.length).toBe(first.doc.slides.length);
			expect(Object.keys(second.imageData).sort()).toEqual(Object.keys(first.imageData).sort());
		});

		it("serializePng の出力 PNG は valid な PNG シグネチャを持つ", async () => {
			const doc: ViewerDocument = {
				title: "t",
				width: 100,
				height: 100,
				createTime: 0,
				editTime: 0,
				slides: [],
			};
			const u8a = await serializePng(doc, {});
			// PNG signature: 0x89 0x50 0x4E 0x47 0x0D 0x0A 0x1A 0x0A
			expect(u8a[0]).toBe(0x89);
			expect(u8a[1]).toBe(0x50);
			expect(u8a[2]).toBe(0x4e);
			expect(u8a[3]).toBe(0x47);
		});

		it("HVD データが埋め込まれていない PNG は parsePng でエラー", async () => {
			// 1x1 transparent PNG (embed なし) の生バイト
			const rawPngBase64 =
				"iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkAAIAAAoAAv/lxKUAAAAASUVORK5CYII=";
			const rawBytes = Buffer.from(rawPngBase64, "base64");
			await expect(parsePng(rawBytes, "x")).rejects.toThrow();
		});
	});
});
