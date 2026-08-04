// アプリロックの生体認証 (WebAuthn platform authenticator)。docs/app-lock-spec.md 準拠。
//
// 目的は Face ID / Touch ID / 端末パスコードの「OS プロンプトを出すこと」であって、
// 暗号学的な認証ではない。サーバが存在しない (GitHub Pages の静的配信) ため:
//   - challenge の鮮度を誰も検証しない → リプレイという概念が成立しない
//   - 署名を誰も検証しない → get() の戻り値を偽造されても検知できない
//   - そもそも DevTools を開ける攻撃者は appLockStore の status を書き換えれば済む
//
// それでもこの設計を採る根拠: 脅威モデルが「ロック解除済みの端末を他人が手に取る」に
// 限定されており、その攻撃者は OS の Face ID プロンプトを突破できない。ここで WebAuthn が
// 提供しているのは暗号ではなく OS レベルの UI ゲートであり、Web には他にこれを呼び出す
// 手段が存在しない。守る対象 (IndexedDB の平文文書) に暗号的保護が無い以上、認証側だけ
// 本気で検証しても保護強度は上がらない。types/AppLock.ts の位置づけと一貫している。
//
// この層は throw しない。すべて Result 型 ({status:"ok",...} | {status:"failed", reason}) で返す。

import type { LockFailure } from "@/types/AppLock";
import { LockFailure as Failure } from "@/types/AppLock";
import { base64ToBytes, bytesToBase64 } from "./sensitiveCrypto";

/** WebAuthn 要求のタイムアウト (ms)。ブラウザ側のヒントで、厳密には守られない。 */
const WEBAUTHN_TIMEOUT_MS = 60_000;
/** user.id のバイト長 (WebAuthn 仕様の推奨: 64 byte 以下のランダム値)。 */
const USER_HANDLE_BYTES = 16;
/** challenge のバイト長。検証しないが、仕様上 16 byte 以上が要求される。 */
const CHALLENGE_BYTES = 32;
/** authenticatorData のフラグバイト位置と UV (User Verified) ビット。 */
const AUTH_DATA_FLAGS_INDEX = 32;
const AUTH_DATA_UV_BIT = 0x04;

// 同時に 1 リクエストしか投げられない。未解決の create/get がある状態で 2 回目を呼ぶと
// InvalidStateError / NotAllowedError になるため、呼び出し側の連打を吸収する。
let inFlight = false;

/**
 * WebAuthn が使えるか (同期。副作用もプロンプトも無い)。
 *
 * isSecureContext を見るのが重要: LAN IP + http でスマホから開いた場合 (npm run dev を
 * --host で公開したケース) は WebAuthn も crypto.subtle も使えない。
 */
export function isWebAuthnSupported(): boolean {
	return (
		typeof window !== "undefined" &&
		window.isSecureContext === true &&
		typeof window.PublicKeyCredential !== "undefined" &&
		typeof navigator !== "undefined" &&
		typeof navigator.credentials?.create === "function" &&
		typeof navigator.credentials?.get === "function"
	);
}

/**
 * 端末に platform authenticator (Face ID / Touch ID / 指紋) があるか。
 *
 * false になる主な条件: ハードウェアが無い / 生体もデバイスパスコードも未設定 /
 * MDM やブラウザ設定で無効 / 一部のプライベートブラウズ・埋め込み WebView。
 *
 * 限界: true でも create() は失敗しうる (capability hint であって保証ではない)。
 * また「自分の credential が既に在るか」は分からない (それは credentialId で判定する)。
 */
export async function isPlatformAuthenticatorAvailable(): Promise<boolean> {
	if (!isWebAuthnSupported()) return false;
	try {
		const check = window.PublicKeyCredential?.isUserVerifyingPlatformAuthenticatorAvailable;
		if (typeof check !== "function") return false;
		return await check.call(window.PublicKeyCredential);
	} catch {
		// 古い WebView では throw することがある。
		return false;
	}
}

/** 16 byte のランダムな user handle を base64 で生成する (登録前に 1 回だけ作り、以後使い回す)。 */
export function createUserHandle(): string {
	return bytesToBase64(crypto.getRandomValues(new Uint8Array(USER_HANDLE_BYTES)));
}

function randomChallenge(): Uint8Array {
	return crypto.getRandomValues(new Uint8Array(CHALLENGE_BYTES));
}

// DOMException 名を LockFailure へ。キャンセル / タイムアウト / 失敗はすべて NotAllowedError で
// 返り区別できないため、UI 側は「解錠できませんでした」という中立な出し方にする。
function mapError(e: unknown): LockFailure {
	const name = e && typeof e === "object" && "name" in e ? String((e as { name: unknown }).name) : "";
	if (name === "InvalidStateError") return Failure.WEBAUTHN_ALREADY_REGISTERED;
	if (name === "NotSupportedError" || name === "SecurityError") {
		return Failure.WEBAUTHN_UNSUPPORTED;
	}
	return Failure.WEBAUTHN_CANCELLED;
}

// credential かどうかは instanceof PublicKeyCredential では見ない (テストのモックが
// インスタンスにならないため)。duck typing で rawId の有無を見る。
function rawIdOf(credential: unknown): ArrayBuffer | null {
	if (!credential || typeof credential !== "object") return null;
	const raw = (credential as { rawId?: unknown }).rawId;
	return raw instanceof ArrayBuffer ? raw : null;
}

// 判別子は文字列 (useStorage.ts の LoadResult と同形)。tsconfig が strict:false のため
// boolean 判別子 ({ok:true}|{ok:false}) ではナローイングが効かない。
export type RegisterResult =
	| { status: "ok"; credentialId: string }
	| { status: "failed"; reason: LockFailure };

