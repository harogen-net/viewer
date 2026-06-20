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
});
