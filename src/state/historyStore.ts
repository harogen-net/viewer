import { create } from "zustand";
import type { ImageEntry } from "./imageLibraryStore";
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
	/**
	 * 操作前後の imageLibrary snapshot (imageId → entry)。画像差し替え / 画像削除は
	 * layer の imageId 変更 (SlideState) と library の add/prune (SlideState 外) が対で起きる。
	 * これを記録しないと、差し替えで prune された旧画像を undo で slides が参照し直しても
	 * library に dataURL が無く layer が壊れる (placeholder 表示) ため、library も snapshot する。
	 * entry は immutable / dataURL 文字列は参照共有なので shallow snapshot は安価。
	 * 省略時 (library 非依存 op や外部 push) は undo/redo で library を復元しない。
	 */
	beforeImages?: Record<string, ImageEntry>;
	afterImages?: Record<string, ImageEntry>;
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
	/**
	 * 全 history snapshot (past/future の before/after) の slide width/height を揃える。
	 * キャンバスサイズは ViewerDocument 管轄で undo/redo 対象外 (履歴外) のため、サイズ変更後に
	 * これを呼び、過去/未来 snapshot のサイズも新値へ書き換えて undo/redo でサイズが巻き戻らない
	 * ようにする (resurrection 防止)。slides 以外 (layers / selectedIndex) は不変。
	 */
	remapSlideSizes: (width: number, height: number) => void;
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

	remapSlideSizes: (width, height) => {
		const fixState = (st: SlideState): SlideState => ({
			...st,
			slides: st.slides.map((s) => ({ ...s, width, height })),
		});
		const fixEntry = (e: HistoryEntry): HistoryEntry => ({
			...e,
			before: fixState(e.before),
			after: fixState(e.after),
		});
		set((s) => ({ past: s.past.map(fixEntry), future: s.future.map(fixEntry) }));
	},
}));
