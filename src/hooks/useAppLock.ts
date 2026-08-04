import { useStorage } from "@/hooks/useStorage";
import { APP_LOCK_RECORD_VERSION, useAppLockStore } from "@/state/appLockStore";
import type { AppLockRecord } from "@/types/AppLock";
import { LockFailure } from "@/types/AppLock";
import { createPasscodeVerifier, verifyPasscode } from "@/utils/appLockPasscode";
import {
	assertLockCredential,
	createUserHandle,
	registerLockCredential,
} from "@/utils/webauthnLock";
import { useMemo } from "react";

// アプリロックのオーケストレーション。store (状態) と utils (暗号 / WebAuthn) を繋ぐ。
// UI はこの hook だけを呼び、store の内部構造や WebAuthn の作法を知らなくてよい。
//
// 抜け道を作らない設計 (docs/app-lock-spec.md):
//   - disableLock / changePasscode / unregisterBiometrics は必ず現在のパスコードを要求する
//   - パスコードを忘れた場合の回復手段は eraseAllAndDisable (全消去) のみ
//   - 「ロックだけ解除する」経路は存在しない。それを作ると唯一の本物のバイパスになる
//
// 全消去がバイパスにならない理由: 攻撃者はデータを見たいのであって、消しても何も得られない。
// 逆に「N 回失敗で自動消去」にはしない (端末を一時的に手にした他人による DoS になる)。

export interface UseAppLock {
	/**
	 * 生体認証で解錠する。
	 *
	 * silent=true は「ロック画面表示時の自動呼び出し」用。失敗しても理由を記録しない
	 * (ユーザー操作なしでの拒否は日常的に起きるので、起動直後にエラー文を出さない)。
	 * どちらの場合も failureCount は増やさない (パスコードのクールダウンを汚染しない)。
	 */
	unlockWithBiometrics: (opts?: { silent?: boolean }) => Promise<boolean>;
	/** パスコードで解錠する。 */
	unlockWithPasscode: (passcode: string) => Promise<boolean>;
	/** opt-in 有効化。検証子を作って永続化する。 */
	enableLock: (passcode: string) => Promise<boolean>;
	/** 生体認証を登録する (有効化後の任意ステップ)。 */
	registerBiometrics: () => Promise<boolean>;
	/** 生体認証の登録を解除する (パスコード必須)。 */
	unregisterBiometrics: (passcode: string) => Promise<boolean>;
	/** パスコードを変更する (現行パスコード必須)。 */
	changePasscode: (current: string, next: string) => Promise<boolean>;
	/** ロック機能を無効化する (現行パスコード必須)。 */
	disableLock: (passcode: string) => Promise<boolean>;
	/**
	 * 現行パスコードの正誤だけを返す (状態は変えない)。
	 *
	 * 設定のステップ形式で「現行パスコード → 新しいパスコード」と進む際、先に正誤を確かめる
	 * ためのもの。これが無いと、新しいパスコードを 2 回入力させた最後に「現行が違う」と
     * 突き返すことになる。
	 *
	 * 解錠の代わりには使えない (status を変えない)。またこの API に到達できるのは設定モーダル
	 * = 解錠済み or ロック未設定の状態だけなので、ロック画面のスロットリングを迂回する経路には
	 * ならない。
	 */
	verifyCurrentPasscode: (passcode: string) => Promise<boolean>;
	/** 全ドキュメントを消去してロックを解除する。取り消し不可。 */
	eraseAllAndDisable: () => Promise<void>;
	/**
	 * TEMP (要 revert): 正しいはずのパスコードで解錠できない事象を切り分けるための一時的な
	 * 脱出口。パスコードを検証せず認証情報 (verifier/credentialId/failureCount 等) だけを
	 * クリアしてロックを無効化する。ドキュメントは一切消さない。
	 *
	 * 上の "抜け道を作らない設計" (ファイル冒頭のコメント) に意図的に反する — 「ロックだけ解除
	 * する経路は存在しない。それを作ると唯一の本物のバイパスになる」という原則そのものを
	 * ユーザーの明示的な指示で一時的に破っている。原因が判明したら、この関数と
	 * AppLockScreen.tsx 側の呼び出し箇所を削除し、コメントアウトしてある元の
	 * eraseAllAndDisable 経路に戻すこと。
	 */
	clearAuthOnly_TEMP: () => void;
	/** 手動で即ロック。 */
	lockNow: () => void;
}

