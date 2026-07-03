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

/** 暗号化済み imageData ペイロード (security メタ + 暗号文)。 */
export interface EncryptedImageData {
	security: SecurityMeta;
	ciphertext: string; // base64(AES-GCM(JSON.stringify(imageData)))
}

const SECURITY_VERSION = 1;
const KDF_ITERATIONS = 150_000;
const enc = new TextEncoder();
const dec = new TextDecoder();

// 大きな配列でも stack overflow しない base64 変換 (画像暗号文は数 MB になり得る)。
function bytesToBase64(bytes: Uint8Array): string {
	let binary = "";
	const CHUNK = 0x8000;
	for (let i = 0; i < bytes.length; i += CHUNK) {
		binary += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
	}
	return btoa(binary);
}

function base64ToBytes(b64: string): Uint8Array {
	const binary = atob(b64);
	const bytes = new Uint8Array(binary.length);
	for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
	return bytes;
}

// パスワード + salt から AES-GCM 鍵を導出 (extractable=false)。
async function deriveKey(password: string, salt: Uint8Array): Promise<CryptoKey> {
	const baseKey = await crypto.subtle.importKey("raw", enc.encode(password), "PBKDF2", false, [
		"deriveKey",
	]);
	return crypto.subtle.deriveKey(
		{ name: "PBKDF2", salt, iterations: KDF_ITERATIONS, hash: "SHA-256" },
		baseKey,
		{ name: "AES-GCM", length: 256 },
		false,
		["encrypt", "decrypt"]
	);
}

/** imageData (imageId→dataURL) を暗号化する。salt/iv は毎回ランダム生成。 */
export async function encryptImageData(
	imageData: Record<string, string>,
	password: string
): Promise<EncryptedImageData> {
	const salt = crypto.getRandomValues(new Uint8Array(16));
	const iv = crypto.getRandomValues(new Uint8Array(12));
	const key = await deriveKey(password, salt);
	const plaintext = enc.encode(JSON.stringify(imageData));
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

/** 暗号化 imageData を復号する。パスワード不一致 / 改竄 / 未対応 version は throw。 */
export async function decryptImageData(
	payload: EncryptedImageData,
	password: string
): Promise<Record<string, string>> {
	const { security, ciphertext } = payload;
	if (security.version !== SECURITY_VERSION || security.cipher !== "AES-GCM") {
		throw new Error(`未対応または不正なセキュリティ形式です (version=${security.version})`);
	}
	const salt = base64ToBytes(security.salt);
	const iv = base64ToBytes(security.iv);
	const key = await deriveKey(password, salt);
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
	return JSON.parse(dec.decode(plainBuf)) as Record<string, string>;
}

/**
 * パスワード検証: 復号を試して成否を返す (AES-GCM 認証タグ依存)。高速ハッシュのオラクルを
 * 持たないため、検証も PBKDF2 経由 = 総当たり耐性を保つ。解錠フローでは decryptImageData を
 * 直接使い、この関数は「復号結果を使わず正誤だけ知りたい」場合に用いる。
 */
export async function verifyPassword(
	payload: EncryptedImageData,
	password: string
): Promise<boolean> {
	try {
		await decryptImageData(payload, password);
		return true;
	} catch {
		return false;
	}
}
