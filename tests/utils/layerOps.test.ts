import { describe, expect, it } from "vitest";
import type { ImageLayer, Layer, TextLayer } from "../../src/types/Layer";
import type { Slide } from "../../src/types/Slide";
import type { SlideState } from "../../src/types/SlideState";
import {
	addLayer,
	addTextLayer,
	alignTo,
	bringForward,
	buildFitImageLayer,
	bringToFront,
	duplicateLayer,
	fitToSlide,
	removeLayer,
	reorderLayer,
	replaceImageId,
	replaceImageIdAll,
	resetOpacity,
	resetRotation,
	rotateBy,
	sendBackward,
	sendToBack,
	spreadLayer,
	toggleMirrorH,
	toggleMirrorV,
	updateImageLayer,
	updateLayer,
	updateTextLayer,
} from "../../src/utils/layerOps";

// v4 Group D D-2: layerOps 純関数の単体テスト。
// store / hook を一切起こさず関数を直接呼ぶため爆速。

const baseTransform = {
	transX: 0,
	transY: 0,
	scaleX: 1,
	scaleY: 1,
	rotation: 0,
	mirrorH: false,
	mirrorV: false,
};

const makeImageLayer = (
	id: number,
	uuid: string,
	overrides: Partial<ImageLayer> = {}
): ImageLayer => ({
	id,
	uuid,
	name: "",
	opacity: 1,
	locked: false,
	visible: true,
	shared: false,
	...baseTransform,
	type: "image",
	imageId: `img-${id}`,
	clipRect: [0, 0, 0, 0],
	isText: false,
	...overrides,
});
const makeTextLayer = (
	id: number,
	uuid: string,
	overrides: Partial<TextLayer> = {}
): TextLayer => ({
	id,
	uuid,
	name: "",
	opacity: 1,
	locked: false,
	visible: true,
	shared: false,
	...baseTransform,
	type: "text",
	text: `text-${id}`,
	...overrides,
});

const makeSlide = (layers: Layer[], id = 1, uuid = "s-1"): Slide => ({
	id,
	uuid,
	width: 800,
	height: 600,
	durationRatio: 1,
	joining: true,
	disabled: false,
	layers,
});

const makeState = (slides: Slide[], selectedIndex = 0): SlideState => ({ slides, selectedIndex });