export const useAppLock = (): UseAppLock => {
	const { eraseAllDocuments } = useStorage();
	return useMemo<UseAppLock>(() => {
		const store = () => useAppLockStore.getState();

		// クールダウン中は照合そのものを行わない (PBKDF2 を回させない)。
		//
		// 判定は lockoutUntil (メモリ上の明け時刻)。failureCount からその場で算出してはいけない:
		// failureCount は永続化されているため、3 回失敗した時点で常に待機中と判定され、
		// 「照合しない → 解錠できない → failureCount がリセットされない」で恒久ロックアウトになる。
		//
		// 回数は増やさない (noteSoftFailure): ここで増やすと「待たされている間の再試行」が
		// そのままクールダウンを延ばし、待ち時間が指数的に膨らんでいく。
		const throttled = (): boolean => {
			const s = store();
			if (performance.now() >= s.lockoutUntil) return false;
			s.noteSoftFailure(LockFailure.THROTTLED);
			return true;
		};

		const withBusy = async <T>(fn: () => Promise<T>): Promise<T> => {
			store().setBusy(true);
			try {
				return await fn();
			} finally {
				store().setBusy(false);
			}
		};

		// パスコード照合。呼び出し側の「現行パスコード必須」操作でも使い回す。
		const checkPasscode = async (passcode: string): Promise<boolean> => {
			const record = store().record;
			if (!record) return false;
			return verifyPasscode(record.verifier, passcode);
		};

		return {
			unlockWithBiometrics: async (opts) =>
				withBusy(async () => {
					// 生体認証の失敗は noteSoftFailure (回数を増やさない)。キャンセルや顔の認識漏れは
					// 日常的に起き、これを failureCount に混ぜるとパスコード側が誤ってクールダウンする。
					const fail = (reason: LockFailure): false => {
						if (!opts?.silent) store().noteSoftFailure(reason);
						return false;
					};
					const credentialId = store().record?.credentialId ?? null;
					if (!credentialId) return fail(LockFailure.WEBAUTHN_NO_CREDENTIAL);
					const result = await assertLockCredential({ credentialId });
					if (result.status === "failed") return fail(result.reason);
					store().unlock();
					return true;
				}),

			unlockWithPasscode: async (passcode) =>
				withBusy(async () => {
					if (throttled()) return false;
					if (!(await checkPasscode(passcode))) {
						store().noteFailure(LockFailure.WRONG_PASSCODE);
						return false;
					}
					// 桁数を持たない旧レコードを、正解が判明したこの瞬間に補完する。
					// これをしないと、既に有効化済みの端末では桁数到達での自動照合が永久に働かない。
					const record = store().record;
					if (record && record.passcodeLength !== passcode.length) {
						store().updateRecord({ ...record, passcodeLength: passcode.length });
					}
					store().unlock();
					return true;
				}),

			enableLock: async (passcode) =>
				withBusy(async () => {
					const verifier = await createPasscodeVerifier(passcode);
					const record: AppLockRecord = {
						version: APP_LOCK_RECORD_VERSION,
						verifier,
						userHandle: createUserHandle(),
						credentialId: null,
						failureCount: 0,
						// 桁数を保存しておく (桁数到達での自動照合に使う)。
						passcodeLength: passcode.length,
					};
					if (!store().enable(record)) {
						// ストレージが使えないことはパスコードの誤入力ではない。noteFailure ではなく
						// noteSoftFailure (パスコードの連続失敗カウントを汚染しない)。
						store().noteSoftFailure(LockFailure.STORAGE_UNAVAILABLE);
						return false;
					}
					return true;
				}),

			registerBiometrics: async () =>
				withBusy(async () => {
					const record = store().record;
					if (!record) return false;
					const result = await registerLockCredential({
						userHandle: record.userHandle,
						existingCredentialId: record.credentialId,
					});
					if (result.status === "failed") {
						// noteFailure (パスコード用) ではなく noteSoftFailure。WebAuthn 登録の
						// キャンセル/失敗は「間違ったパスコードを入力した」ことにはならない。
						// noteFailure を使うと、生体認証の登録を何度かキャンセルしただけで
						// パスコードの連続失敗カウントが永続レコードに書き込まれてしまい、
						// 正しいパスコードを入力しても THROTTLED で待たされる
						// (unlockWithBiometrics の失敗を noteSoftFailure にしているのと同じ理由)。
						store().noteSoftFailure(result.reason);
						return false;
					}
					return store().updateRecord({ ...record, credentialId: result.credentialId });
				}),

			unregisterBiometrics: async (passcode) =>
				withBusy(async () => {
					const record = store().record;
					if (!record) return false;
					if (throttled()) return false;
					if (!(await checkPasscode(passcode))) {
						store().noteFailure(LockFailure.WRONG_PASSCODE);
						return false;
					}
					// OS 側の登録はアプリから消せない (WebAuthn に削除 API が無い)。
					// ここで消えるのはアプリが持つ credentialId の参照だけ。
					return store().updateRecord({ ...record, credentialId: null });
				}),

			changePasscode: async (current, next) =>
				withBusy(async () => {
					const record = store().record;
					if (!record) return false;
					if (throttled()) return false;
					if (!(await checkPasscode(current))) {
						store().noteFailure(LockFailure.WRONG_PASSCODE);
						return false;
					}
					const verifier = await createPasscodeVerifier(next);
					return store().updateRecord({
						...record,
						verifier,
						failureCount: 0,
						passcodeLength: next.length,
					});
				}),

			disableLock: async (passcode) =>
				withBusy(async () => {
					if (!store().record) return false;
					if (throttled()) return false;
					if (!(await checkPasscode(passcode))) {
						store().noteFailure(LockFailure.WRONG_PASSCODE);
						return false;
					}
					store().disable();
					return true;
				}),

			// verifyCurrentPasscode は「照合するだけ」の関数だが、失敗を記録しないと設定モーダルの
			// 「パスコードを変更」フローだけがクールダウン無しの総当たりを許すオラクルになってしまう
			// (disableLock / unregisterBiometrics / unlockWithPasscode はすべて noteFailure +
			// throttled でカウントしている)。解錠済みの端末を一時的に借りた第三者が「パスコードを
			// 変更」から総当たりし、成功したら新しいパスコードに差し替えて正規の持ち主を締め出す、
			// という経路を塞ぐため、他の照合経路と同じ扱いにする。
			verifyCurrentPasscode: async (passcode) =>
				withBusy(async () => {
					if (throttled()) return false;
					const ok = await checkPasscode(passcode);
					if (!ok) store().noteFailure(LockFailure.WRONG_PASSCODE);
					return ok;
				}),

			eraseAllAndDisable: async () => {
				await eraseAllDocuments();
				store().disable();
			},

			// TEMP (要 revert): パスコード無検証でロックを無効化する。ドキュメントには触れない。
			clearAuthOnly_TEMP: () => {
				store().disable();
			},

			lockNow: () => store().lock(),
		};
	}, [eraseAllDocuments]);
};
