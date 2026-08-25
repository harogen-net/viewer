import type { SlideState } from "@/types/SlideState";
import { create } from "zustand";

// スライド一覧に対する「操作の当て方」を保持する store。
//
// 現状の中身は一括切替モードだけ。docs/bulk-toggle-mode-plan.md を参照。
//
// 位置づけ: **一覧モードのサブ状態**であって、モードの軸 (docs/mode-spec.md §1 の
// 軸 A 起動モード / 軸 B 画面モード / 軸 C 書込権限) を増やすものではない。
// 編集モードでは使わない。
//
// 文書データではなく UI 状態なので、history には乗せない (slideStore にも置かない)。
//
// before について:
//   一括切替モードは「モード中の変更をまとめて履歴 1 件にする」。そのため突入時の
//   SlideState を store が預かる。複数のコンポーネントがこのモードを読むので、
//   snapshot をコンポーネント側の ref に置くと持ち主が増えて食い違う。単一の持ち場を
//   ここに固定する。

interface ListToolState {
	/** 一括切替モード中か。 */
	bulkToggleActive: boolean;
	/** 一括切替モード突入時の SlideState (退出時に履歴 1 件へまとめるための基準)。 */
	bulkToggleBefore: SlideState | null;
	/** 突入。突入時点の SlideState を預ける。 */
	beginBulkToggle: (before: SlideState) => void;
	/**
	 * 退出。預かっていた突入時 SlideState を返して自身はクリアする。
	 * 呼び出し側はこれを recordHistory に渡す (変化が無ければ recordHistory 側が握り潰す)。
	 * モード中でなければ null。
	 */
	endBulkToggle: () => SlideState | null;
}

export const useListToolStore = create<ListToolState>()((set, get) => ({
	bulkToggleActive: false,
	bulkToggleBefore: null,

	beginBulkToggle: (before) => set({ bulkToggleActive: true, bulkToggleBefore: before }),

	endBulkToggle: () => {
		const before = get().bulkToggleBefore;
		set({ bulkToggleActive: false, bulkToggleBefore: null });
		return before;
	},
}));

/** 一括切替モード中か (React 用 selector hook)。UI の出し分け・操作の抑止に使う。 */
export const useIsBulkToggleMode = (): boolean => useListToolStore((s) => s.bulkToggleActive);