/**
 * この端末に生体認証の credential を登録する。
 *
 * rp.id は指定しない: 現オリジンの有効ドメインが自動的に使われる。ハードコードすると
 * localhost 開発時に SecurityError で必ず落ちる。なお GitHub Pages 配信では RP ID が
 * harogen-net.github.io になり同一アカウントの他プロジェクトとスコープを共有するが、
 * それらは同一オリジンなので元から IndexedDB を読めており、攻撃面は増えない。
 *
 * residentKey: "discouraged" — credential ID は自前で保存するので discoverable である
 * 必要がない。discoverable にするとパスキー一覧に常駐し UI が増えるだけ。
 */
export async function registerLockCredential(args: {
	userHandle: string;
	existingCredentialId: string | null;
	signal?: AbortSignal;
}): Promise<RegisterResult> {
	if (!isWebAuthnSupported()) return { status: "failed", reason: Failure.WEBAUTHN_UNSUPPORTED };
	if (inFlight) return { status: "failed", reason: Failure.IN_FLIGHT };
	inFlight = true;
	try {
		const credential = await navigator.credentials.create({
			signal: args.signal,
			publicKey: {
				challenge: randomChallenge(),
				rp: { name: "Viewer" },
				user: {
					id: base64ToBytes(args.userHandle),
					// PII を入れない (user.id / name はプロンプトや OS の設定画面に出る)。
					name: "viewer-local",
					displayName: "Viewer",
				},
				pubKeyCredParams: [
					{ type: "public-key", alg: -7 }, // ES256
					{ type: "public-key", alg: -257 }, // RS256
				],
				authenticatorSelection: {
					authenticatorAttachment: "platform",
					residentKey: "discouraged",
					requireResidentKey: false,
					userVerification: "required",
				},
				// 検証するサーバが無いので attestation を要求する意味がない。
				attestation: "none",
				timeout: WEBAUTHN_TIMEOUT_MS,
				// 1 インストール 1 credential を維持する (OS の設定画面に登録が増殖するのを防ぐ)。
				excludeCredentials: args.existingCredentialId
					? [
							{
								type: "public-key",
								id: base64ToBytes(args.existingCredentialId),
								transports: ["internal"],
							},
						]
					: [],
			},
		});
		const rawId = rawIdOf(credential);
		if (!rawId) return { status: "failed", reason: Failure.WEBAUTHN_CANCELLED };
		// 保存するのは rawId だけ。公開鍵は検証しないので保存しない。
		return { status: "ok", credentialId: bytesToBase64(new Uint8Array(rawId)) };
	} catch (e) {
		return { status: "failed", reason: mapError(e) };
	} finally {
		inFlight = false;
	}
}

export type AssertResult =
	| { status: "ok"; userVerified: boolean }
	| { status: "failed"; reason: LockFailure };

/**
 * 登録済み credential で解錠を試みる (Face ID / 端末パスコードのプロンプトが出る)。
 *
 * 注意: 呼び出しはユーザー操作 (ボタンの onClick) 起点でなければならない。Safari は
 * credentials.get() に transient user activation を要求するため、マウント時の useEffect
 * からの自動呼び出しは失敗する。
 *
 * 署名は検証も保存もしない (§冒頭)。userVerified は authenticatorData の UV ビットだが、
 * これはクライアント側の値なのでセキュリティ検証ではない。プラットフォームが
 * userVerification:"required" を黙って downgrade していないかの挙動アサーションとして返す。
 */
export async function assertLockCredential(args: {
	credentialId: string;
	signal?: AbortSignal;
}): Promise<AssertResult> {
	if (!isWebAuthnSupported()) return { status: "failed", reason: Failure.WEBAUTHN_UNSUPPORTED };
	if (inFlight) return { status: "failed", reason: Failure.IN_FLIGHT };
	inFlight = true;
	try {
		const expectedId = base64ToBytes(args.credentialId);
		const credential = await navigator.credentials.get({
			signal: args.signal,
			publicKey: {
				challenge: randomChallenge(),
				allowCredentials: [{ type: "public-key", id: expectedId, transports: ["internal"] }],
				userVerification: "required",
				timeout: WEBAUTHN_TIMEOUT_MS,
			},
		});
		const rawId = rawIdOf(credential);
		if (!rawId) return { status: "failed", reason: Failure.WEBAUTHN_CANCELLED };
		// 返ってきた credential が「登録したもの」であることを確認する。
		if (bytesToBase64(new Uint8Array(rawId)) !== args.credentialId) {
			return { status: "failed", reason: Failure.WEBAUTHN_NO_CREDENTIAL };
		}
		return { status: "ok", userVerified: readUserVerified(credential) };
	} catch (e) {
		return { status: "failed", reason: mapError(e) };
	} finally {
		inFlight = false;
	}
}

// authenticatorData の 33 byte 目 (index 32) のフラグから UV ビットを読む。
// 読めない形なら false を返す (assertion 自体は成功扱いのまま)。
function readUserVerified(credential: unknown): boolean {
	const response = (credential as { response?: { authenticatorData?: unknown } }).response;
	const authData = response?.authenticatorData;
	if (!(authData instanceof ArrayBuffer)) return false;
	const bytes = new Uint8Array(authData);
	if (bytes.length <= AUTH_DATA_FLAGS_INDEX) return false;
	return (bytes[AUTH_DATA_FLAGS_INDEX] & AUTH_DATA_UV_BIT) !== 0;
}
