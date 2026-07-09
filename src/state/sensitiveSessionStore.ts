import { create } from "zustand";

// センシティブ文書の解錠パスワードをセッション中だけメモリ保持する store (Phase 3)。
// 永続化しない (リロードで消える = 再入力)。1 アプリ 1 パスワード方針 (docs/sensitive-mode-spec §1.5)。
// alertStore と同じく「pending request を積み、Host component が描画して resolve する」形。

/** パスワード入力の目的。モーダル文言の出し分けに使う。 */
export type SensitivePurpose = "encrypt" | "unlock";

export interface UnlockRequest {
	/** 保存/出力時=encrypt(パスワード設定) / 読込時=unlock(解錠)。文言切替に使う。 */
	purpose: SensitivePurpose;
	/** 直前の失敗理由 (再入力時のエラー表示用、任意)。 */
	error?: string;
	/** モーダルの応答。入力パスワード / キャンセル時は null。 */
	resolve: (password: string | null) => void;
}

interface SensitiveSessionState {
	/** セッション共通パスワード (メモリのみ、未設定は null)。 */
	password: string | null;
	/** 解錠モーダルの pending リクエスト (なければ null)。 */
	request: UnlockRequest | null;
	setPassword: (password: string) => void;
	clearPassword: () => void;
	setRequest: (request: UnlockRequest) => void;
	clearRequest: () => void;
}

export const useSensitiveSessionStore = create<SensitiveSessionState>()((set) => ({
	password: null,
	request: null,
	setPassword: (password) => set({ password }),
	clearPassword: () => set({ password: null }),
	setRequest: (request) => set({ request }),
	clearRequest: () => set({ request: null }),
}));
