// アプリロックのパスコード検証子。docs/app-lock-spec.md 準拠。
//
// 方式: 既知の sentinel 平文をパスコード由来の鍵で AES-GCM 暗号化し、その暗号文を保存する。
// 検証 = 復号が成功するか。平文パスコードは保存しない。
// これは docs/sensitive-mode-spec.md §3 の「検証用ハッシュ (hashHint) を持たず、AES-GCM の
// 認証タグに検証を委ねる」方針と同一構造で、高速ハッシュのオラクルを作らない。
//
// 正直な評価: この検証子のオフライン総当たり耐性は、この機能では実質的に無意味。
// localStorage を読める攻撃者は同一オリジンの IndexedDB (平文文書) も読めるので、
// パスコードを割る動機がそもそも無い。それでも PBKDF2 + AES-GCM を採るのは、
// セキュリティ強度のためではなく (a) リポジトリに「弱い検証子」の前例を作らないため、
// (b) 既存 sensitiveCrypto の再利用コストが実質ゼロだから。
//
// encryptImageData を直接使わない理由: 検証子は永続化されて長期間残る唯一のレコードである
// 一方、文書ペイロードは保存のたびに再生成される。将来 imageData 側に圧縮や chunk 分割が
// 入るとロックが静かに壊れ、ユーザーが自分の端末から締め出される。用途の異なるものを
// 同じ関数にぶら下げない。

import type { EncryptedPayload } from "./sensitiveCrypto";
import { encryptJson, verifyPassword } from "./sensitiveCrypto";

/** パスコードの最小桁数。 */
export const PASSCODE_MIN_LENGTH = 4;
/** パスコードの最大桁数 (入力ミスの歯止め。強度上の意味はない)。 */
export const PASSCODE_MAX_LENGTH = 32;

/**
 * 検証子の中身。値そのものに意味はなく、「復号できたか」だけを見る。
 * 内容を変更すると既存の検証子と互換が無くなる (= 全ユーザーが締め出される) ので変えない。
 */
const LOCK_SENTINEL = { magic: "viewer-app-lock", v: 1 } as const;

/**
 * パスコードの形式チェック (pure)。ASCII 数字のみを受け付ける。
 *
 * 正規化 (NFKC 等) は意図的に行わない。後から正規化を足すと、既に保存されている検証子と
 * 一致しなくなり全ユーザーが解錠できなくなるため。入力側で全角を弾く。
 */
export function isValidPasscodeFormat(passcode: string): boolean {
	if (passcode.length < PASSCODE_MIN_LENGTH || passcode.length > PASSCODE_MAX_LENGTH) return false;
	return /^[0-9]+$/.test(passcode);
}

/** パスコード検証子を生成する (salt/iv は毎回ランダム)。 */
export async function createPasscodeVerifier(passcode: string): Promise<EncryptedPayload> {
	return encryptJson(LOCK_SENTINEL, passcode);
}

/** パスコードを照合する。誤りでも throw せず false を返す。 */
export async function verifyPasscode(
	verifier: EncryptedPayload,
	passcode: string
): Promise<boolean> {
	return verifyPassword(verifier, passcode);
}
