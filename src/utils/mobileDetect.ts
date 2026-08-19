// モバイル環境判定 (docs/mode-spec.md §2)。
// isMobileEnv(): mobile UA OR 小 viewport → スマホモード自動切替の gate。
// PWA (standalone) 要件は課さない: モバイルは閲覧用途なので browser 経由でも VIEW 固定にする。
// PC でスマホモードにしたい場合は `?mode=mobile` を明示指定する (それ以外は PCモード既定)。
// SSR / test 環境 (window undefined) 時は false。

const MOBILE_UA_RE = /Android|iPhone|iPad|iPod|Mobile/i;
// iPad は iPadOS 13 以降 UA が Mac を名乗るため、タッチ有無との併用で判定する。
const IOS_UA_RE = /iPhone|iPad|iPod/i;
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

/**
 * iOS / iPadOS 端末か。Screen Wake Lock が効かない環境の回避策 (useNoSleepVideo) の
 * 適用範囲を決めるために使う。
 *
 * iPadOS 13 以降の iPad は UA が Macintosh を名乗るため、UA だけでは拾えない。
 * デスクトップ Mac と区別するためタッチ点数を併用する (Mac はタッチ非対応で 0)。
 */
export const isIosDevice = (): boolean => {
	if (typeof navigator === "undefined") return false;
	if (IOS_UA_RE.test(navigator.userAgent)) return true;
	return /Macintosh/i.test(navigator.userAgent) && navigator.maxTouchPoints > 1;
};
