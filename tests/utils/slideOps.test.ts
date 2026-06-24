import { describe, expect, it } from "vitest";
import type { Slide } from "../../src/types/Slide";
import type { SlideState } from "../../src/types/SlideState";
import type { NewLayer } from "../../src/utils/layerOps";
import {
	addImageSlide,
	addSlide,
	decrementSlideDurationRatio,
	deleteAllDisabled,
	deleteSlide,
	duplicateSlide,
	incrementSlideDurationRatio,
	moveSlide,
	setAllDisabled,
	setAllJoining,
	setSlideDisabled,
	setSlideDurationRatio,
	setSlideJoining,
} from "../../src/utils/slideOps";

// v4 Group C refactor: 純関数 slideOps の単体テスト。
// store / hook / DOM を一切起こさず関数を直接呼ぶため、爆速 (1 ファイル数十 ms)。

const makeSlide = (id: number, uuid: string, overrides: Partial<Slide> = {}): Slide => ({
	id,
	uuid,
	width: 800,
	height: 600,
	durationRatio: 1,
	joining: true,
	disabled: false,
	layers: [],
	...overrides,
});

const makeState = (slides: Slide[], selectedIndex = -1): SlideState => ({
	slides,
	selectedIndex,
});

describe("slideOps (v4 Group C 純関数)", () => {
	describe("moveSlide", () => {
		it("from → to に移動、選択 slide の uuid で追従", () => {
			const s = makeState([makeSlide(1, "a"), makeSlide(2, "b"), makeSlide(3, "c")], 1);
			const r = moveSlide(s, 1, 0);
			expect(r).not.toBeNull();
			expect(r?.slides.map((x) => x.uuid)).toEqual(["b", "a", "c"]);
			expect(r?.selectedIndex).toBe(0);
		});

		it("from === to / 範囲外 は null", () => {
			const s = makeState([makeSlide(1, "a"), makeSlide(2, "b")]);
			expect(moveSlide(s, 0, 0)).toBeNull();
			expect(moveSlide(s, -1, 1)).toBeNull();
			expect(moveSlide(s, 0, 99)).toBeNull();
		});

		it("入力 state を mutate しない (immutability)", () => {
			const s = makeState([makeSlide(1, "a"), makeSlide(2, "b")]);
			moveSlide(s, 0, 1);
			expect(s.slides.map((x) => x.uuid)).toEqual(["a", "b"]);
		});
	});

	describe("addSlide", () => {
		it("末尾に追加、id は max+1", () => {
			const s = makeState([makeSlide(5, "a"), makeSlide(2, "b")], 0);
			const r = addSlide(s, 100, 50);
			expect(r.slides.length).toBe(3);
			expect(r.slides[2].id).toBe(6); // max(5,2)+1
			expect(r.slides[2].width).toBe(100);
			expect(r.slides[2].height).toBe(50);
			expect(r.selectedIndex).toBe(0); // 末尾 → 選択 index 不変
		});

		it("atIndex 指定で挿入、選択 index が +1 シフト", () => {
			const s = makeState([makeSlide(1, "a"), makeSlide(2, "b")], 1);
			const r = addSlide(s, 100, 100, 0);
			expect(r.slides.length).toBe(3);
			expect(r.selectedIndex).toBe(2);
		});
	});

	describe("deleteSlide", () => {
		it("選択中 slide 削除で同 index の次が選択", () => {
			const s = makeState([makeSlide(1, "a"), makeSlide(2, "b"), makeSlide(3, "c")], 1);
			const r = deleteSlide(s, 1);
			expect(r?.slides.map((x) => x.uuid)).toEqual(["a", "c"]);
			expect(r?.selectedIndex).toBe(1);
		});

		it("末尾選択中の末尾削除 → 前 slide が選択", () => {
			const s = makeState([makeSlide(1, "a"), makeSlide(2, "b")], 1);
			const r = deleteSlide(s, 1);
			expect(r?.selectedIndex).toBe(0);
		});

		it("最後の 1 枚を消すと -1", () => {
			const s = makeState([makeSlide(1, "a")], 0);
			const r = deleteSlide(s, 0);
			expect(r?.selectedIndex).toBe(-1);
		});

		it("選択 index より前を消すと selectedIndex は -1 シフト", () => {
			const s = makeState([makeSlide(1, "a"), makeSlide(2, "b"), makeSlide(3, "c")], 2);
			const r = deleteSlide(s, 0);
			expect(r?.selectedIndex).toBe(1);
		});

		it("範囲外は null", () => {
			const s = makeState([makeSlide(1, "a")]);
			expect(deleteSlide(s, -1)).toBeNull();
			expect(deleteSlide(s, 99)).toBeNull();
		});
	});

	describe("duplicateSlide", () => {
		it("複製は元の直後に挿入、新規 id + uuid", () => {
			const s = makeState([makeSlide(1, "a"), makeSlide(2, "b")]);
			const r = duplicateSlide(s, 0);
			expect(r?.slides.length).toBe(3);
			expect(r?.slides[0].uuid).toBe("a");
			expect(r?.slides[1].uuid).not.toBe("a");
			expect(r?.slides[1].uuid).not.toBe("b");
			expect(r?.slides[1].id).toBe(3); // max(1,2)+1
			expect(r?.slides[2].uuid).toBe("b");
		});

		it("範囲外は null", () => {
			expect(duplicateSlide(makeState([]), 0)).toBeNull();
		});
	});

	describe("setSlideJoining / setSlideDisabled", () => {
		it("対象 slide のみ更新", () => {
			const s = makeState([
				makeSlide(1, "a", { joining: true }),
				makeSlide(2, "b", { joining: true }),
			]);
			const r = setSlideJoining(s, 0, false);
			expect(r?.slides[0].joining).toBe(false);
			expect(r?.slides[1].joining).toBe(true);
		});

		it("同値設定は null (no-op)", () => {
			const s = makeState([makeSlide(1, "a", { joining: true })]);
			expect(setSlideJoining(s, 0, true)).toBeNull();
			expect(setSlideDisabled(s, 0, false)).toBeNull();
		});

		it("範囲外は null", () => {
			expect(setSlideJoining(makeState([]), 0, true)).toBeNull();
		});
	});

	describe("setAllJoining / setAllDisabled / deleteAllDisabled", () => {
		it("setAllJoining(false) で全 joining=false + durationRatio=1 リセット", () => {
			const s = makeState([
				makeSlide(1, "a", { joining: true, durationRatio: 0.5 }),
				makeSlide(2, "b", { joining: true, durationRatio: 2 }),
			]);
			const r = setAllJoining(s, false);
			expect(r?.slides.every((x) => x.joining === false)).toBe(true);
			expect(r?.slides.every((x) => x.durationRatio === 1)).toBe(true);
		});

		it("setAllJoining: 既に全一致なら null", () => {
			const s = makeState([
				makeSlide(1, "a", { joining: true, durationRatio: 1 }),
				makeSlide(2, "b", { joining: true, durationRatio: 1 }),
			]);
			expect(setAllJoining(s, true)).toBeNull();
		});

		it("setAllDisabled / deleteAllDisabled の組合せで全削除", () => {
			let s = makeState([makeSlide(1, "a"), makeSlide(2, "b"), makeSlide(3, "c")]);
			s = setAllDisabled(s, true) ?? s;
			expect(s.slides.every((x) => x.disabled)).toBe(true);
			const r = deleteAllDisabled(s);
			expect(r?.slides.length).toBe(0);
			expect(r?.selectedIndex).toBe(-1);
		});

		it("deleteAllDisabled は 一部 disabled なら該当のみ削除、uuid 追従", () => {
			const s = makeState(
				[
					makeSlide(1, "a", { disabled: false }),
					makeSlide(2, "b", { disabled: true }),
					makeSlide(3, "c", { disabled: false }),
				],
				2 // "c" 選択
			);
			const r = deleteAllDisabled(s);
			expect(r?.slides.map((x) => x.uuid)).toEqual(["a", "c"]);
			expect(r?.selectedIndex).toBe(1);
		});

		it("disabled 無し / 空配列 の deleteAllDisabled は null", () => {
			expect(deleteAllDisabled(makeState([makeSlide(1, "a")]))).toBeNull();
			expect(deleteAllDisabled(makeState([]))).toBeNull();
		});
	});

	describe("durationRatio (set / increment / decrement)", () => {
		it("setSlideDurationRatio: 範囲外 / 値同じは null、それ以外更新", () => {
			const s = makeState([makeSlide(1, "a")]);
			expect(setSlideDurationRatio(s, 0, 1)).toBeNull(); // 既定 1
			expect(setSlideDurationRatio(s, 99, 2)).toBeNull(); // 範囲外
			const r = setSlideDurationRatio(s, 0, 1.5);
			expect(r?.slides[0].durationRatio).toBe(1.5);
		});

		it("setSlideDurationRatio: 0.2 未満 / 9 超は clamp", () => {
			const s = makeState([makeSlide(1, "a")]);
			expect(setSlideDurationRatio(s, 0, 0)?.slides[0].durationRatio).toBe(0.2);
			expect(setSlideDurationRatio(s, 0, 100)?.slides[0].durationRatio).toBe(9);
		});

		it("incrementSlideDurationRatio: 1 → 1.5 → 2 → 3 → ... → 9 (頭打ち)", () => {
			let s: SlideState = makeState([makeSlide(1, "a")]);
			// 1.0 + 0.5 = 1.5
			s = incrementSlideDurationRatio(s, 0) ?? s;
			expect(s.slides[0].durationRatio).toBe(1.5);
			// 1.5 + 0.5 = 2.0
			s = incrementSlideDurationRatio(s, 0) ?? s;
			expect(s.slides[0].durationRatio).toBe(2);
			// 2.0 + 1 = 3.0
			s = incrementSlideDurationRatio(s, 0) ?? s;
			expect(s.slides[0].durationRatio).toBe(3);
		});

		it("incrementSlideDurationRatio: v < 1 のとき +0.2、上限 9 で null", () => {
			let s: SlideState = makeState([makeSlide(1, "a", { durationRatio: 0.4 })]);
			s = incrementSlideDurationRatio(s, 0) ?? s;
			// 0.4 + 0.2 = 0.6 だが浮動小数点で 0.6000000000000001 になる可能性 → toBeCloseTo
			expect(s.slides[0].durationRatio).toBeCloseTo(0.6, 10);

			const s9 = makeState([makeSlide(1, "a", { durationRatio: 9 })]);
			expect(incrementSlideDurationRatio(s9, 0)).toBeNull();
		});

		it("decrementSlideDurationRatio: 2 → 1.5 → 1 → 0.8 → ... → 0.2 (下限)", () => {
			let s: SlideState = makeState([makeSlide(1, "a", { durationRatio: 2 })]);
			s = decrementSlideDurationRatio(s, 0) ?? s;
			expect(s.slides[0].durationRatio).toBe(1.5);
			s = decrementSlideDurationRatio(s, 0) ?? s;
			expect(s.slides[0].durationRatio).toBe(1);
			s = decrementSlideDurationRatio(s, 0) ?? s;
			expect(s.slides[0].durationRatio).toBeCloseTo(0.8, 10);

			const sMin = makeState([makeSlide(1, "a", { durationRatio: 0.2 })]);
			expect(decrementSlideDurationRatio(sMin, 0)).toBeNull();
		});

		it("decrementSlideDurationRatio: v > 2 で -1", () => {
			const s = makeState([makeSlide(1, "a", { durationRatio: 5 })]);
			expect(decrementSlideDurationRatio(s, 0)?.slides[0].durationRatio).toBe(4);
		});
	});

	describe("addImageSlide (D-12)", () => {
		const imageLayer: NewLayer = {
			name: "pic",
			opacity: 1,
			locked: false,
			visible: true,
			shared: false,
			transX: 10,
			transY: 20,
			scaleX: 0.5,
			scaleY: 0.5,
			rotation: 0,
			mirrorH: false,
			mirrorV: false,
			type: "image",
			imageId: "sha-pic",
			clipRect: [0, 0, 0, 0],
			isText: false,
		};

		it("画像 1 枚を持つ slide を末尾に追加し、それを選択する", () => {
			const s = makeState([makeSlide(1, "a"), makeSlide(2, "b")], 0);
			const next = addImageSlide(s, 1280, 720, imageLayer);
			expect(next.slides).toHaveLength(3);
			expect(next.selectedIndex).toBe(2); // 新規 slide を選択
			const added = next.slides[2];
			expect(added.width).toBe(1280);
			expect(added.height).toBe(720);
			expect(added.id).toBe(3); // nextSlideId = max(1,2)+1
			expect(added.layers).toHaveLength(1);
			const layer = added.layers[0];
			expect(layer.type).toBe("image");
			expect((layer as { imageId: string }).imageId).toBe("sha-pic");
			expect(layer.id).toBe(1); // 新規 slide 内 layer は id=1
			expect(layer.transX).toBe(10);
		});

		it("空の slides でも追加でき、selectedIndex=0", () => {
			const next = addImageSlide(makeState([]), 800, 600, imageLayer);
			expect(next.slides).toHaveLength(1);
			expect(next.selectedIndex).toBe(0);
			expect(next.slides[0].id).toBe(1);
		});
	});
});
