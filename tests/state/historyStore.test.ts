import { beforeEach, describe, expect, it } from "vitest";
import { useHistoryStore, type HistoryEntry } from "../../src/state/historyStore";
import type { SlideState } from "../../src/types/SlideState";

// v4 Group C: history store の単体テスト。
// push / popUndo / popRedo / clear / canUndo / canRedo / 最大件数を検証。

const emptyState = (selectedIndex = -1): SlideState => ({ slides: [], selectedIndex });

const makeEntry = (label: string): HistoryEntry => ({
	label,
	before: emptyState(0),
	after: emptyState(1),
});

beforeEach(() => {
	useHistoryStore.getState().clear();
});

describe("historyStore (v4 Group C)", () => {
	it("初期状態は past / future 空、canUndo / canRedo false", () => {
		const s = useHistoryStore.getState();
		expect(s.past).toEqual([]);
		expect(s.future).toEqual([]);
		expect(s.canUndo()).toBe(false);
		expect(s.canRedo()).toBe(false);
	});

	it("push で past 末尾に積む、future は空に保たれる", () => {
		const e1 = makeEntry("op1");
		const e2 = makeEntry("op2");
		useHistoryStore.getState().push(e1);
		useHistoryStore.getState().push(e2);
		const s = useHistoryStore.getState();
		expect(s.past.length).toBe(2);
		expect(s.past[0].label).toBe("op1");
		expect(s.past[1].label).toBe("op2");
		expect(s.future).toEqual([]);
	});

	it("popUndo で past 末尾を返し、future 先頭に移動", () => {
		const e1 = makeEntry("op1");
		const e2 = makeEntry("op2");
		useHistoryStore.getState().push(e1);
		useHistoryStore.getState().push(e2);

		const popped = useHistoryStore.getState().popUndo();
		expect(popped?.label).toBe("op2");
		const s = useHistoryStore.getState();
		expect(s.past.length).toBe(1);
		expect(s.past[0].label).toBe("op1");
		expect(s.future.length).toBe(1);
		expect(s.future[0].label).toBe("op2");
	});

	it("popRedo で future 先頭を取り past 末尾に戻す", () => {
		const e1 = makeEntry("op1");
		useHistoryStore.getState().push(e1);
		useHistoryStore.getState().popUndo();

		const popped = useHistoryStore.getState().popRedo();
		expect(popped?.label).toBe("op1");
		const s = useHistoryStore.getState();
		expect(s.past.length).toBe(1);
		expect(s.future.length).toBe(0);
	});

	it("undo 後に新 mutation を push すると future は破棄される (分岐放棄)", () => {
		useHistoryStore.getState().push(makeEntry("op1"));
		useHistoryStore.getState().push(makeEntry("op2"));
		useHistoryStore.getState().popUndo(); // future に op2

		useHistoryStore.getState().push(makeEntry("op3"));
		const s = useHistoryStore.getState();
		expect(s.past.map((e) => e.label)).toEqual(["op1", "op3"]);
		expect(s.future).toEqual([]);
	});

	it("popUndo / popRedo は空なら null", () => {
		expect(useHistoryStore.getState().popUndo()).toBeNull();
		expect(useHistoryStore.getState().popRedo()).toBeNull();
	});

	it("canUndo / canRedo が past / future の長さに連動", () => {
		expect(useHistoryStore.getState().canUndo()).toBe(false);
		useHistoryStore.getState().push(makeEntry("op1"));
		expect(useHistoryStore.getState().canUndo()).toBe(true);
		useHistoryStore.getState().popUndo();
		expect(useHistoryStore.getState().canUndo()).toBe(false);
		expect(useHistoryStore.getState().canRedo()).toBe(true);
	});

	it("clear で past / future 両方が空に", () => {
		useHistoryStore.getState().push(makeEntry("op1"));
		useHistoryStore.getState().push(makeEntry("op2"));
		useHistoryStore.getState().popUndo();
		useHistoryStore.getState().clear();
		const s = useHistoryStore.getState();
		expect(s.past).toEqual([]);
		expect(s.future).toEqual([]);
	});

	it("最大件数 (200) を超えると古い entry が FIFO で間引かれる", () => {
		for (let i = 0; i < 250; i++) {
			useHistoryStore.getState().push(makeEntry(`op${i}`));
		}
		const s = useHistoryStore.getState();
		expect(s.past.length).toBe(200);
		expect(s.past[0].label).toBe("op50"); // 先頭 50 件が削られた
		expect(s.past[199].label).toBe("op249");
	});

	describe("remapSlideSizes (キャンバスサイズ履歴外対応)", () => {
		const stateWithSlide = (w: number, h: number): SlideState => ({
			slides: [
				{
					id: 1,
					uuid: "a",
					width: w,
					height: h,
					durationRatio: 1,
					joining: true,
					disabled: false,
					layers: [],
				},
			],
			selectedIndex: 0,
		});
		const entry800 = (label: string): HistoryEntry => ({
			label,
			before: stateWithSlide(800, 600),
			after: stateWithSlide(800, 600),
		});

		it("past / future 全 snapshot の slide サイズを新値へ書き換える", () => {
			useHistoryStore.getState().push(entry800("a"));
			useHistoryStore.getState().push(entry800("b"));
			useHistoryStore.getState().popUndo(); // b を future へ (past=[a], future=[b])
			useHistoryStore.getState().remapSlideSizes(1920, 1080);
			const s = useHistoryStore.getState();
			const sizes = [
				...s.past.flatMap((e) => [e.before.slides[0], e.after.slides[0]]),
				...s.future.flatMap((e) => [e.before.slides[0], e.after.slides[0]]),
			].map((sl) => [sl.width, sl.height]);
			expect(sizes.every(([w, h]) => w === 1920 && h === 1080)).toBe(true);
		});

		it("selectedIndex / layers は不変", () => {
			useHistoryStore.getState().push(entry800("a"));
			useHistoryStore.getState().remapSlideSizes(1024, 768);
			const e = useHistoryStore.getState().past[0];
			expect(e.before.selectedIndex).toBe(0);
			expect(e.before.slides[0].layers).toEqual([]);
		});
	});
});
