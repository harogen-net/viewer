import { useSensitiveSessionStore } from "@/state/sensitiveSessionStore";
import { useMemo } from "react";

// センシティブ文書の解錠パスワード取得 hook (Phase 3)。useAlert と同じ「getState + Promise」流儀。
// ensurePassword: キャッシュ済みなら即返す = 初回 1 回だけ入力を求める (§sensitive-mode-spec 1.5)。
// 実際の「復号して正誤を判定」は Phase 4 の呼び出し側 (誤りなら clear して再度 prompt)。

export interface UseSensitivePassword {
	/** キャッシュ済みPWを返す。無ければ解錠モーダルを出し入力を待つ。キャンセルは null。 */
	ensurePassword: (opts?: { error?: string }) => Promise<string | null>;
	/** モーダルを必ず出して入力を促す (再入力/変更用)。入力成功時はキャッシュを更新。 */
	prompt: (opts?: { error?: string }) => Promise<string | null>;
	/** 現在のセッションPW (未設定は null)。 */
	getPassword: () => string | null;
	/** PWキャッシュを破棄 (誤PW検出時など)。 */
	clear: () => void;
}

export const useSensitivePassword = (): UseSensitivePassword =>
	useMemo(() => {
		const store = useSensitiveSessionStore.getState;
		const prompt = (opts?: { error?: string }): Promise<string | null> =>
			new Promise((res) => {
				store().setRequest({
					error: opts?.error,
					resolve: (pw) => {
						if (pw !== null) store().setPassword(pw); // 入力成功のみキャッシュ
						res(pw);
					},
				});
			});
		return {
			prompt,
			getPassword: () => store().password,
			clear: () => store().clearPassword(),
			ensurePassword: (opts) => {
				const cached = store().password;
				return cached !== null ? Promise.resolve(cached) : prompt(opts);
			},
		};
	}, []);
