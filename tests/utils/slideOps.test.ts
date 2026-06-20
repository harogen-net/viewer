import { describe, expect, it } from "vitest";
import type { Slide } from "../../src/types/Slide";
import type { SlideState } from "../../src/types/SlideState";
import {
    addSlide,
    deleteAllDisabled,
    deleteSlide,
    duplicateSlide,
    moveSlide,
    setAllDisabled,
    setAllJoining,
    setSlideDisabled,
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
			const s = makeState([makeSlide(1, "a", { joining: true }), makeSlide(2, "b", { joining: true })]);
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
				2, // "c" 選択
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
});
