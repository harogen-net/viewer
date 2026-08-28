// モバイル環境判定 (docs/mode-spec.md §2)。
// isMobileEnv(): 端末が携帯端末か → スマホモード自動切替の gate。
// PWA (standalone) 要件は課さない: モバイルは閲覧用途なので browser 経由でも VIEW 固定にする。
// PC でスマホモードにしたい場合は `?mode=mobile` を明示指定する (それ以外は PCモード既定)。
// SSR / test 環境 (navigator undefined) 時は false。
//
// **ウィンドウサイズは見ない。** 以前は「幅か高さが 900px 以下なら携帯」としていたが、
// ノート PC の縦解像度からブラウザの UI 高さを引くと容易に 900 を割るため、
// macOS Safari 等のデスクトップ環境が誤ってスマホモードで起動していた。
// 起動モードは端末で決まるべき (軸 A は実行中に変わらない) なので、判定入力から外した。
//
// UA 解析ライブラリは使わない。欲しいのは「携帯端末か否か」の二値だけであり、
// かつ唯一の難所 (下記 iPadOS の Mac 詐称) は UA 文字列だけでは原理的に解けず、
// どのライブラリでも maxTouchPoints の併用が要る = ライブラリで減る仕事が無いため。

const MOBILE_UA_RE = /Android|iPhone|iPad|iPod|Mobile/i;
const IOS_UA_RE = /iPhone|iPad|iPod/i;

/**
 * UA が Mac を名乗るタッチ端末か。
 *
 * iPadOS 13 以降の iPad と、iOS Safari の「デスクトップ用サイトを表示」は、
 * UA がデスクトップ Mac と**完全に同一の文字列**になり UA だけでは区別できない。
 * Mac にタッチスクリーンは存在しない (maxTouchPoints は 0) ので、それで分離する。
 */
const isTouchMac = (): boolean =>
	/Macintosh/i.test(navigator.userAgent) && navigator.maxTouchPoints > 1;

/** 携帯端末 (スマホ / タブレット) か。Android タブレットは UA に `Mobile` を持たないが `Android` で拾える。 */
export const isMobileEnv = (): boolean => {
	if (typeof navigator === "undefined") return false;
	return MOBILE_UA_RE.test(navigator.userAgent) || isTouchMac();
};

/**
 * iOS / iPadOS 端末か。Screen Wake Lock が効かない環境の回避策 (useNoSleepVideo) の
 * 適用範囲を決めるために使う。isMobileEnv より狭い (Android を含まない)。
 */
export const isIosDevice = (): boolean => {
	if (typeof navigator === "undefined") return false;
	return IOS_UA_RE.test(navigator.userAgent) || isTouchMac();
};
