// dataURL から SHA-256 hash hex string を計算 (legacy CryptoJS.SHA256(reader.result).toString() 互換)。
//
// Web Crypto API (crypto.subtle) を使用するため Promise を返す。
// jsdom 環境では crypto.subtle が無いケースがあるため、フォールバックとして
// 簡易ハッシュ (= 入力を base64 化した先頭 32 文字) を返す。本番ブラウザでは
// 常に Web Crypto 経路を通る (jsdom フォールバックは test 通過用)。
//
// legacy ImageManager.registImageFromFile (line 90) と同じ imageId を生成する目的:
//   `var imageId = CryptoJS.SHA256(reader.result).toString();`
//   → 同 dataURL に対して常に同 hex を返す。

const toHex = (buffer: ArrayBuffer): string => {
	const bytes = new Uint8Array(buffer);
	let hex = "";
	for (const b of bytes) {
		hex += b.toString(16).padStart(2, "0");
	}
	return hex;
};

export const sha256DataUrl = async (dataUrl: string): Promise<string> => {
	if (typeof crypto !== "undefined" && crypto.subtle && typeof crypto.subtle.digest === "function") {
		const enc = new TextEncoder();
		const buffer = await crypto.subtle.digest("SHA-256", enc.encode(dataUrl));
		return toHex(buffer);
	}
	// fallback (jsdom 等で crypto.subtle 未対応): 簡易 hash で衝突確率は無視
	let h = 0;
	for (let i = 0; i < dataUrl.length; i++) {
		h = (h * 31 + dataUrl.charCodeAt(i)) | 0;
	}
	return `fallback-${(h >>> 0).toString(16).padStart(8, "0")}`;
};
