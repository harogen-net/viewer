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
	/**
	 * 解錠ループ: PW を取得 (キャッシュ or モーダル) → tryDecrypt を試す。失敗なら PW を破棄して
	 * エラー付きで再入力を促す。成功で復号結果を返し、キャンセルで null。crypto 非依存 (tryDecrypt 注入)。
	 */
	unlock: <T>(tryDecrypt: (password: string) => Promise<T>) => Promise<T | null>;
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
		const ensurePassword = (opts?: { error?: string }): Promise<string | null> => {
			const cached = store().password;
			return cached !== null ? Promise.resolve(cached) : prompt(opts);
		};
		return {
			prompt,
			ensurePassword,
			getPassword: () => store().password,
			clear: () => store().clearPassword(),
			unlock: async <T>(tryDecrypt: (password: string) => Promise<T>): Promise<T | null> => {
				let error: string | undefined;
				for (;;) {
					const pw = await ensurePassword({ error });
					if (pw === null) return null; // キャンセル
					try {
						return await tryDecrypt(pw);
					} catch {
						store().clearPassword(); // キャッシュ PW が誤り → 破棄して再入力
						error = "パスワードが正しくありません。再入力してください。";
					}
				}
			},
		};
	}, []);
