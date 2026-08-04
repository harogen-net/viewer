// アプリロック (スマホ限定の起動ゲート) の型カタログ。docs/app-lock-spec.md 準拠。
//
// 位置づけ (重要): 本機能は「表示レイヤーのゲート」であり暗号学的な保護ではない。
// 非センシティブ文書とサムネイルは IndexedDB に平文で保存されている (utils/storageCodec.ts)
// ため、Web Inspector を繋げる相手や IndexedDB を直接読む相手には無力。守るのは
// 「ロック解除済みの端末を他人が手に取り、アプリを開いて中身を見る」ケースだけ。
// この前提ゆえに WebAuthn PRF による鍵ラップは採らない (守る対象が平文である以上、
// 鍵ラップをしても保護強度が上がらず複雑さだけが増える)。

import type { EncryptedPayload } from "@/utils/sensitiveCrypto";

/**
 * ロックの状態。「無効 (未設定 / PC 環境)」も状態として持つ。
 * null にせず 3 値にすることで、ゲート側の分岐が status 1 本で済む。
 */
export const AppLockStatus = {
	/** 未設定、または PC 環境。ゲートしない。 */
	DISABLED: "disabled",
	/** 認証待ち。アプリ本体 (AppMain) を一切描画しない。 */
	LOCKED: "locked",
	/** 認証済み。通常表示。 */
	UNLOCKED: "unlocked",
} as const;
export type AppLockStatus = (typeof AppLockStatus)[keyof typeof AppLockStatus];

/** 解錠 / 登録の失敗理由。UI のメッセージ出し分けに使う。 */
export const LockFailure = {
	/** パスコードが違う。 */
	WRONG_PASSCODE: "wrongPasscode",
	/** 連続失敗のクールダウン中。 */
	THROTTLED: "throttled",
	/** WebAuthn 非対応環境 (secure context 外、in-app browser など)。 */
	WEBAUTHN_UNSUPPORTED: "webauthnUnsupported",
	/** 生体認証の credential が未登録。 */
	WEBAUTHN_NO_CREDENTIAL: "webauthnNoCredential",
	/** ユーザーがキャンセル、またはタイムアウト (WebAuthn は両者を区別できない)。 */
	WEBAUTHN_CANCELLED: "webauthnCancelled",
	/** この端末に既に登録済み (excludeCredentials に引っかかった)。 */
	WEBAUTHN_ALREADY_REGISTERED: "webauthnAlreadyRegistered",
	/** 前回の WebAuthn 要求が未解決 (同時に 1 リクエストしか投げられない)。 */
	IN_FLIGHT: "inFlight",
	/** localStorage が使えず設定を保存できない。 */
	STORAGE_UNAVAILABLE: "storageUnavailable",
} as const;
export type LockFailure = (typeof LockFailure)[keyof typeof LockFailure];

/**
 * localStorage に単一キーで保存するロック設定の全体。
 *
 * 「解錠済み」を意味するフィールドは決して持たせない。解錠状態はメモリのみで保持し、
 * リロード / SW の autoUpdate による再読み込みで必ずロックに戻ることを保証する
 * (state/sensitiveSessionStore.ts の「セッションパスワードを永続化しない」と同方針)。
 */
export interface AppLockRecord {
	/** このレコード形式のバージョン (SecurityMeta.version とは独立)。 */
	version: number;
	/** パスコード検証子 (既知 sentinel の暗号文)。これの存在 = ロック有効。 */
	verifier: EncryptedPayload;
	/** WebAuthn user.id (base64、16 byte random)。credential の再登録で使い回す。 */
	userHandle: string;
	/** WebAuthn credential の rawId (base64)。生体未登録なら null。 */
	credentialId: string | null;
	/** 連続失敗回数。解錠成功で 0 に戻る。 */
	failureCount: number;
	/**
	 * パスコードの桁数。「入力が桁数に達したら自動で照合する」ために必要
	 * (検証子だけでは桁数が分からず、下限で照合すると長いパスコードが必ず失敗する)。
	 *
	 * 桁数を持たない古いレコードもあるため optional。その場合は自動照合せず送信ボタンを使い、
	 * 初回の解錠成功時に実際の桁数で補完する (useAppLock.unlockWithPasscode)。
	 *
	 * 秘匿性: 桁数が漏れると総当たりの範囲が狭まるが、このレコードを読める攻撃者は同一
	 * オリジンの IndexedDB (平文文書) も読めるため実害はない (§1 の脅威モデル)。
	 */
	passcodeLength?: number;
}
