import { useAlert } from "@/hooks/useAlert";
import { useSensitiveSessionStore } from "@/state/sensitiveSessionStore";
import { useMemo } from "react";

// パスワードは DocumentPickerModal 下部の入力ボックスが保持する (sensitiveSessionStore)。
// この hook は「暗号・復号アクション時に box 値を読み、未入力/失敗を警告する」補助。
// box 自身は復号を起こさない (受動的)。復号失敗しても自動 clear せず、ユーザーが box を直す方針。

const EMPTY_MSG =
	"パスワードが未入力です。ドキュメントピッカー下部のパスワード欄に入力してください。";
const FAIL_MSG =
	"パスワードが正しくないか、データが破損しています。パスワード欄を確認して開き直してください。";

export interface UseSensitivePassword {
	/** box の現在値 (未入力は null)。 */
	getPassword: () => string | null;
	/** 暗号化用: box 値を返す。未入力なら警告モーダルを出して null (=中止)。 */
	requirePassword: () => string | null;
	/**
	 * 復号用: box 値で tryDecrypt を 1 回試す。未入力/失敗は警告モーダルを出して null を返す
	 * (自動 clear・自動再入力はしない)。crypto 非依存 (tryDecrypt 注入)。
	 */
	unlock: <T>(tryDecrypt: (password: string) => Promise<T>) => Promise<T | null>;
}

export const useSensitivePassword = (): UseSensitivePassword => {
	const alert = useAlert();
	return useMemo(() => {
		const getPassword = () => useSensitiveSessionStore.getState().password;
		return {
			getPassword,
			requirePassword: () => {
				const pw = getPassword();
				if (!pw) {
					void alert.alert(EMPTY_MSG, { title: "パスワード未入力" });
					return null;
				}
				return pw;
			},
			unlock: async <T>(tryDecrypt: (password: string) => Promise<T>): Promise<T | null> => {
				const pw = getPassword();
				if (!pw) {
					void alert.alert(EMPTY_MSG, { title: "パスワード未入力" });
					return null;
				}
				try {
					return await tryDecrypt(pw);
				} catch {
					void alert.alert(FAIL_MSG, { title: "復号できませんでした" });
					return null;
				}
			},
		};
	}, [alert]);
};
