import { WriteCapability } from "@/state/launchModeStore";
import type { SlideState } from "@/types/SlideState";
import { useListToolStore } from "@/state/listToolStore";
import { useViewerDocumentStore } from "@/state/viewerDocumentStore";
import * as slideOps from "@/utils/slideOps";
import { useCallback } from "react";
import { useDocumentMutation } from "./useDocumentMutation";

// 一括切替モードの操作口 (docs/bulk-toggle-mode-plan.md)。
//
// 「スライドをクリックしたら有効/無効が切り替わる」だけの局所モード。一覧モードのサブ状態で、
// モード中は編集・削除・伸縮・結合・並べ替え・右クリック・undo/redo を止める (抑止は各所)。
//
// 履歴はモード中まとめて 1 件にする。テキスト入力の確定と同じ手口:
//   突入時に snapshot → クリックは applySlideChangeLive (履歴を積まない) → 退出時に recordHistory。
// recordHistory は「slides 参照が変わっていなければ記録しない」+ refreshModified なので、
// 触って元に戻して抜けた場合は履歴も未保存フラグも立たない。
//
// 書込権限は SLIDE_PLAYBACK。有効/無効はスライドもレイヤーも消さない再生設定なので、
// スマホモードでも通す (setSlideDisabled が既にこの種別)。既定の FULL のままだと
// スマホモードで silent に弾かれてモードが機能しない。

// 突入時から実質的に変わっていないか。
// recordHistory 側の「変化なし」判定は slides の **参照** 一致なので、A を消して A を戻すと
// 中身が同じでも別配列になり、空の履歴が 1 件積まれてしまう。ここで内容で見てから渡す。
//
// モード中に変わりうるのは disabled だけ (他の操作は止めてある) なので、
// 並びと disabled だけ突き合わせれば足りる。このモードで他の値も変えられるようにしたら、
// ここの比較も広げること。
const isUnchanged = (before: SlideState, after: SlideState): boolean =>
	before.slides.length === after.slides.length &&
	before.slides.every((s, i) => {
		const t = after.slides[i];
		return s === t || (s.uuid === t.uuid && s.disabled === t.disabled);
	});

export interface UseBulkToggleMode {
	/** 一括切替モード中か。 */
	active: boolean;
	/** モードの出入り。true で突入 (snapshot 取得)、false で退出 (履歴 1 件を記録)。 */
	setActive: (on: boolean) => void;
	/** モード中のスライドクリック。選択は動かさず disabled だけ反転する。 */
	toggleAt: (index: number) => void;
	/**
	 * 履歴を残さずに抜ける。文書が差し替わった時に使う。
	 * 突入時 snapshot は差し替え前の文書のものなので、そのまま recordHistory すると
	 * 「別文書の slides」を before として積んでしまい、undo が前の文書を復元してしまう。
	 */
	cancel: () => void;
}

export const useBulkToggleMode = (): UseBulkToggleMode => {
	const active = useListToolStore((s) => s.bulkToggleActive);
	const beginBulkToggle = useListToolStore((s) => s.beginBulkToggle);
	const endBulkToggle = useListToolStore((s) => s.endBulkToggle);
	const { snapshot, applySlideChangeLive, recordHistory } = useDocumentMutation();

	const setActive = useCallback(
		(on: boolean): void => {
			if (on) {
				beginBulkToggle(snapshot());
				return;
			}
			const before = endBulkToggle();
			if (!before) return; // モード中でなければ何もしない
			if (isUnchanged(before, snapshot())) {
				// 触って元に戻した = 履歴に残さない。ただし applySlideChangeLive が
				// modified を無条件に立てているので、ここで再計算して clean へ戻す
				// (recordHistory を通る場合はその中で refreshModified される)。
				useViewerDocumentStore.getState().refreshModified();
				return;
			}
			recordHistory("enable/disable slides", before, WriteCapability.SLIDE_PLAYBACK);
		},
		[beginBulkToggle, endBulkToggle, snapshot, recordHistory]
	);

	const toggleAt = useCallback(
		(index: number): void => {
			applySlideChangeLive((s) => {
				const target = s.slides[index];
				if (!target) return null;
				return slideOps.setSlideDisabled(s, index, !target.disabled);
			}, WriteCapability.SLIDE_PLAYBACK);
		},
		[applySlideChangeLive]
	);

	const cancel = useCallback((): void => {
		endBulkToggle();
	}, [endBulkToggle]);

	return { active, setActive, toggleAt, cancel };
};
