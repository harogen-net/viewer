import { create } from "zustand";
import type { Slide } from "../types/Slide";
import { useLayerStore } from "./layerStore";

// Slide 配列 + 選択 index / 編集対象 index を保持する store (v4 Group C refactor で slim 化)。
//
// legacy 準拠の 2 index:
//   - selectedIndex: 選択 (ハイライト)。一覧でも編集中でも持つ。編集対象ではない。
//   - editingIndex:  編集対象 (編集モードの駆動)。-1 = 一覧モード (非編集)。
//   - 編集モードでは両者は一致する (setEditingIndex が selectedIndex も合わせる)。
//
// 設計方針:
//   - store は **階層 cascade の setter** のみ持つ (CRUD ロジックは hooks へ)
//   - setSlides:        ViewerDocument → Slide cascade (load 時)
//   - setSelectedIndex: 選択 slide の layers を layerStore へ cascade (編集時は editing と一致)
//   - setEditingIndex:  編集対象を設定 (i>=0 で selectedIndex も合わせ layers cascade)
//   - modified flag / history 記録 / shared layer 兄弟更新は useDocumentMutation primitive 側
//   - CRUD は src/utils/slideOps.ts (純関数) + src/hooks/useSlideMutation.ts (facade)

interface SlideState {
	slides: Slide[];
	/** 選択 (ハイライト)。編集対象ではない。 */
	selectedIndex: number;
	/** 編集対象 (編集モード駆動)。-1 = 一覧モード。編集中は selectedIndex と一致。 */
	editingIndex: number;
	setSlides: (slides: Slide[]) => void;
	setSelectedIndex: (index: number) => void;
	/** 編集対象を設定。i>=0 は編集モードへ (selectedIndex も i に合わせる)。-1 で一覧へ戻る。 */
	setEditingIndex: (index: number) => void;
}

export const useSlideStore = create<SlideState>()((set, get) => ({
	slides: [],
	selectedIndex: -1,
	editingIndex: -1,

	setSlides: (slides) => {
		set({ slides, selectedIndex: -1, editingIndex: -1 });
		// 階層 cascade: slides 差し替え時は layerStore も空に同期 (選択も解除)
		useLayerStore.getState().setLayers([]);
	},

	setSelectedIndex: (selectedIndex) => {
		set({ selectedIndex });
		// 階層 cascade: 選択 slide の layers を layerStore へ
		const slide = get().slides[selectedIndex];
		useLayerStore.getState().setLayers(slide?.layers ?? []);
	},

	setEditingIndex: (editingIndex) => {
		if (editingIndex >= 0) {
			// 編集モード: 編集対象 = 選択 (一致)。layers も編集対象から cascade。
			set({ editingIndex, selectedIndex: editingIndex });
			const slide = get().slides[editingIndex];
			useLayerStore.getState().setLayers(slide?.layers ?? []);
		} else {
			// 一覧へ戻る (選択ハイライトは保持)。
			set({ editingIndex: -1 });
		}
	},
}));
