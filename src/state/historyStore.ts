import { create } from "zustand";
import type { SlideState } from "../types/SlideState";

// History store (v4 Group C 設計コア、undo/redo 駆動)。
//
// HistoryEntry: { label, before, after } の三つ組
//   - label:  human-readable 操作名 (undo/redo UI 表示 + debug)
//   - before: 操作前の SlideState (undo で復元)
//   - after:  操作後の SlideState (redo で復元)
//
// past / future の二段スタックモデル:
//   - mutation 実行時 → push: past に積み、future を clear (分岐放棄)
//   - undo            → popUndo: past から 1 つ取り future へ移動、entry を返す
//   - redo            → popRedo: future から 1 つ取り past へ戻す、entry を返す
//
// document load 時に clear() を呼ぶ前提 (viewerDocumentStore.setDocument で配線)。
//
// 構造共有: SlideState の slides 配列は ops 内で部分共有されるため、entry の
// メモリコストは「変化分のみ」。スライド数 1000 でも history 数十件なら数 MB に収まる。
//
// 最大件数 (MAX_HISTORY) を超えたら past の先頭から間引く (FIFO)。

const MAX_HISTORY = 200;

export interface HistoryEntry {
	label: string;
	before: SlideState;
	after: SlideState;
}

interface HistoryStoreState {
	past: HistoryEntry[];
	future: HistoryEntry[];
	push: (entry: HistoryEntry) => void;
	popUndo: () => HistoryEntry | null;
	popRedo: () => HistoryEntry | null;
	clear: () => void;
	canUndo: () => boolean;
	canRedo: () => boolean;
}

export const useHistoryStore = create<HistoryStoreState>()((set, get) => ({
	past: [],
	future: [],

	push: (entry) => {
		set((s) => {
			const nextPast = [...s.past, entry];
			// 上限超過分を先頭から削る
			if (nextPast.length > MAX_HISTORY) nextPast.splice(0, nextPast.length - MAX_HISTORY);
			return { past: nextPast, future: [] };
		});
	},

	popUndo: () => {
		const { past } = get();
		if (past.length === 0) return null;
		const entry = past[past.length - 1];
		set((s) => ({
			past: s.past.slice(0, -1),
			future: [entry, ...s.future],
		}));
		return entry;
	},

	popRedo: () => {
		const { future } = get();
		if (future.length === 0) return null;
		const entry = future[0];
		set((s) => ({
			past: [...s.past, entry],
			future: s.future.slice(1),
		}));
		return entry;
	},

	clear: () => set({ past: [], future: [] }),

	canUndo: () => get().past.length > 0,
	canRedo: () => get().future.length > 0,
}));
