import { useEffect } from "react";

/**
 * active の間、safe-area (iPhone のノッチ / ホームインジケータ) まで指定色で塗る。
 *
 * 全画面オーバーレイ (スライドショー / ロック画面) は `position: fixed; inset: 0` で
 * 画面を覆うが、それだけでは safe-area がアプリ本体の白背景のまま残る。理由は 2 つあり、
 * 両方に手当てが要る:
 *
 *   1. iOS Safari は portrait のタブ上部バーを `theme-color` (無ければページ色) で塗る。
 *      既定のままだと上部セーフエリアが白く残る。landscape は Safari が上部バーを畳むため
 *      元々問題にならない。
 *   2. オーバーレイが届かないピクセルが出た場合、素の body 色 (白) が見える。
 *      html / body / #root を塗り潰しておく (styles/index.css。index.html の
 *      viewport-fit=cover と連動)。
 *
 * 色は CSS 変数 `--safe-area-bg` で渡すため、機能ごとに CSS を足す必要はない。
 * オーバーレイ自身の背景色と同じ値を渡すこと (ずれると境界が見える)。
 *
 * 解除時は元の theme-color へ戻す (自分で meta を作った場合は取り除く)。
 *
 * 前提: 同時に有効な呼び出しは 1 つだけ。現状 AppShell がロック画面とアプリ本体を
 * 排他で描画するため成立している。複数を重ねると後勝ちになり、片方の解除で
 * もう片方の指定まで戻ってしまう。
 */
export function useSafeAreaBackground(active: boolean, color: string): void {
	useEffect(() => {
		if (!active) return;
		const html = document.documentElement;
		html.style.setProperty("--safe-area-bg", color);
		html.setAttribute("data-safe-area-bg", "");
		let themeMeta = document.querySelector<HTMLMetaElement>('meta[name="theme-color"]');
		const createdHere = themeMeta === null;
		const prevContent = themeMeta?.getAttribute("content") ?? null;
		if (!themeMeta) {
			themeMeta = document.createElement("meta");
			themeMeta.setAttribute("name", "theme-color");
			document.head.appendChild(themeMeta);
		}
		themeMeta.setAttribute("content", color);
		return () => {
			html.removeAttribute("data-safe-area-bg");
			html.style.removeProperty("--safe-area-bg");
			if (createdHere) themeMeta?.remove();
			else if (prevContent !== null) themeMeta?.setAttribute("content", prevContent);
		};
	}, [active, color]);
}
