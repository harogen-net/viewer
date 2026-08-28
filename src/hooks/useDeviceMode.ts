import { isMobileEnv } from "@/utils/mobileDetect";
import { useEffect, useState } from "react";

// スマホ判定 + orientation 追従。UI 側で「スマホモード共通」「portrait のみ」の分岐を行う。
// - isMobile: 端末判定 (PWA/browser 問わず)。判定は mobileDetect に一本化する
//   (以前ここに同じ UA 正規表現を複製しており、片方だけ直すと挙動がずれる状態だった)
// - isPortrait: matchMedia("(orientation: portrait)") — resize / rotation で state 更新
// SSR safety のため lazy init。

interface DeviceMode {
	isMobile: boolean;
	isPortrait: boolean;
}

const readInitial = (): DeviceMode => {
	if (typeof window === "undefined") return { isMobile: false, isPortrait: false };
	return {
		isMobile: isMobileEnv(),
		isPortrait: window.matchMedia?.("(orientation: portrait)").matches ?? false,
	};
};

export const useDeviceMode = (): DeviceMode => {
	const [state, setState] = useState<DeviceMode>(readInitial);
	useEffect(() => {
		const mql = window.matchMedia("(orientation: portrait)");
		const update = (): void =>
			setState((s) => (s.isPortrait === mql.matches ? s : { ...s, isPortrait: mql.matches }));
		mql.addEventListener("change", update);
		return () => mql.removeEventListener("change", update);
	}, []);
	return state;
};
