import { create } from "zustand";
import type { Slide } from "../types/Slide";
import type { ViewerDocument } from "../types/ViewerDocument";
import { useClipboardStore } from "./clipboardStore";
import { useHistoryStore } from "./historyStore";
import { useSlideStore } from "./slideStore";

/** ViewerDocument から slides を除いたメタ部分 (slides は slideStore が保持)。 */
type DocumentMeta = Omit<ViewerDocument, "slides">;

// キー順に依存しない deep-equal。slides は数値/文字列/真偽値/配列/プレーンオブジェクトのみ
// (関数/Date 無し) なのでこれで十分。変形ペースト等で「内容は保存時と同じだが別配列」になった
// ケースを clean と判定するために使う (参照比較の後段フォールバック)。
function deepEqual(a: unknown, b: unknown): boolean {
	if (a === b) return true;
	if (typeof a !== "object" || typeof b !== "object" || a === null || b === null) return false;
	const aArr = Array.isArray(a);
	const bArr = Array.isArray(b);
	if (aArr || bArr) {
		if (!aArr || !bArr || a.length !== b.length) return false;
		for (let i = 0; i < a.length; i++) if (!deepEqual(a[i], b[i])) return false;
		return true;
	}
	const ka = Object.keys(a as Record<string, unknown>);
	const kb = Object.keys(b as Record<string, unknown>);
	if (ka.length !== kb.length) return false;
	for (const k of ka) {
		if (!Object.prototype.hasOwnProperty.call(b, k)) return false;
		if (!deepEqual((a as Record<string, unknown>)[k], (b as Record<string, unknown>)[k]))
			return false;
	}
	return true;
}

interface ViewerDocumentState {
	meta: DocumentMeta | null;
	modified: boolean;
	/** document の load / save / export 等の進捗 (0..1)。実行中でない時は null。 */
	progress: number | null;
	/** 進捗バーに添えるラベル (例 "保存中…" / "書き出し中… 3/12")。進捗が null の間は ""。 */
	progressLabel: string;
	/** clean 判定用: 最後に save/load した時点の slides 参照 (構造共有なので undo で元参照に戻れば一致)。 */
	savedSlides: Slide[] | null;
	/** meta 側 (title/bgColor/寸法) が baseline から編集されたか。slide 履歴では追えないため別管理。 */
	metaDirty: boolean;
	setDocument: (doc: ViewerDocument | null) => void;
	setModified: (modified: boolean) => void;
	/**
	 * slide の現状態を baseline (savedSlides) と比較し modified を再計算する。編集/undo/redo/確定後に呼ぶ。
	 *   - まず参照一致で判定 (undo で保存時点の配列参照に戻ったケースを O(1) で clean 判定)。
	 *   - 参照が違っても内容が保存時と同じなら clean (変形ペーストで元の値に戻した等、別配列だが同内容)。
	 *   - meta 編集 (metaDirty) があれば slide が clean でも modified=true を維持する。
	 */
	refreshModified: () => void;
	/** 保存完了をマーク: meta.title を保存名へ同期し baseline を現状態に更新 (履歴/slides は触らない)。 */
	markSaved: (title: string) => void;
	/** meta の一部を更新し modified=true にする (title / bgColor / width など document 設定の編集用)。
	 *  履歴/slides は触らない。width/height は SSOT なので別途 slide へ再注入すること。 */
	patchMeta: (patch: Partial<DocumentMeta>) => void;
	/** 進捗を更新。progress=null で非表示。label 省略時は現ラベルを維持 (null で "" にクリア)。 */
	setProgress: (progress: number | null, label?: string) => void;
}

export const useViewerDocumentStore = create<ViewerDocumentState>()((set) => ({
	meta: null,
	modified: false,
	progress: null,
	progressLabel: "",
	savedSlides: null,
	metaDirty: false,
	setDocument: (doc) => {
		// document 差し替え時は history を完全 reset (load 直後は undo 不可、legacy 挙動)
		useHistoryStore.getState().clear();
		// clipboard も clear (D-8)。レガシー clipboard は edit-view インスタンス毎で
		// document 切替時に失われるため、またぎペーストで孤児 imageId を生まないよう揃える。
		useClipboardStore.getState().clear();
		if (doc === null) {
			useSlideStore.getState().setSlides([]);
			// baseline を現在の slides 参照に取る (以後 undo でここへ戻れば clean 判定)。
			set({ meta: null, modified: false, metaDirty: false, savedSlides: null });
		} else {
			const { slides, ...meta } = doc;
			useSlideStore.getState().setSlides(slides);
			set({
				meta,
				modified: false,
				metaDirty: false,
				savedSlides: useSlideStore.getState().slides,
			});
		}
	},
	setModified: (modified) => set({ modified }),
	refreshModified: () =>
		set((s) => {
			const slides = useSlideStore.getState().slides;
			// 高速パス: 参照一致なら即 clean。違えば内容比較 (キー順非依存) でフォールバック判定。
			const slidesClean = slides === s.savedSlides || deepEqual(slides, s.savedSlides);
			return { modified: s.metaDirty || !slidesClean };
		}),
	markSaved: (title) =>
		set((s) => ({
			meta: s.meta ? { ...s.meta, title } : s.meta,
			modified: false,
			metaDirty: false,
			// 保存した現状態を新しい clean baseline にする。
			savedSlides: useSlideStore.getState().slides,
		})),
	patchMeta: (patch) =>
		set((s) => (s.meta ? { meta: { ...s.meta, ...patch }, modified: true, metaDirty: true } : {})),
	setProgress: (progress, label) =>
		set((s) => ({
			progress,
			progressLabel: progress === null ? "" : (label ?? s.progressLabel),
		})),
}));
