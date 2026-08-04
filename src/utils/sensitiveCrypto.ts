// センシティブ文書の画像データ暗号化 (v1)。docs/sensitive-mode-spec.md 準拠。
//
// 方式: PBKDF2-HMAC-SHA-256 で鍵導出 → AES-256-GCM で imageData JSON を暗号化。
//   - パスワードはセッション共通 (1 アプリ 1 パスワード)、salt/iv は文書ごとに生成。
//   - 平文パスワードは保存しない。パスワード検証は AES-GCM の認証タグに委ねる
//     (復号成功=正しいPW)。高速ハッシュの検証値は総当たりの抜け道になるため持たない。
// Web Crypto (crypto.subtle) を使用。secure context (https/PWA) では常に利用可能。

/** HVD に保存する暗号メタ (docs/sensitive-mode-spec §3)。 */
export interface SecurityMeta {
	version: number;
	kdf: "PBKDF2";
	kdfIterations: number;
	salt: string; // base64
	cipher: "AES-GCM";
	iv: string; // base64
}

/** 暗号ペイロードの汎用形 (security メタ + 暗号文)。中身は JSON.stringify された任意の値。 */
export interface EncryptedPayload {
	security: SecurityMeta;
	ciphertext: string; // base64(AES-GCM(JSON.stringify(value)))
}

/**
 * 暗号化済み imageData ペイロード。中身は EncryptedPayload と同一 (別名)。
 * imageData 以外の用途 (アプリロックのパスコード検証子など) は EncryptedPayload を使う。
 */
export type EncryptedImageData = EncryptedPayload;

const SECURITY_VERSION = 1;
const KDF_ITERATIONS = 150_000;
// 復号時に受け入れる kdfIterations の下限。レコード側の値をそのまま使う (下記 deriveKey 参照)
// ため、細工したレコードで反復回数 1 に落とされる (= 総当たりが安くなる) のを防ぐガード。
const MIN_KDF_ITERATIONS = 100_000;
const enc = new TextEncoder();
const dec = new TextDecoder();

/** 大きな配列でも stack overflow しない base64 変換 (画像暗号文は数 MB になり得る)。 */
export function bytesToBase64(bytes: Uint8Array): string {
	let binary = "";
	const CHUNK = 0x8000;
	for (let i = 0; i < bytes.length; i += CHUNK) {
		binary += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
	}
	return btoa(binary);
}

/** base64 → バイト列 (bytesToBase64 の逆)。 */
export function base64ToBytes(b64: string): Uint8Array {
	const binary = atob(b64);
	const bytes = new Uint8Array(binary.length);
	for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
	return bytes;
}

// パスワード + salt から AES-GCM 鍵を導出 (extractable=false)。
//
// iterations を引数で受けるのは必須: 復号側は「暗号化時に使われた回数」= レコードの
// security.kdfIterations を渡さなければならない。ここで KDF_ITERATIONS を直接読むと、
// 定数を変更した瞬間に既存の保存済みレコードが全て復号不能になる (記録された値が無視され、
// 別の鍵が導出されるため)。暗号化側だけが KDF_ITERATIONS を使う。
async function deriveKey(
	password: string,
	salt: Uint8Array,
	iterations: number
): Promise<CryptoKey> {
	const baseKey = await crypto.subtle.importKey("raw", enc.encode(password), "PBKDF2", false, [
		"deriveKey",
	]);
	return crypto.subtle.deriveKey(
		{ name: "PBKDF2", salt, iterations, hash: "SHA-256" },
		baseKey,
		{ name: "AES-GCM", length: 256 },
		false,
		["encrypt", "decrypt"]
	);
}

/** 任意の JSON 値を暗号化する。salt/iv は毎回ランダム生成。 */
export async function encryptJson(value: unknown, password: string): Promise<EncryptedPayload> {
	const salt = crypto.getRandomValues(new Uint8Array(16));
	const iv = crypto.getRandomValues(new Uint8Array(12));
	const key = await deriveKey(password, salt, KDF_ITERATIONS);
	const plaintext = enc.encode(JSON.stringify(value));
	const ct = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, plaintext);
	return {
		security: {
			version: SECURITY_VERSION,
			kdf: "PBKDF2",
			kdfIterations: KDF_ITERATIONS,
			salt: bytesToBase64(salt),
			cipher: "AES-GCM",
			iv: bytesToBase64(iv),
		},
		ciphertext: bytesToBase64(new Uint8Array(ct)),
	};
}

/** imageData (imageId→dataURL) を暗号化する。salt/iv は毎回ランダム生成。 */
export async function encryptImageData(
	imageData: Record<string, string>,
	password: string
): Promise<EncryptedImageData> {
	return encryptJson(imageData, password);
}

/** 暗号ペイロードを復号する。パスワード不一致 / 改竄 / 未対応 version は throw。 */
export async function decryptJson<T>(payload: EncryptedPayload, password: string): Promise<T> {
	const { security, ciphertext } = payload;
	if (security.version !== SECURITY_VERSION || security.cipher !== "AES-GCM") {
		throw new Error(`未対応または不正なセキュリティ形式です (version=${security.version})`);
	}
	// 記録された反復回数で導出する (KDF_ITERATIONS 変更後も既存レコードを読めるようにするため)。
	// ただし下限を割る値は拒否: レコードを細工して反復回数を落とす = KDF の遅延を無効化する
	// ダウングレード攻撃を防ぐ。
	if (!(security.kdfIterations >= MIN_KDF_ITERATIONS)) {
		throw new Error(`鍵導出の反復回数が不正です (kdfIterations=${security.kdfIterations})`);
	}
	const salt = base64ToBytes(security.salt);
	const iv = base64ToBytes(security.iv);
	const key = await deriveKey(password, salt, security.kdfIterations);
	let plainBuf: ArrayBuffer;
	try {
		plainBuf = await crypto.subtle.decrypt(
			{ name: "AES-GCM", iv },
			key,
			base64ToBytes(ciphertext)
		);
	} catch {
		// GCM 認証タグ不一致 = パスワード誤り or データ破損
		throw new Error("パスワードが正しくないか、データが破損しています。");
	}
	return JSON.parse(dec.decode(plainBuf)) as T;
}

/** 暗号化 imageData を復号する。パスワード不一致 / 改竄 / 未対応 version は throw。 */
export async function decryptImageData(
	payload: EncryptedImageData,
	password: string
): Promise<Record<string, string>> {
	return decryptJson<Record<string, string>>(payload, password);
}

/**
 * パスワード検証: 復号を試して成否を返す (AES-GCM 認証タグ依存)。高速ハッシュのオラクルを
 * 持たないため、検証も PBKDF2 経由 = 総当たり耐性を保つ。解錠フローでは decryptImageData を
 * 直接使い、この関数は「復号結果を使わず正誤だけ知りたい」場合に用いる。
 */
export async function verifyPassword(
	payload: EncryptedPayload,
	password: string
): Promise<boolean> {
	try {
		await decryptJson(payload, password);
		return true;
	} catch {
		return false;
	}
}
