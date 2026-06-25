import { create } from "zustand";

// ドキュメント設定モーダルの開閉 + モード (v4 Group D 補間)。
// 新規作成 (new) と既存 meta 編集 (edit) で同一 UI (DocumentSettingsModal) を使い回すため、
// トリガ (FileIOPanel の「新規」/ NewSidePanel の「⚙ 設定」) とモーダルを疎結合にする store。
//   - new:  既定値 (date string title / 画面サイズ / 白背景) で開き、OK で新規 document を作成
//   - edit: 現在の meta で開き、保存で patchMeta 反映
//   - null: 非表示

export const DocSettingsMode = {
	NEW: "new",
	EDIT: "edit",
} as const;
export type DocSettingsMode = (typeof DocSettingsMode)[keyof typeof DocSettingsMode];

interface DocSettingsState {
	mode: DocSettingsMode | null;
	openNew: () => void;
	openEdit: () => void;
	close: () => void;
}

export const useDocSettingsStore = create<DocSettingsState>()((set) => ({
	mode: null,
	openNew: () => set({ mode: DocSettingsMode.NEW }),
	openEdit: () => set({ mode: DocSettingsMode.EDIT }),
	close: () => set({ mode: null }),
}));
