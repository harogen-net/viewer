import { create } from "zustand";
import type { Slide } from "../types/Slide";
import { useLayerStore } from "./layerStore";

// Slide 配列 + 選択 index を保持する store (v4 Group C refactor で slim 化)。
//
// 設計方針:
//   - store は **階層 cascade の setter** のみ持つ (CRUD ロジックは hooks へ)
//   - setSlides:        ViewerDocument → Slide cascade (load 時)
//   - setSelectedIndex: Slide → Layer cascade (選択 slide の layers を layerStore へ)
//   - modified flag / history 記録 / shared layer 兄弟更新は useDocumentMutation primitive 側
//   - CRUD は src/utils/slideOps.ts (純関数) + src/hooks/useSlideMutation.ts (facade)

interface SlideState {
	slides: Slide[];
	selectedIndex: number;
	setSlides: (slides: Slide[]) => void;
	setSelectedIndex: (index: number) => void;
}

export const useSlideStore = create<SlideState>()((set, get) => ({
	slides: [],
	selectedIndex: -1,

	setSlides: (slides) => {
		set({ slides, selectedIndex: -1 });
		// 階層 cascade: slides 差し替え時は layerStore も空に同期 (選択も解除)
		useLayerStore.getState().setLayers([]);
	},

	setSelectedIndex: (selectedIndex) => {
		set({ selectedIndex });
		// 階層 cascade: 選択 slide の layers を layerStore へ
		const slide = get().slides[selectedIndex];
		useLayerStore.getState().setLayers(slide?.layers ?? []);
	},
}));
