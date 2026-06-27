import { describe, expect, it } from "vitest";
import {
	pickEvenIndices,
	pickStripOrder,
	resolveStripStartPos,
} from "../../src/utils/slideThumbnail";
import type { Slide } from "../../src/types/Slide";

// 連結サムネのコマ選択 (active slide から両端含め均等に N コマ) の純関数テスト。
// 実画像生成 (drawSlideToCanvas) は canvas 依存のため jsdom では検証せず、ピック index のみ担保。

const mkSlide = (id: number, disabled = false): Slide => ({
	id,
	uuid: `s-${id}`,
	width: 800,
	height: 600,
	durationRatio: 1,
	joining: false,
	disabled,
	layers: [],
});

describe("pickEvenIndices", () => {
	it("total / n が 0 以下なら []", () => {
		expect(pickEvenIndices(0, 5)).toEqual([]);
		expect(pickEvenIndices(5, 0)).toEqual([]);
	});

	it("n == 1 は先頭 [0]", () => {
		expect(pickEvenIndices(10, 1)).toEqual([0]);
	});

	it("n >= total なら全 index", () => {
		expect(pickEvenIndices(3, 8)).toEqual([0, 1, 2]);
		expect(pickEvenIndices(4, 4)).toEqual([0, 1, 2, 3]);
	});

	it("両端を含めて均等にピック", () => {
		expect(pickEvenIndices(10, 5)).toEqual([0, 2, 5, 7, 9]);
		// 先頭と末尾は必ず含む
		const r = pickEvenIndices(20, 6);
		expect(r[0]).toBe(0);
		expect(r[r.length - 1]).toBe(19);
		expect(r.length).toBe(6);
	});
});

describe("pickStripOrder (選択スライド起点の回転 + 均等ピック)", () => {
	it("startPos=0 は従来どおり先頭起点", () => {
		expect(pickStripOrder([1, 2, 3, 4, 5], 8, 0)).toEqual([1, 2, 3, 4, 5]);
	});

	it("startPos=2 (slide3 選択) で 3,4,5,1,2 の順に回転 (例の通り)", () => {
		expect(pickStripOrder([1, 2, 3, 4, 5], 8, 2)).toEqual([3, 4, 5, 1, 2]);
	});

	it("回転後も maxCount で均等ピック (枚数・均等ロジックは不変)", () => {
		// 回転 [3,4,5,6,7,8,9,10,1,2] (10枚) を maxCount 5 で均等ピック = index [0,2,5,7,9]
		const active = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
		expect(pickStripOrder(active, 5, 2)).toEqual([3, 5, 8, 10, 2]);
	});

	it("startPos が範囲外なら先頭起点にフォールバック", () => {
		expect(pickStripOrder([1, 2, 3], 8, 9)).toEqual([1, 2, 3]);
		expect(pickStripOrder([1, 2, 3], 8, -1)).toEqual([1, 2, 3]);
	});

	it("空配列は []", () => {
		expect(pickStripOrder([], 8, 0)).toEqual([]);
	});
});

describe("resolveStripStartPos (選択 index → active 内位置)", () => {
	it("選択スライドの active 内位置を返す", () => {
		const all = [mkSlide(1), mkSlide(2), mkSlide(3)];
		expect(resolveStripStartPos(all, all, 2)).toBe(2);
	});

	it("disabled を挟むと active 内位置に写像される", () => {
		// all: [1, 2(disabled), 3]、active: [1, 3]。selectedIndex=2 (slide3) → active 内 index 1
		const all = [mkSlide(1), mkSlide(2, true), mkSlide(3)];
		const active = all.filter((s) => !s.disabled);
		expect(resolveStripStartPos(all, active, 2)).toBe(1);
	});

	it("選択が disabled (active に無い) なら 0", () => {
		const all = [mkSlide(1), mkSlide(2, true), mkSlide(3)];
		const active = all.filter((s) => !s.disabled);
		expect(resolveStripStartPos(all, active, 1)).toBe(0); // slide2 は disabled
	});

	it("selectedIndex 未指定 / 範囲外 は 0", () => {
		const all = [mkSlide(1), mkSlide(2)];
		expect(resolveStripStartPos(all, all, undefined)).toBe(0);
		expect(resolveStripStartPos(all, all, 5)).toBe(0);
		expect(resolveStripStartPos(all, all, -1)).toBe(0);
	});
});
