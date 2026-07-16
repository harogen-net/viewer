// モバイル環境判定 (docs/mode-spec.md §2)。
// isMobileEnv(): mobile UA OR 小 viewport → VIEW モード自動切替の gate。
// PWA (standalone) 要件は課さない: モバイルは閲覧用途なので browser 経由でも VIEW 固定にする。
// PC で VIEW にしたい場合は `?mode=view` を明示指定する (それ以外は EDIT 既定)。
// SSR / test 環境 (window undefined) 時は false。

const MOBILE_UA_RE = /Android|iPhone|iPad|iPod|Mobile/i;
const SMALL_VIEWPORT_PX = 900;

const isMobileUA = (): boolean => {
	if (typeof navigator === "undefined") return false;
	return MOBILE_UA_RE.test(navigator.userAgent);
};

export const isMobileEnv = (): boolean => {
	if (typeof window === "undefined") return false;
	const small = window.innerWidth <= SMALL_VIEWPORT_PX || window.innerHeight <= SMALL_VIEWPORT_PX;
	return isMobileUA() || small;
};
