import { describe, expect, it } from "vitest";
import { pickEvenIndices } from "../../src/utils/slideThumbnail";

// 連結サムネのコマ選択 (active slide から両端含め均等に N コマ) の純関数テスト。
// 実画像生成 (drawSlideToCanvas) は canvas 依存のため jsdom では検証せず、ピック index のみ担保。

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
