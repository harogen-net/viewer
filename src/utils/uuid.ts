/**
 * uuid 生成 (crypto.randomUUID 優先、無ければ乱数 fallback)。
 * uuid は React key / 連動判定用で HVD には保存しない (byte-equal 対象外)。
 * slideFactory / layerOps / storageCodec が共有 (旧: 各ファイルに同一実装が重複していた)。
 */
export const newUuid = (): string => {
	const c = (typeof crypto !== "undefined" ? crypto : null) as Crypto | null;
	if (c && typeof c.randomUUID === "function") return c.randomUUID();
	return `r-${Math.random().toString(36).slice(2)}-${Date.now().toString(36)}`;
};
