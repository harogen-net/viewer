import { useEffect } from "react";
import { useLayerClipboard } from "./useLayerClipboard";

// 編集シェルのキーボードショートカット (v4 Group D D-8、§0-10 新側内製)。
// レガシー src/utils/KeyboardManager.ts (EventDispatcher class) の
// cut / copy / paste イベントを window keydown listener として再実装。
//
// マッピング (function-list §12 ショートカットイベント):
//   - Ctrl/Cmd + C : copy
//   - Ctrl/Cmd + X : cut
//   - Ctrl/Cmd + V : paste
//
// テキスト入力中 (input / textarea / contentEditable) はブラウザ既定のテキスト
// コピペを優先し、レイヤー clipboard を発火させない (テキストレイヤー編集との競合回避)。
//
// AppShell の編集領域でマウントする (1 listener)。Shift 判定 (拡縮比固定) は
// 個別ジェスチャ側 (useLayerGesture / resize handle) が担当するためここでは扱わない。

const isTextInputTarget = (target: EventTarget | null): boolean => {
	if (!(target instanceof HTMLElement)) return false;
	const tag = target.tagName;
	return tag === "INPUT" || tag === "TEXTAREA" || target.isContentEditable;
};

export const useShellKeyboard = (): void => {
	const { copy, cut, paste } = useLayerClipboard();

	useEffect(() => {
		const handler = (e: KeyboardEvent): void => {
			if (!(e.ctrlKey || e.metaKey) || e.altKey) return;
			if (isTextInputTarget(e.target)) return;
			switch (e.key.toLowerCase()) {
				case "c":
					copy();
					e.preventDefault();
					break;
				case "x":
					cut();
					e.preventDefault();
					break;
				case "v":
					paste();
					e.preventDefault();
					break;
				default:
					break;
			}
		};
		window.addEventListener("keydown", handler);
		return () => window.removeEventListener("keydown", handler);
	}, [copy, cut, paste]);
};
