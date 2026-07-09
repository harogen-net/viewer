import { create } from "zustand";

// センシティブ文書の暗号・復号に使うパスワードをセッション中だけメモリ保持する store。
// 永続化しない (リロードで消える)。DocumentPickerModal 下部の入力ボックスが編集し、
// 保存(暗号化)・読込(復号) 時にこの値を読む。box 自身はアクションを起こさない受動的保持で、
// 編集するまで残り続ける。1 アプリ 1 パスワード方針 (docs/sensitive-mode-spec §1.5)。

interface SensitiveSessionState {
	/** セッション共通パスワード (メモリのみ、未入力は null。空文字は null に正規化)。 */
	password: string | null;
	setPassword: (password: string | null) => void;
}

export const useSensitiveSessionStore = create<SensitiveSessionState>()((set) => ({
	password: null,
	setPassword: (password) => set({ password: password && password.length > 0 ? password : null }),
}));
