import { useEffect } from "react";

// mobile PWA の画面向きロック (docs/mode-spec.md §4)。
// 手順:
//   1. Screen Orientation API で landscape lock を試みる (対応環境: Android Chrome/Edge 等)
//   2. lock 失敗 (iOS Safari 等の非対応 or standalone でも拒否) 時は
//      portrait 検出中に <html data-orientation-fallback> 属性を付ける。
//      CSS 側 (styles/index.css) がこの属性を見て transform rotate(90deg) を適用する。
// cleanup で unlock + 属性除去。enabled=false なら何もしない (PC ブラウザで no-op)。

interface UseOrientationLockOptions {
	/** true の間だけ landscape lock / fallback を有効化 (mobile PWA 時のみ true にする)。 */
	enabled: boolean;
}

const FALLBACK_ATTR = "data-orientation-fallback";

const applyFallback = (portrait: boolean): void => {
	const html = document.documentElement;
	if (portrait) html.setAttribute(FALLBACK_ATTR, "");
	else html.removeAttribute(FALLBACK_ATTR);
};

export const useOrientationLock = ({ enabled }: UseOrientationLockOptions): void => {
	useEffect(() => {
		if (!enabled) return;
		let locked = false;
		// biome-ignore lint/suspicious/noExplicitAny: Screen Orientation lock は TS 型が partial
		const orientation = (screen as any)?.orientation as
			| { lock?: (o: string) => Promise<void>; unlock?: () => void }
			| undefined;
		orientation?.lock?.("landscape").then(
			() => {
				locked = true;
				// 初期 onChange で portrait 判定により fallback を付けていた可能性があるため、
				// lock 成功時は確実に fallback を外す (残ると二重回転になる)。
				applyFallback(false);
			},
			() => {
				// 拒否・非対応: fallback 経路に任せる (matchMedia 監視で portrait 時に属性付与)
			}
		);
		const mql = window.matchMedia("(orientation: portrait)");
		const onChange = (): void => {
			if (locked) return; // API lock 成功時は fallback 不要
			applyFallback(mql.matches);
		};
		onChange();
		mql.addEventListener("change", onChange);
		return () => {
			mql.removeEventListener("change", onChange);
			applyFallback(false);
			try {
				orientation?.unlock?.();
			} catch {
				// ignore
			}
		};
	}, [enabled]);
};
