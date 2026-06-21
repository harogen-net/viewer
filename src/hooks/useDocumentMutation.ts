import { useCallback } from "react";
import { useHistoryStore } from "../state/historyStore";
import { useLayerStore } from "../state/layerStore";
import { useSlideStore } from "../state/slideStore";
import { useViewerDocumentStore } from "../state/viewerDocumentStore";
import type { SlideState } from "../types/SlideState";

// ViewerDocument 階層 mutation primitive (v4 Group C 設計コア)。
//
// 役割: 「SlideState を変化させる pure な update を受け取り、3 つの副作用を同時に走らせる」
//   (1) slideStore に新 SlideState を反映 (selectedIndex 経由で layerStore も自動 cascade)
//   (2) viewerDocumentStore.setModified(true) で下→上 通知
//   (3) historyStore.push({ label, before, after }) で undo/redo 用 snapshot 記録
//
// update が null を返したら no-op (range check / 値変化なし)。history も記録しない。
//
// useSlideMutation / useLayerMutation (Group D) はすべてこの primitive を経由するため、
// CRUD ごとに store 結線や modified 配線を書かなくて済む。

export interface UseDocumentMutation {
	/**
	 * SlideState mutation を適用。
	 * @param label  undo/redo UI 表示用の操作名 (例: "move slide")
	 * @param update (state: SlideState) => SlideState | null
	 */
	applySlideChange: (label: string, update: (state: SlideState) => SlideState | null) => void;
	undo: () => void;
	redo: () => void;
	canUndo: () => boolean;
	canRedo: () => boolean;
}

const currentSlideState = (): SlideState => {
	const s = useSlideStore.getState();
	return { slides: s.slides, selectedIndex: s.selectedIndex };
};

const applyToStores = (next: SlideState): void => {
	// 中間 cascade (setSlides → setLayers([])) で selectedLayer が一旦クリアされるため、
	// 現選択の uuid を保存しておき、cascade 完了後に新 layers から同 uuid を探して復元する。
	// (in-place mutation で drag / resize / prop 編集 後も選択状態を保つため)
	const prevSelectedUuid = useLayerStore.getState().selectedLayer?.uuid ?? null;

	// 階層 cascade: slideStore.setSlides → slideStore.setSelectedIndex → layerStore 自動同期
	const slideStore = useSlideStore.getState();
	slideStore.setSlides(next.slides);
	slideStore.setSelectedIndex(next.selectedIndex);

	// 復元: 現在 layers に同 uuid があれば選択を出し直す (别 slide 切替等で見失えた場合は null のまま)
	if (prevSelectedUuid) {
		const layers = useLayerStore.getState().layers;
		const found = layers.find((l) => l.uuid === prevSelectedUuid) ?? null;
		if (found) useLayerStore.getState().setSelectedLayer(found);
	}
};

export const useDocumentMutation = (): UseDocumentMutation => {
	const applySlideChange = useCallback(
		(label: string, update: (state: SlideState) => SlideState | null): void => {
			const before = currentSlideState();
			const after = update(before);
			if (!after) return; // no-op (op が null = 変化なし)
			applyToStores(after);
			useViewerDocumentStore.getState().setModified(true);
			useHistoryStore.getState().push({ label, before, after });
		},
		[],
	);

	const undo = useCallback((): void => {
		const entry = useHistoryStore.getState().popUndo();
		if (!entry) return;
		applyToStores(entry.before);
		useViewerDocumentStore.getState().setModified(true);
	}, []);

	const redo = useCallback((): void => {
		const entry = useHistoryStore.getState().popRedo();
		if (!entry) return;
		applyToStores(entry.after);
		useViewerDocumentStore.getState().setModified(true);
	}, []);

	const canUndo = useCallback((): boolean => useHistoryStore.getState().canUndo(), []);
	const canRedo = useCallback((): boolean => useHistoryStore.getState().canRedo(), []);

	return { applySlideChange, undo, redo, canUndo, canRedo };
};
