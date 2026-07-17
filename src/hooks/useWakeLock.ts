import { useEffect, useRef } from "react";

/**
 * active の間だけ画面の自動ロック / スリープを抑止する (Screen Wake Lock API)。
 *
 * - active=true で sentinel を取得し、active=false / アンマウントで解放する。
 * - タブがバックグラウンドに入ると OS が sentinel を自動解放するため、visibilitychange で
 *   可視状態へ復帰したら再取得する (これをしないと一度隠れると二度と効かなくなる)。
 * - 非対応環境 (navigator.wakeLock 無し = iOS 16.3 以前 / 一部ブラウザ) は no-op。
 * - HTTPS (secure context) 必須。取得失敗は握りつぶす (抑止できなくても呼び出し側は継続)。
 */
export function useWakeLock(active: boolean): void {
	const sentinelRef = useRef<WakeLockSentinel | null>(null);

	useEffect(() => {
		if (!active) return;
		const wakeLock = navigator.wakeLock;
		if (!wakeLock) return; // 非対応環境は no-op

		let cancelled = false;

		const acquire = async (): Promise<void> => {
			if (sentinelRef.current) return; // 既に保持中
			// 不可視の間は request が reject するので取りにいかない (復帰時に再取得)。
			if (document.visibilityState !== "visible") return;
			try {
				const sentinel = await wakeLock.request("screen");
				if (cancelled) {
					sentinel.release().catch(() => {});
					return;
				}
				sentinelRef.current = sentinel;
				// OS 側の自動解放 (バックグラウンド遷移等) を検知したら参照をクリアする。
				sentinel.addEventListener("release", () => {
					if (sentinelRef.current === sentinel) sentinelRef.current = null;
				});
			} catch {
				// 権限拒否 / 一時的失敗は無視 (抑止できないだけで機能は継続)。
			}
		};

		const onVisibility = (): void => {
			if (document.visibilityState === "visible") void acquire();
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
