import { isIosDevice } from "@/utils/mobileDetect";
import { primeNoSleepVideo, stopNoSleepVideo } from "@/utils/noSleepVideo";
import { useEffect } from "react";

/**
 * active の間、無音動画を再生し続けて画面のスリープを抑止する。
 * Screen Wake Lock が効かない iOS 向けの回避策 (NoSleep.js 方式)。
 * 再生の実体と、なぜミュートしないのかは utils/noSleepVideo.ts にある。
 *
 * ## なぜ必要か
 *
 * iOS のホーム画面 Web App では iOS 18.4 未満で Screen Wake Lock が効かない
 * (https://bugs.webkit.org/show_bug.cgi?id=254545、詳細は useWakeLock)。request は
 * 成功するのに効果だけ無いため、API 側からは検知も回避もできない。
 *
 * ## 適用範囲
 *
 * iOS 端末のみ。他のプラットフォームでは Screen Wake Lock が正しく効くので、動画を回すのは
 * 電力の無駄でしかない。iOS でも 18.4 以降や Safari のタブでは冗長になるが、OS バージョン
 * 判定は UA 依存で脆いため端末種別だけで割り切る。
 *
 * ## 開始はユーザー操作から (この hook は停止と取りこぼしの担当)
 *
 * ミュートしないメディアの `play()` はユーザー操作のコールスタック内でしか通らない。
 * この hook の effect は操作の後に走るため、ここからの `play()` は拒否され得る。
 * 本筋の開始経路はスライドショー開始ボタン (SlideShowOpsPanel) が担い、ここでは
 * 取りこぼしの再試行と、終了時の停止を受け持つ。
 */

/** 再生を再試行するユーザー操作。capture + passive で描画を妨げない。 */
const RETRY_EVENTS = ["pointerdown", "touchstart", "keydown"] as const;

export function useNoSleepVideo(active: boolean): void {
	useEffect(() => {
		if (!active) return;
		// Wake Lock が正しく効くプラットフォームでは回さない。
		if (!isIosDevice()) return;

		// 開始ボタン経由で既に再生されているのが本筋。ここは取りこぼしの保険。
		primeNoSleepVideo();

		const onUserGesture = (): void => primeNoSleepVideo();
		const onVisibility = (): void => {
			if (document.visibilityState === "visible") primeNoSleepVideo();
		};
		for (const ev of RETRY_EVENTS) {
			document.addEventListener(ev, onUserGesture, { capture: true, passive: true });
		}
		document.addEventListener("visibilitychange", onVisibility);

		return () => {
			for (const ev of RETRY_EVENTS) {
				document.removeEventListener(ev, onUserGesture, { capture: true });
			}
			document.removeEventListener("visibilitychange", onVisibility);
			stopNoSleepVideo();
		};
	}, [active]);
}
