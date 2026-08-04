import { useAppSession } from "@/hooks/useAppSession";
import { useDeviceMode } from "@/hooks/useDeviceMode";
import { useAppLockStore } from "@/state/appLockStore";
import { AppLockStatus } from "@/types/AppLock";
import { isPlatformAuthenticatorAvailable } from "@/utils/webauthnLock";
import { createTheme, MantineProvider } from "@mantine/core";
import type { FC } from "react";
import { useEffect } from "react";
import { AppLockScreen } from "./AppLockScreen";
import { AppMain } from "./AppMain";

// アプリのルート。責務は 3 つだけ:
//   1. MantineProvider (アプリ唯一の Provider)
//   2. 端末軸のグローバル属性 (html[data-mobile-env])
//   3. アプリロックのゲート — ロック中は AppMain を「マウントしない」
//
// 中身 (レイアウト・副作用 hook・パネル) は AppMain へ分離してある。ロック中に AppMain を
// 描画しないことで、認証前に document 自動生成や IndexedDB 読み出しが走らないことを
// 構造的に保証する (条件分岐で個別に止めるのではなく、ツリーごと存在させない)。

const appTheme = createTheme({
	colors: {
		red: [
			"#FF0000",
			"#FF0000",
			"#FF0000",
			"#FF0000",
			"#FF0000",
			"#FF0000",
			"#FF0000",
			"#FF0000",
			"#FF0000",
			"#FF0000",
		],
	},
});

export const AppShell: FC = () => {
	// 端末軸 (mobile UA) と 起動モード (VIEW/EDIT) は独立。user-select OFF は端末軸で判定。
	const { isMobile } = useDeviceMode();
	const lockStatus = useAppLockStore((s) => s.status);
	const setWebauthnAvailable = useAppLockStore((s) => s.setWebauthnAvailable);
	// 解錠中だけ解錠セッションを管理する (無操作 5 分 / 期限切れでの復帰でロック)。
	useAppSession(lockStatus === AppLockStatus.UNLOCKED);
	// 生体認証がこの端末で使えるかを非同期に判定して store へ流す (設定 UI の表示条件)。
	// isUserVerifyingPlatformAuthenticatorAvailable は user activation 不要でプロンプトも出ない。
	useEffect(() => {
		let cancelled = false;
		void isPlatformAuthenticatorAvailable().then((available) => {
			if (!cancelled) setWebauthnAvailable(available);
		});
		return () => {
			cancelled = true;
		};
	}, [setWebauthnAvailable]);
	// mobile 環境では全要素の user-select を切る (styles/index.css で html[data-mobile-env] を受ける)。
	// タップで意図しない選択状態が発生し以降のタップが解除に消費される事象を防ぐ。
	// ロック画面にも効かせたいのでルート側に置く。
	useEffect(() => {
		const html = document.documentElement;
		if (isMobile) html.setAttribute("data-mobile-env", "");
		else html.removeAttribute("data-mobile-env");
		return () => {
			html.removeAttribute("data-mobile-env");
		};
	}, [isMobile]);
	// ロック中は AppMain を「マウントしない」(条件分岐で個別に止めるのではなくツリーごと不在に
	// する)。これにより認証前に document 自動生成や IndexedDB 読み出しが走らない。
	return (
		<MantineProvider theme={appTheme}>
			{lockStatus === AppLockStatus.LOCKED ? <AppLockScreen /> : <AppMain />}
		</MantineProvider>
	);
};
