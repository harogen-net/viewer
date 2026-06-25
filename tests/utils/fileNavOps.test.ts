import { describe, expect, it } from "vitest";
import { adjacentTitleIndex } from "../../src/utils/fileNavOps";

// 保存ファイル前後移動の index 計算 (レガシー FileSelector 踏襲、ラップなし)。

describe("adjacentTitleIndex", () => {
	it("一覧が空なら常に -1", () => {
		expect(adjacentTitleIndex(0, -1, "next")).toBe(-1);
		expect(adjacentTitleIndex(0, -1, "prev")).toBe(-1);
		expect(adjacentTitleIndex(0, 0, "next")).toBe(-1);
	});

	it("next: 1 つ後ろへ", () => {
		expect(adjacentTitleIndex(3, 0, "next")).toBe(1);
		expect(adjacentTitleIndex(3, 1, "next")).toBe(2);
	});

	it("next: 末尾では移動なし (-1、ラップしない)", () => {
		expect(adjacentTitleIndex(3, 2, "next")).toBe(-1);
	});

	it("prev: 1 つ前へ", () => {
		expect(adjacentTitleIndex(3, 2, "prev")).toBe(1);
		expect(adjacentTitleIndex(3, 1, "prev")).toBe(0);
	});

	it("prev: 先頭では移動なし (-1、ラップしない)", () => {
		expect(adjacentTitleIndex(3, 0, "prev")).toBe(-1);
	});

	it("未選択 (-1): next は先頭 0、prev は移動なし", () => {
		expect(adjacentTitleIndex(3, -1, "next")).toBe(0);
		expect(adjacentTitleIndex(3, -1, "prev")).toBe(-1);
	});
});
