/**
 * R4.7.2: フルスクリーン API の薄いラッパ。
 *
 * 標準 API と WebKit 接頭辞の両方を順に試す。Runtime クラスから直接 DOM API を
 * 触らずに済ませるための切り出し。例外は黙殺する（呼び出し側でハンドリングしない）。
 */

type WebkitDocument = Document & {
	webkitCancelFullScreen?: () => void;
};

type WebkitElement = HTMLElement & {
	webkitRequestFullScreen?: () => void;
};

/** `element` を fullscreen に遷移させる。標準 API → WebKit の順に試す。 */
export function requestFullscreenOn(element: HTMLElement): void {
	try {
		if (element.requestFullscreen) {
			element.requestFullscreen();
			return;
		}
	} catch (_e) {}
	try {
		const webkit = (element as WebkitElement).webkitRequestFullScreen;
		if (webkit) webkit.call(element);
	} catch (_e) {}
}

/** ドキュメントの fullscreen を解除する。fullscreen 中でなくても安全に呼べる。 */
export function exitFullscreenIfActive(): void {
	try {
		if (document.fullscreenElement && document.exitFullscreen) {
			document.exitFullscreen();
			return;
		}
	} catch (_e) {}
	try {
		const webkit = (document as WebkitDocument).webkitCancelFullScreen;
		if (webkit) webkit.call(document);
	} catch (_e) {}
}

/**
 * fullscreen 状態を確認せずに常に解除を試みる。`SlideShowRuntime#initialize` /
 * `#stop` の従来挙動に対応する強制解除版。
 */
export function forceExitFullscreen(): void {
	try {
		document.exitFullscreen();
	} catch (_e) {}
	try {
		const webkit = (document as WebkitDocument).webkitCancelFullScreen;
		if (webkit) webkit.call(document);
	} catch (_e) {}
}
