import { isSessionExpired, SESSION_TIMEOUT_MS, useAppLockStore } from "@/state/appLockStore";
import { useSlideshowStore } from "@/state/slideshowStore";
import { useEffect } from "react";

/**
 * active (= 解錠中) の間、解錠セッションを管理する。docs/app-lock-spec.md §6。
 *
 * SESSION_TIMEOUT_MS (state/appLockStore.ts) が挙動を決める:
 *   - 0: 猶予なし。バックグラウンドへ回った瞬間に即ロックする (延長/ポーリングは一切走らない)
 *   - >0: セッション方式。最後の操作からその ms が経つとロック、操作のたびに延長される。
 *     セッション中はバックグラウンドへ回して戻っても再認証を求めない
 *
 * 実機で試した結果、猶予 (キャッシュ) は不要と判断し現在は 0 にしている。定数を戻せば
 * セッション方式に復帰できるよう、分岐ごと残してある。
 */

/** 表示中の期限監視の間隔 (ms)。SESSION_TIMEOUT_MS > 0 のときだけ使う。 */
const POLL_INTERVAL_MS = 10_000;
/** セッション延長の間引き (ms)。操作ごとに store を書き換えるのを抑える。 */
const TOUCH_THROTTLE_MS = 1_000;

/** 操作とみなすイベント。capture で拾い、passive にして描画を妨げない。 */
const ACTIVITY_EVENTS = ["pointerdown", "keydown", "wheel", "touchstart"] as const;

export function useAppSession(active: boolean): void {
	useEffect(() => {
		if (!active) return;

		const store = () => useAppLockStore.getState();

		const relock = (): void => {
			// 再生中のままロックすると、解錠時に AppMain が再マウントしてスライドショーが
			// 勝手に再開する。予測可能性のため止めておく。
			useSlideshowStore.getState().stop();
			store().lock();
		};

		// SESSION_TIMEOUT_MS <= 0: 猶予なし。延長/ポーリングの類は一切走らせず
		// (「関連処理を何もしない」)、バックグラウンド遷移を検知した瞬間に即ロックする。
		// セッション導入前の useAppRelock と同じ挙動。
		if (SESSION_TIMEOUT_MS <= 0) {
			const onHidden = (): void => {
				if (document.visibilityState !== "visible") relock();
			};
			document.addEventListener("visibilitychange", onHidden);
			window.addEventListener("pagehide", relock);
			document.addEventListener("freeze", relock);
			return () => {
				document.removeEventListener("visibilitychange", onHidden);
				window.removeEventListener("pagehide", relock);
				document.removeEventListener("freeze", relock);
			};
		}

		// ここから先は SESSION_TIMEOUT_MS > 0 のときだけ。
		//
		// ロックする契機は 2 つ:
		//   1. 表示中の無操作 — ポーリングで期限を監視する
		//   2. 可視状態へ復帰した瞬間 — 期限切れならその場でロック
		//
		// 2 が必要なのは、バックグラウンドではタイマーが絞られる / 凍結されるため 1 が当てに
		// ならないこと。逆に 1 が必要なのは、端末を机に置いたまま前面に残っているケースを拾うため。
		//
		// 時刻は performance.now() (単調増加) を使う。Date.now() だと端末時計を巻き戻して
		// 「経過時間が負 = まだ有効」に見せられる。

		const expired = (): boolean =>
			isSessionExpired(store().lastActivityAt, performance.now(), SESSION_TIMEOUT_MS);

		let lastTouch = 0;
		const onActivity = (): void => {
			const now = performance.now();
			// 間引き。連続入力で毎回 set しても意味が無い。
			if (now - lastTouch < TOUCH_THROTTLE_MS) return;
			lastTouch = now;
			store().touchSession(now);
		};

		// 表示中の無操作監視。
		//
		// 表示中のスライドショー再生は「使用中」なのでセッションを延長する。再生は無人で進むため
		// 操作イベントが発生しない。ここで延長せず期限チェックだけを飛ばすと、再生中はロックされ
		// ないが lastActivityAt が古いままなので、再生を止めた直後に期限切れで即ロックしてしまう。
		//
		// 延長は「表示中」に限る。バックグラウンドでも延長すると、再生したまま伏せて放置した
		// 端末が永久に解錠されたままになる (復帰時の期限判定 = 下記 onVisibility も効かなくなる)。
		const poll = window.setInterval(() => {
			if (document.visibilityState === "visible" && useSlideshowStore.getState().running) {
				store().touchSession(performance.now());
				return;
			}
			if (expired()) relock();
		}, POLL_INTERVAL_MS);

		// 可視復帰時の期限判定。ここではスライドショーを例外にしない
		// (バックグラウンドに長く置かれた場合は再生中でもロックする)。
		const onVisibility = (): void => {
			if (document.visibilityState !== "visible") return;
			if (expired()) relock();
		};
		// bfcache から戻った場合は visibilitychange が来ないことがある。
		const onPageShow = (): void => {
			if (expired()) relock();
		};

		for (const ev of ACTIVITY_EVENTS) {
			document.addEventListener(ev, onActivity, { capture: true, passive: true });
		}
		document.addEventListener("visibilitychange", onVisibility);
		window.addEventListener("pageshow", onPageShow);

		return () => {
			window.clearInterval(poll);
			for (const ev of ACTIVITY_EVENTS) {
				document.removeEventListener(ev, onActivity, { capture: true });
			}
			document.removeEventListener("visibilitychange", onVisibility);
			window.removeEventListener("pageshow", onPageShow);
		};
	}, [active]);
}
