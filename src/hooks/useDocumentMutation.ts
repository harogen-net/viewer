import { useHistoryStore } from "@/state/historyStore";
import { type ImageEntry, useImageLibraryStore } from "@/state/imageLibraryStore";
import { useLayerStore } from "@/state/layerStore";
import { useSlideStore } from "@/state/slideStore";
import { useViewerDocumentStore } from "@/state/viewerDocumentStore";
import type { SlideState } from "@/types/SlideState";
import { useCallback } from "react";

// ViewerDocument 階層 mutation primitive (v4 Group C 設計コア)。
//
// 役割: 「SlideState を変化させる pure な update を受け取り、3 つの副作用を同時に走らせる」
//   (1) slideStore に新 SlideState を反映 (selectedIndex 経由で layerStore も自動 cascade)
//   (2) viewerDocumentStore.refreshModified() で modified を再計算 (保存時点の slides と
//       参照一致すれば clean に落ちる = undo で元に戻した時に「変更あり」が消える)
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
	/**
	 * history を積まずに SlideState mutation を即時適用する (live 反映用)。
	 * legacy VMTextInput の `on("input")` 相当 — テキスト入力中など、確定前の
	 * 連続更新を store に反映するが undo ステップは作らない。
	 * 確定時に recordHistory で 1 件だけ history を残す運用とセットで使う。
	 */
	applySlideChangeLive: (update: (state: SlideState) => SlideState | null) => void;
	/**
	 * before スナップショットから現在状態までを history 1 件として記録する。
	 * legacy VMHistoricalTextInput の blur 記録相当。変化がなければ no-op。
	 */
	recordHistory: (label: string, before: SlideState) => void;
	/** 現在の SlideState スナップショット (before 取得用)。 */
	snapshot: () => SlideState;
	undo: () => void;
	redo: () => void;
	canUndo: () => boolean;
	canRedo: () => boolean;
}

const currentSlideState = (): SlideState => {
	const s = useSlideStore.getState();
	return { slides: s.slides, selectedIndex: s.selectedIndex };
};

const currentImages = (): Record<string, ImageEntry> => useImageLibraryStore.getState().imageById;

const applyToStores = (next: SlideState, images?: Record<string, ImageEntry>): void => {
	// 中間 cascade (setSlides → setLayers([])) で selectedLayer が一旦クリアされるため、
	// 現選択の uuid を保存しておき、cascade 完了後に新 layers から同 uuid を探して復元する。
	// (in-place mutation で drag / resize / prop 編集 後も選択状態を保つため)
	const prevSelectedUuid = useLayerStore.getState().selectedLayer?.uuid ?? null;
	// 編集中だったかを保存 (setSlides が editingIndex を -1 リセットするため、後で復元する)。
	// 編集モードでは editingIndex == selectedIndex なので、op が調整した next.selectedIndex に合わせる
	// (slide 並べ替え/削除/複製で index がずれても編集対象を追従させる)。
	const wasEditing = useSlideStore.getState().editingIndex >= 0;

	// 階層 cascade: slideStore.setSlides → slideStore.setSelectedIndex → layerStore 自動同期
	const slideStore = useSlideStore.getState();
	slideStore.setSlides(next.slides);
	slideStore.setSelectedIndex(next.selectedIndex);
	if (wasEditing) slideStore.setEditingIndex(next.selectedIndex);

	// 復元: 現在 layers に同 uuid があれば選択を出し直す (别 slide 切替等で見失えた場合は null のまま)
	if (prevSelectedUuid) {
		const layers = useLayerStore.getState().layers;
		const found = layers.find((l) => l.uuid === prevSelectedUuid) ?? null;
		if (found) useLayerStore.getState().setSelectedLayer(found);
	}

	// undo/redo で imageLibrary snapshot を復元する (差し替え/画像削除で prune された旧画像を
	// slides が参照し直せるように)。参照が変わっている時だけ setImageLibrary (無駄な再描画抑止)。
	if (images && images !== useImageLibraryStore.getState().imageById) {
		useImageLibraryStore.getState().setImageLibrary(images);
	}
};

export const useDocumentMutation = (): UseDocumentMutation => {
	const applySlideChange = useCallback(
		(label: string, update: (state: SlideState) => SlideState | null): void => {
			const before = currentSlideState();
			const beforeImages = currentImages();
			const after = update(before);
			if (!after) return; // no-op (op が null = 変化なし)
			applyToStores(after);
			// 保存時点の slides と一致するかで modified を再計算 (undo で元に戻れば clean に落ちる)。
			useViewerDocumentStore.getState().refreshModified();
			// afterImages は op 適用後に取得 (op 自体は library を触らないが、差し替え等の呼出側は
			// この applySlideChange の後で prune するため、ここでは prune 前の library を記録する)。
			useHistoryStore
				.getState()
				.push({ label, before, after, beforeImages, afterImages: currentImages() });
		},
		[]
	);

	const applySlideChangeLive = useCallback(
		(update: (state: SlideState) => SlideState | null): void => {
			const after = update(currentSlideState());
			if (!after) return; // no-op
			applyToStores(after);
			// ライブ編集中は常に変更あり (毎フレームの内容比較は避ける)。確定時 recordHistory で再計算する。
			useViewerDocumentStore.getState().setModified(true);
			// history は積まない (確定時に recordHistory で 1 件残す)
		},
		[]
	);

	const recordHistory = useCallback((label: string, before: SlideState): void => {
		const after = currentSlideState();
		// 変化なし (slides 参照が同一) は記録しない
		if (after.slides === before.slides) return;
		// テキスト入力等 library 非依存 op。before/after とも現在の library で可 (変化しない)。
		const images = currentImages();
		useHistoryStore
			.getState()
			.push({ label, before, after, beforeImages: images, afterImages: images });
		// ライブ編集の確定時に modified を再計算 (入力を保存時の内容に戻していれば clean に落ちる)。
		useViewerDocumentStore.getState().refreshModified();
	}, []);

	const snapshot = useCallback((): SlideState => currentSlideState(), []);

	const undo = useCallback((): void => {
		const entry = useHistoryStore.getState().popUndo();
		if (!entry) return;
		applyToStores(entry.before, entry.beforeImages);
		useViewerDocumentStore.getState().refreshModified();
	}, []);

	const redo = useCallback((): void => {
		const entry = useHistoryStore.getState().popRedo();
		if (!entry) return;
		applyToStores(entry.after, entry.afterImages);
		useViewerDocumentStore.getState().refreshModified();
	}, []);

	const canUndo = useCallback((): boolean => useHistoryStore.getState().canUndo(), []);
	const canRedo = useCallback((): boolean => useHistoryStore.getState().canRedo(), []);

	return {
		applySlideChange,
		applySlideChangeLive,
		recordHistory,
		snapshot,
		undo,
		redo,
		canUndo,
		canRedo,
	};
};