describe("layerOps (v4 Group D D-2 純関数)", () => {
	describe("updateLayer (LayerBase 共通プロパティ)", () => {
		it("opacity 更新", () => {
			const s = makeState([makeSlide([makeImageLayer(1, "a")])]);
			const r = updateLayer(s, 0, { opacity: 0.5 });
			expect(r?.slides[0].layers[0].opacity).toBe(0.5);
		});

		it("値変化なしは null", () => {
			const s = makeState([makeSlide([makeImageLayer(1, "a", { opacity: 0.5 })])]);
			expect(updateLayer(s, 0, { opacity: 0.5 })).toBeNull();
		});

		it("selectedIndex < 0 / 範囲外は null", () => {
			const s = makeState([makeSlide([makeImageLayer(1, "a")])], -1);
			expect(updateLayer(s, 0, { opacity: 0.5 })).toBeNull();

			const s2 = makeState([makeSlide([makeImageLayer(1, "a")])]);
			expect(updateLayer(s2, 99, { opacity: 0.5 })).toBeNull();
		});

		it("入力 state を mutate しない (immutability)", () => {
			const s = makeState([makeSlide([makeImageLayer(1, "a")])]);
			updateLayer(s, 0, { opacity: 0.3 });
			expect(s.slides[0].layers[0].opacity).toBe(1);
		});
	});

	describe("updateImageLayer / updateTextLayer (type 専用)", () => {
		it("updateImageLayer: image 専用フィールド更新", () => {
			const s = makeState([makeSlide([makeImageLayer(1, "a")])]);
			const r = updateImageLayer(s, 0, { clipRect: [1, 2, 3, 4] });
			expect((r?.slides[0].layers[0] as ImageLayer).clipRect).toEqual([1, 2, 3, 4]);
		});

		it("updateImageLayer: text layer に対しては null", () => {
			const s = makeState([makeSlide([makeTextLayer(1, "a")])]);
			expect(updateImageLayer(s, 0, { clipRect: [0, 0, 0, 0] })).toBeNull();
		});

		it("updateTextLayer: text フィールド更新", () => {
			const s = makeState([makeSlide([makeTextLayer(1, "a", { text: "hi" })])]);
			const r = updateTextLayer(s, 0, { text: "hello" });
			expect((r?.slides[0].layers[0] as TextLayer).text).toBe("hello");
		});

		it("updateTextLayer: image layer に対しては null", () => {
			const s = makeState([makeSlide([makeImageLayer(1, "a")])]);
			expect(updateTextLayer(s, 0, { text: "x" })).toBeNull();
		});
	});

	describe("addLayer / removeLayer / duplicateLayer", () => {
		it("addLayer: 末尾に追加、id は max+1、uuid は自動採番", () => {
			const s = makeState([makeSlide([makeImageLayer(5, "a")])]);
			const r = addLayer(s, {
				name: "",
				opacity: 1,
				locked: false,
				visible: true,
				shared: false,
				...baseTransform,
				type: "image",
				imageId: "new",
				clipRect: [0, 0, 0, 0],
				isText: false,
			});
			expect(r?.slides[0].layers.length).toBe(2);
			expect(r?.slides[0].layers[1].id).toBe(6);
			expect(r?.slides[0].layers[1].uuid).toBeTruthy();
		});

		it("removeLayer: 範囲外は null、正常時は削除", () => {
			const s = makeState([makeSlide([makeImageLayer(1, "a"), makeImageLayer(2, "b")])]);
			expect(removeLayer(s, 99)).toBeNull();
			const r = removeLayer(s, 0);
			expect(r?.slides[0].layers.length).toBe(1);
			expect(r?.slides[0].layers[0].uuid).toBe("b");
		});

		it("duplicateLayer: 直後挿入、新 id + uuid", () => {
			const s = makeState([makeSlide([makeImageLayer(1, "a"), makeImageLayer(2, "b")])]);
			const r = duplicateLayer(s, 0);
			expect(r?.slides[0].layers.length).toBe(3);
			expect(r?.slides[0].layers[0].uuid).toBe("a");
			expect(r?.slides[0].layers[1].uuid).not.toBe("a");
			expect(r?.slides[0].layers[1].uuid).not.toBe("b");
			expect(r?.slides[0].layers[1].id).toBe(3); // max(1,2)+1
			expect(r?.slides[0].layers[2].uuid).toBe("b");
		});

		it("addTextLayer: 末尾に text layer 追加、中央付近配置、id/uuid 採番 (D-9)", () => {
			const s = makeState([makeSlide([makeImageLayer(5, "a")], 1, "s-1")]); // slide 800x600
			const r = addTextLayer(s, "hello", 800, 600);
			expect(r?.slides[0].layers.length).toBe(2);
			const added = r?.slides[0].layers[1] as TextLayer;
			expect(added.type).toBe("text");
			expect(added.text).toBe("hello");
			expect(added.id).toBe(6);
			expect(added.uuid).toBeTruthy();
			expect(added.transX).toBe(400);
			expect(added.transY).toBe(300);
		});

		it("addTextLayer: selectedIndex < 0 は null", () => {
			const s = makeState([makeSlide([makeImageLayer(1, "a")])], -1);
			expect(addTextLayer(s, "x", 800, 600)).toBeNull();
		});
	});

	describe("reorderLayer / bring* / send*", () => {
		const seed = (): SlideState =>
			makeState([
				makeSlide([makeImageLayer(1, "a"), makeImageLayer(2, "b"), makeImageLayer(3, "c")]),
			]);

		it("reorderLayer: from→to 移動", () => {
			const r = reorderLayer(seed(), 0, 2);
			expect(r?.slides[0].layers.map((l) => l.uuid)).toEqual(["b", "c", "a"]);
		});

		it("reorderLayer: 同 index / 範囲外は null", () => {
			expect(reorderLayer(seed(), 1, 1)).toBeNull();
			expect(reorderLayer(seed(), -1, 0)).toBeNull();
			expect(reorderLayer(seed(), 0, 99)).toBeNull();
		});

		it("bringToFront: 末尾に移動", () => {
			const r = bringToFront(seed(), 0);
			expect(r?.slides[0].layers.map((l) => l.uuid)).toEqual(["b", "c", "a"]);
		});

		it("bringToFront: すでに末尾なら null", () => {
			expect(bringToFront(seed(), 2)).toBeNull();
		});

		it("sendToBack: 先頭に移動", () => {
			const r = sendToBack(seed(), 2);
			expect(r?.slides[0].layers.map((l) => l.uuid)).toEqual(["c", "a", "b"]);
		});

		it("sendToBack: すでに先頭なら null", () => {
			expect(sendToBack(seed(), 0)).toBeNull();
		});

		it("bringForward: 1 段前 (index+1) に移動", () => {
			const r = bringForward(seed(), 0);
			expect(r?.slides[0].layers.map((l) => l.uuid)).toEqual(["b", "a", "c"]);
		});

		it("sendBackward: 1 段後 (index-1) に移動", () => {
			const r = sendBackward(seed(), 2);
			expect(r?.slides[0].layers.map((l) => l.uuid)).toEqual(["a", "c", "b"]);
		});

		it("bringForward 最前面 / sendBackward 最背面は null", () => {
			expect(bringForward(seed(), 2)).toBeNull();
			expect(sendBackward(seed(), 0)).toBeNull();
		});
	});

	describe("shared 連動更新 (§7 D-15、連続隣接走査)", () => {
		it("shared layer の opacity 編集が前後の連続隣接スライドの兄弟へ伝播", () => {
			// 3 slide すべてに同 imageId + shared=true。選択は中央 (index 1)。
			const s = makeState(
				[
					makeSlide([makeImageLayer(1, "a0", { imageId: "S", shared: true })], 1, "s0"),
					makeSlide([makeImageLayer(2, "a1", { imageId: "S", shared: true })], 2, "s1"),
					makeSlide([makeImageLayer(3, "a2", { imageId: "S", shared: true })], 3, "s2"),
				],
				1
			);
			const r = updateLayer(s, 0, { opacity: 0.5 });
			expect(r?.slides[0].layers[0].opacity).toBe(0.5); // 前隣接
			expect(r?.slides[1].layers[0].opacity).toBe(0.5); // 編集対象
			expect(r?.slides[2].layers[0].opacity).toBe(0.5); // 後隣接
		});

		it("shared=false の layer 編集は兄弟へ伝播しない", () => {
			const s = makeState(
				[
					makeSlide([makeImageLayer(1, "a0", { imageId: "S", shared: false })], 1, "s0"),
					makeSlide([makeImageLayer(2, "a1", { imageId: "S", shared: true })], 2, "s1"),
				],
				0
			);
			const r = updateLayer(s, 0, { opacity: 0.5 });
			expect(r?.slides[0].layers[0].opacity).toBe(0.5);
			expect(r?.slides[1].layers[0].opacity).toBe(1); // 非伝播
		});

		it("連続が途切れたスライドで打ち切り (gap の先へは伝播しない)", () => {
			const s = makeState(
				[
					makeSlide([makeImageLayer(1, "a0", { imageId: "S", shared: true })], 1, "s0"),
					makeSlide([makeImageLayer(2, "a1", { imageId: "OTHER", shared: true })], 2, "s1"),
					makeSlide([makeImageLayer(3, "a2", { imageId: "S", shared: true })], 3, "s2"),
				],
				0
			);
			const r = updateLayer(s, 0, { opacity: 0.5 });
			expect(r?.slides[0].layers[0].opacity).toBe(0.5); // 編集対象
			expect(r?.slides[1].layers[0].opacity).toBe(1); // gap (別 imageId)
			expect(r?.slides[2].layers[0].opacity).toBe(1); // gap の先 → 打ち切り
		});

		it("transform op (rotateBy) も兄弟へ伝播", () => {
			const s = makeState(
				[
					makeSlide(
						[makeImageLayer(1, "a0", { imageId: "S", shared: true, rotation: 0 })],
						1,
						"s0"
					),
					makeSlide(
						[makeImageLayer(2, "a1", { imageId: "S", shared: true, rotation: 0 })],
						2,
						"s1"
					),
				],
				0
			);
			const r = rotateBy(s, 0, 90);
			expect(r?.slides[1].layers[0].rotation).toBe(90);
		});

		it("imageId 変更は旧 imageId でマッチした兄弟へ新 id を伝播", () => {
			const s = makeState(
				[
					makeSlide([makeImageLayer(1, "a0", { imageId: "OLD", shared: true })], 1, "s0"),
					makeSlide([makeImageLayer(2, "a1", { imageId: "OLD", shared: true })], 2, "s1"),
				],
				0
			);
			const r = updateImageLayer(s, 0, { imageId: "NEW" });
			expect((r?.slides[0].layers[0] as ImageLayer).imageId).toBe("NEW");
			expect((r?.slides[1].layers[0] as ImageLayer).imageId).toBe("NEW");
		});

		it("text layer は text 一致で兄弟判定、text 編集を伝播", () => {
			const s = makeState(
				[
					makeSlide([makeTextLayer(1, "t0", { text: "hello", shared: true })], 1, "s0"),
					makeSlide([makeTextLayer(2, "t1", { text: "hello", shared: true })], 2, "s1"),
				],
				0
			);
			const r = updateTextLayer(s, 0, { text: "world" });
			expect((r?.slides[0].layers[0] as TextLayer).text).toBe("world");
			expect((r?.slides[1].layers[0] as TextLayer).text).toBe("world");
		});

		it("name は同期対象外 (兄弟へ伝播しない)", () => {
			const s = makeState(
				[
					makeSlide([makeImageLayer(1, "a0", { imageId: "S", shared: true })], 1, "s0"),
					makeSlide([makeImageLayer(2, "a1", { imageId: "S", shared: true })], 2, "s1"),
				],
				0
			);
			const r = updateLayer(s, 0, { name: "renamed" });
			expect(r?.slides[0].layers[0].name).toBe("renamed");
			expect(r?.slides[1].layers[0].name).toBe(""); // 非同期
		});
	});

	describe("spreadLayer (§7 D-16)", () => {
		it("空きスライドへ clone 展開し source + clone をすべて shared 化", () => {
			const s = makeState(
				[
					makeSlide([], 1, "s0"),
					makeSlide([makeImageLayer(1, "src", { imageId: "S" })], 2, "s1"),
					makeSlide([], 3, "s2"),
				],
				1
			);
			const r = spreadLayer(s, 0);
			expect(r).not.toBeNull();
			// source は shared 化
			expect(r?.slides[1].layers[0].shared).toBe(true);
			// 前後の空きスライドへ clone (新 uuid、shared、同 imageId)
			expect(r?.slides[0].layers).toHaveLength(1);
			expect(r?.slides[0].layers[0].shared).toBe(true);
			expect((r?.slides[0].layers[0] as ImageLayer).imageId).toBe("S");
			expect(r?.slides[0].layers[0].uuid).not.toBe("src");
			expect(r?.slides[2].layers).toHaveLength(1);
			expect(r?.slides[2].layers[0].shared).toBe(true);
		});

		it("非 shared マッチ層は shared 化し、重複 clone しない", () => {
			const s = makeState(
				[
					makeSlide([makeImageLayer(1, "src", { imageId: "S" })], 1, "s0"),
					makeSlide([makeImageLayer(2, "b", { imageId: "S" })], 2, "s1"),
				],
				0
			);
			const r = spreadLayer(s, 0);
			expect(r?.slides[1].layers).toHaveLength(1); // 重複追加なし
			expect(r?.slides[1].layers[0].shared).toBe(true);
			expect(r?.slides[1].layers[0].uuid).toBe("b"); // 既存を流用
		});

		it("既存 shared マッチ層に到達したら打ち切り (先のスライドは未変更)", () => {
			const s = makeState(
				[
					makeSlide([makeImageLayer(1, "src", { imageId: "S" })], 1, "s0"),
					makeSlide([makeImageLayer(2, "b", { imageId: "S" })], 2, "s1"),
					makeSlide([makeImageLayer(3, "c", { imageId: "S", shared: true })], 3, "s2"),
					makeSlide([makeImageLayer(4, "d", { imageId: "S" })], 4, "s3"),
				],
				0
			);
			const r = spreadLayer(s, 0);
			expect(r?.slides[1].layers[0].shared).toBe(true); // 非shared→shared化
			expect(r?.slides[2].layers[0].shared).toBe(true); // 既shared (打ち切り点)
			expect(r?.slides[3].layers[0].shared).toBe(false); // 打ち切りの先 → 未変更
		});

		it("source が既 shared かつ隣接に展開対象なしは null (no-op)", () => {
			const s = makeState(
				[makeSlide([makeImageLayer(1, "src", { imageId: "S", shared: true })], 1, "s0")],
				0
			);
			expect(spreadLayer(s, 0)).toBeNull();
		});

		it("範囲外 layerIndex / 未選択は null", () => {
			const s = makeState([makeSlide([makeImageLayer(1, "src")], 1, "s0")], 0);
			expect(spreadLayer(s, 9)).toBeNull();
			const s2 = makeState([makeSlide([makeImageLayer(1, "src")], 1, "s0")], -1);
			expect(spreadLayer(s2, 0)).toBeNull();
		});
	});

	describe("replaceImageId / replaceImageIdAll (D-6b)", () => {
		it("replaceImageId: 単 layer の imageId のみ置換、transform は維持", () => {
			const layer = makeImageLayer(1, "a", {
				transX: 100,
				transY: 50,
				scaleX: 2,
				rotation: 30,
			});
			const s = makeState([makeSlide([layer])]);
			const r = replaceImageId(s, 0, "new-img");
			const next = r?.slides[0].layers[0] as ImageLayer;
			expect(next.imageId).toBe("new-img");
			expect(next.transX).toBe(100);
			expect(next.transY).toBe(50);
			expect(next.scaleX).toBe(2);
			expect(next.rotation).toBe(30);
		});

		it("replaceImageId: 非 image 型は null", () => {
			const t = makeTextLayer(1, "a");
			const s = makeState([makeSlide([t])]);
			expect(replaceImageId(s, 0, "new-img")).toBeNull();
		});

		it("replaceImageId: 同 imageId は null", () => {
			const layer = makeImageLayer(1, "a");
			const s = makeState([makeSlide([layer])]);
			// makeImageLayer は imageId = `img-${id}` を生成 (id=1 → "img-1")
			expect(replaceImageId(s, 0, layer.imageId)).toBeNull();
		});

		it("replaceImageIdAll: 全 slide で oldId 参照 layer の imageId を newId に置換", () => {
			const s = makeState([
				makeSlide([makeImageLayer(1, "a"), makeImageLayer(2, "b")], 1, "s1"),
				makeSlide([makeImageLayer(3, "c")], 2, "s2"),
			]);
			// makeImageLayer は imageId = `img-${id}` を生成
			// (id=1 → img-1, id=2 → img-2, id=3 → img-3)
			// img-1 を newImg に置換 (slide1 layer1 と slide2 layer1)
			const r = replaceImageIdAll(s, "img-1", "new-img");
			expect((r?.slides[0].layers[0] as ImageLayer).imageId).toBe("new-img");
			expect((r?.slides[0].layers[1] as ImageLayer).imageId).toBe("img-2");
			// img-3 は変化なし
			expect((r?.slides[1].layers[0] as ImageLayer).imageId).toBe("img-3");
		});

		it("replaceImageIdAll: 同 id 指定は null", () => {
			const s = makeState([makeSlide([makeImageLayer(1, "a")])]);
			expect(replaceImageIdAll(s, "img-1", "img-1")).toBeNull();
		});

		it("replaceImageIdAll: 該当 0 件は null", () => {
			const s = makeState([makeSlide([makeImageLayer(1, "a")])]);
			expect(replaceImageIdAll(s, "img-X", "new-img")).toBeNull();
		});
	});

	describe("transform ops (D-4b)", () => {
		it("rotateBy: rotation 加算", () => {
			const s = makeState([makeSlide([makeImageLayer(1, "a", { rotation: 30 })])]);
			const r = rotateBy(s, 0, 90);
			expect(r?.slides[0].layers[0].rotation).toBe(120);
		});

		it("rotateBy: delta=0 は null", () => {
			const s = makeState([makeSlide([makeImageLayer(1, "a")])]);
			expect(rotateBy(s, 0, 0)).toBeNull();
		});

		it("resetRotation: rotation を 0 に", () => {
			const s = makeState([makeSlide([makeImageLayer(1, "a", { rotation: 45 })])]);
			const r = resetRotation(s, 0);
			expect(r?.slides[0].layers[0].rotation).toBe(0);
		});

		it("resetRotation: すでに 0 なら null", () => {
			const s = makeState([makeSlide([makeImageLayer(1, "a", { rotation: 0 })])]);
			expect(resetRotation(s, 0)).toBeNull();
		});

		it("toggleMirrorH: false → true → false", () => {
			const s = makeState([makeSlide([makeImageLayer(1, "a", { mirrorH: false })])]);
			const r1 = toggleMirrorH(s, 0);
			expect(r1?.slides[0].layers[0].mirrorH).toBe(true);
			const r2 = toggleMirrorH(r1!, 0);
			expect(r2?.slides[0].layers[0].mirrorH).toBe(false);
		});

		it("toggleMirrorV: 同様に toggle", () => {
			const s = makeState([makeSlide([makeImageLayer(1, "a", { mirrorV: false })])]);
			const r = toggleMirrorV(s, 0);
			expect(r?.slides[0].layers[0].mirrorV).toBe(true);
		});

		it("resetOpacity: opacity を 1 に / すでに 1 なら null", () => {
			const s1 = makeState([makeSlide([makeImageLayer(1, "a", { opacity: 0.5 })])]);
			expect(resetOpacity(s1, 0)?.slides[0].layers[0].opacity).toBe(1);
			const s2 = makeState([makeSlide([makeImageLayer(1, "a", { opacity: 1 })])]);
			expect(resetOpacity(s2, 0)).toBeNull();
		});

		describe("fitToSlide (legacy Slide.fitLayer 互換)", () => {
			it("通常: slide 1600x800, content 800x800 → scale1 = min(2, 1) = 1, 中央配置", () => {
				const s = makeState([
					makeSlide([makeImageLayer(1, "a", { scaleX: 0.5, scaleY: 0.5 })], 1, "s1"),
				]);
				// slide 1600x800, content 800x800 → sx=2, sy=1, scale1=1
				const r = fitToSlide(s, 0, 1600, 800, 800, 800);
				const layer = r?.slides[0].layers[0];
				expect(layer?.scaleX).toBe(1);
				expect(layer?.scaleY).toBe(1);
				// 中央配置: transX = slideCx - contentW/2 = 800 - 400 = 400
				expect(layer?.transX).toBe(400);
				expect(layer?.transY).toBe(0);
			});

			it("rotation ±90° のときは content W/H を入れ替えて scale 計算", () => {
				// rotation=90: scaleX = slideW/contentH = 1600/400 = 4, scaleY = slideH/contentW = 800/800 = 1
				// scale1 = 1
				const s = makeState([
					makeSlide([makeImageLayer(1, "a", { rotation: 90, scaleX: 0.5, scaleY: 0.5 })]),
				]);
				const r = fitToSlide(s, 0, 1600, 800, 800, 400);
				const layer = r?.slides[0].layers[0];
				expect(layer?.scaleX).toBe(1);
				expect(layer?.scaleY).toBe(1);
			});

			it("toggle: 中央 + scale1 状態なら scale2 に切り替え", () => {
				// 1 回目で scale1=1, 中央配置になる。状態を残して 2 回目を呼ぶ。
				const s1 = makeState([
					makeSlide([makeImageLayer(1, "a", { scaleX: 0.5, scaleY: 0.5 })], 1, "s1"),
				]);
				const r1 = fitToSlide(s1, 0, 1600, 800, 800, 800)!;
				expect(r1.slides[0].layers[0].scaleX).toBe(1); // scale1
				// 2 回目: 中央 + scale1 なので scale2 (= 2) に切り替え
				const r2 = fitToSlide(r1, 0, 1600, 800, 800, 800)!;
				expect(r2.slides[0].layers[0].scaleX).toBe(2);
				expect(r2.slides[0].layers[0].scaleY).toBe(2);
			});

			it("contentW <= 0 は null", () => {
				const s = makeState([makeSlide([makeImageLayer(1, "a")])]);
				expect(fitToSlide(s, 0, 1600, 800, 0, 500)).toBeNull();
				expect(fitToSlide(s, 0, 1600, 800, 500, 0)).toBeNull();
			});
		});

		describe("alignTo (legacy Slide.arrangeLayer 互換)", () => {
			// slide 1600x800、layer content 400x200、scale=1、rotation=0
			// visual bbox = 400x200 (no rotation)
			it("top: visual top が y=0 に接する (transY = bounds.h/2 - contentH/2 = 100 - 100 = 0)", () => {
				const s = makeState([makeSlide([makeImageLayer(1, "a", { transX: 0, transY: 500 })])]);
				const r = alignTo(s, 0, "top", 1600, 800, 400, 200);
				expect(r?.slides[0].layers[0].transY).toBe(0);
				expect(r?.slides[0].layers[0].transX).toBe(0); // X 不変
			});

			it("bottom: visual bottom が y=slideH に接する (transY = 800 - 100 - 100 = 600)", () => {
				const s = makeState([makeSlide([makeImageLayer(1, "a", { transY: 0 })])]);
				const r = alignTo(s, 0, "bottom", 1600, 800, 400, 200);
				expect(r?.slides[0].layers[0].transY).toBe(600);
			});

			it("left: visual left が x=0 に接する (transX = bounds.w/2 - contentW/2 = 200 - 200 = 0)", () => {
				const s = makeState([makeSlide([makeImageLayer(1, "a", { transX: 500 })])]);
				const r = alignTo(s, 0, "left", 1600, 800, 400, 200);
				expect(r?.slides[0].layers[0].transX).toBe(0);
			});

			it("right: visual right が x=slideW に接する (transX = 1600 - 200 - 200 = 1200)", () => {
				const s = makeState([makeSlide([makeImageLayer(1, "a", { transX: 0 })])]);
				const r = alignTo(s, 0, "right", 1600, 800, 400, 200);
				expect(r?.slides[0].layers[0].transX).toBe(1200);
			});

			it("rotation 90°: bbox の幅高が swap (visual bbox = 200x400)", () => {
				// rotation 90: 4 corner rotate → visual bbox = (contentH, contentW) = (200, 400)
				// top: transY = bounds.h/2 - contentH/2 = 200 - 100 = 100
				const s = makeState([makeSlide([makeImageLayer(1, "a", { rotation: 90, transY: 500 })])]);
				const r = alignTo(s, 0, "top", 1600, 800, 400, 200);
				expect(r?.slides[0].layers[0].transY).toBe(100);
			});

			it("scale 2 倍: bbox も 2 倍 (visual bbox = 800x400)", () => {
				// top: bounds.h = 200 * 2 = 400, transY = 200 - 100 = 100
				const s = makeState([
					makeSlide([makeImageLayer(1, "a", { scaleX: 2, scaleY: 2, transY: 500 })]),
				]);
				const r = alignTo(s, 0, "top", 1600, 800, 400, 200);
				expect(r?.slides[0].layers[0].transY).toBe(100);
			});

			it("既に揃っている位置なら null", () => {
				const s = makeState([makeSlide([makeImageLayer(1, "a", { transY: 0 })])]);
				expect(alignTo(s, 0, "top", 1600, 800, 400, 200)).toBeNull();
			});

			it("contentW/H <= 0 は null", () => {
				const s = makeState([makeSlide([makeImageLayer(1, "a")])]);
				expect(alignTo(s, 0, "top", 1600, 800, 0, 200)).toBeNull();
			});
		});
	});

	describe("buildFitImageLayer (D-11/D-12)", () => {
		it("横長 slide に横長画像 → 無回転で contain fit + 中央配置", () => {
			// slide 1600x800, 画像 800x400 → scale0 = min(2, 2) = 2, scaleR = min(4,1)=1 → 0° 採用
			const l = buildFitImageLayer(1600, 800, 800, 400, "sha-x", "pic");
			expect(l.type).toBe("image");
			expect(l.rotation).toBe(0);
			expect(l.scaleX).toBe(2);
			expect(l.scaleY).toBe(2);
			// 中央配置: transX = 1600/2 - 800/2 = 400, transY = 800/2 - 400/2 = 200
			expect(l.transX).toBe(400);
			expect(l.transY).toBe(200);
			expect((l as { imageId: string }).imageId).toBe("sha-x");
			expect(l.name).toBe("pic");
		});

		it("横長 slide に縦長画像 → -90° 回転でより大きく fit", () => {
			// slide 1600x800, 画像 400x800 (縦長) → scale0 = min(4,1)=1, scaleR = min(2,2)=2 → -90° 採用
			const l = buildFitImageLayer(1600, 800, 400, 800, "sha-y");
			expect(l.rotation).toBe(-90);
			expect(l.scaleX).toBe(2);
			expect(l.name).toBe(""); // name 省略時は空
		});

		it("clipRect は [0,0,0,0]、mirror は false で初期化", () => {
			const l = buildFitImageLayer(800, 600, 400, 300, "sha-z");
			expect((l as { clipRect: number[] }).clipRect).toEqual([0, 0, 0, 0]);
			expect(l.mirrorH).toBe(false);
			expect(l.mirrorV).toBe(false);
			expect(l.opacity).toBe(1);
		});
	});
});
