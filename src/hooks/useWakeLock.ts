import { useEffect, useRef } from "react";

/**
 * active の間だけ画面の自動ロック / スリープを抑止する (Screen Wake Lock API)。
 *
 * - active=true で sentinel を取得し、active=false / アンマウントで解放する。
 * - タブがバックグラウンドに入ると OS が sentinel を自動解放するため、visibilitychange で
 *   可視状態へ復帰したら再取得する (これをしないと一度隠れると二度と効かなくなる)。
 * - 可視のまま解放された場合も取り直す。ただし再取得は RETRY_LIMIT 回まで
 *   (下記 iOS の事情で「取得 → 即解放」が続くと無限ループになりバッテリーを食うため)。
 * - 非対応環境 (navigator.wakeLock 無し) は no-op。HTTPS (secure context) 必須で、
 *   http 配信では navigator.wakeLock 自体が存在しない。
 * - 取得失敗 (低電力モード / 権限 / 一時的失敗) は握りつぶす。抑止できないだけで
 *   呼び出し側の機能は継続する。
 *
 * ## iOS のホーム画面 Web App では iOS 18.4 未満で効かない
 *
 * WebKit のバグ https://bugs.webkit.org/show_bug.cgi?id=254545
 * ("New Wake Lock API does not work in Home Screen Web Apps"、2023-03-27 報告 /
 * iOS 18.4 (2025-03-31) で RESOLVED FIXED)。
 *
 * 原因はホーム画面 Web App が UIApplication ではなく ViewService として動くことで、
 * WebKit が使う `UIApplication.idleTimerDisabled` が効かない。**request は成功するのに
 * 効果だけ無い**ため、エラーからは検知できない (状態を UI に出しても分からない)。
 *
 * したがって iOS 18.4 未満のホーム画面起動では、この API だけでは抑止できない。
 *   - Safari のタブで開けば 16.4+ で動く (ホーム画面 App のときだけの問題)
 *   - 回避策は useNoSleepVideo (無音の音声トラックを持つ動画を再生し続ける)。
 *     実機 iOS 17.7 のホーム画面 App で有効なことを確認済み。ただし音声トラックが
 *     必須で、ミュートすると効かない (= 他アプリの音を止める代償がある)。
 */

/** 可視のまま解放されたときに取り直す上限。無限ループ (取得→即解放) を防ぐ。 */
const RETRY_LIMIT = 3;

export function useWakeLock(active: boolean): void {
	const sentinelRef = useRef<WakeLockSentinel | null>(null);

	useEffect(() => {
		if (!active) return;
		const wakeLock = navigator.wakeLock;
		if (!wakeLock) return; // 非対応環境は no-op

		let cancelled = false;
		// 取得中フラグ。sentinelRef は await の後にしか立たないため、これが無いと
		// release と visibilitychange から同時に acquire が走って二重取得になり、
		// 片方の sentinel が解放されないまま残る。
		let acquiring = false;
		// 可視のまま解放されて取り直した回数。visibilitychange 経由の再取得は数えない
		// (そちらは正常な経路で、何度起きても構わない)。
		let retries = 0;

		const acquire = async (): Promise<void> => {
			if (cancelled) return;
			if (sentinelRef.current || acquiring) return; // 既に保持中 / 取得中
			// 不可視の間は request が reject するので取りにいかない (復帰時に再取得)。
			if (document.visibilityState !== "visible") return;
			acquiring = true;
			try {
				const sentinel = await wakeLock.request("screen");
				if (cancelled) {
					sentinel.release().catch(() => {});
					return;
				}
				sentinelRef.current = sentinel;
				sentinel.addEventListener("release", () => {
					if (sentinelRef.current !== sentinel) return;
					sentinelRef.current = null;
					// 不可視なら OS の正常な自動解放。復帰時に visibilitychange で取り直す。
					if (cancelled || document.visibilityState !== "visible") return;
					if (retries >= RETRY_LIMIT) return;
					retries += 1;
					void acquire();
				});
			} catch {
				// 権限拒否 / 低電力モード / 一時的失敗は無視 (抑止できないだけで機能は継続)。
			} finally {
				acquiring = false;
			}
		};

		const onVisibility = (): void => {
			if (document.visibilityState !== "visible") return;
			// 復帰したら再取得の予算を戻す (前回の消費を引きずらない)。
			retries = 0;
			void acquire();
		};

		void acquire();
		document.addEventListener("visibilitychange", onVisibility);

		return () => {
			cancelled = true;
			document.removeEventListener("visibilitychange", onVisibility);
			const sentinel = sentinelRef.current;
			sentinelRef.current = null;
			sentinel?.release().catch(() => {});
		};
	}, [active]);
}
