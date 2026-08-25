import { useLayerStore } from "@/state/layerStore";
import { useListToolStore } from "@/state/listToolStore";
import { useSlideStore } from "@/state/slideStore";
import { useEffect } from "react";
import { useDocumentMutation } from "./useDocumentMutation";
import { useLayerClipboard } from "./useLayerClipboard";
import { useLayerMutation } from "./useLayerMutation";

// 編集シェルのキーボードショートカット (v4 Group D D-8 / 補間で拡充、§0-10 新側内製)。
// レガシー src/utils/KeyboardManager.ts は copy/cut/paste のみ。それ以外 (undo/redo・
// カーソルキー移動・レイヤー並べ替え) は新側で追加した拡充ショートカット。
//
// マッピング (function-list §12 ショートカットイベント + 拡充):
//   - Ctrl/Cmd + C            : copy
//   - Ctrl/Cmd + X            : cut
//   - Ctrl/Cmd + V            : paste
//   - Ctrl/Cmd + Z            : undo
//   - Ctrl/Cmd + Shift + Z    : redo
//   - Ctrl/Cmd + Y            : redo
//   - ↑ ↓ ← →                 : 選択レイヤーを移動 (差分は transX/transY フィールドの
//                               カーソル上下と同一 = 25 / Shift = 100。→ +X、↓ +Y)
//   - Ctrl/Cmd + [            : レイヤーを 1 段上 (前面) へ
//   - Ctrl/Cmd + ]            : レイヤーを 1 段下 (背面) へ
//     (最前面/最背面は Cmd+Shift+[ ] が Chrome のタブ切替と衝突し阻止不可のため
//      キーボードショートカットは廃止。UI ボタンで操作する)
//
// テキスト入力中 (input / textarea / contentEditable) はブラウザ既定の挙動を優先し、
// レイヤー操作を発火させない (テキストレイヤー編集との競合回避)。
//
// AppShell の編集領域でマウントする (1 listener)。state は stale closure / オートリピート
// 対策で handler 内の getState() から最新を読む (依存は安定 callback のみ)。

// カーソルキー移動の差分 (transX/transY NumberAdjustInput の step / shiftStep と一致)。
const NUDGE_STEP = 25;
const NUDGE_SHIFT_STEP = 100;

const isTextInputTarget = (target: EventTarget | null): boolean => {
	if (!(target instanceof HTMLElement)) return false;
	const tag = target.tagName;
	return tag === "INPUT" || tag === "TEXTAREA" || target.isContentEditable;
};

// 現在選択中レイヤーの slide 内 index を求める (未選択 / 未発見は -1)。
const findSelectedLayerIndex = (): number => {
	const { slides, selectedIndex } = useSlideStore.getState();
	const slide = selectedIndex >= 0 ? slides[selectedIndex] : null;
	const selected = useLayerStore.getState().selectedLayer;
	if (!slide || !selected) return -1;
	return slide.layers.findIndex((l) => l.uuid === selected.uuid);
};

export const useShellKeyboard = (): void => {
	const { copy, cut, paste } = useLayerClipboard();
	const { undo, redo } = useDocumentMutation();
	const { updateLayer, bringForward, sendBackward } = useLayerMutation();

	useEffect(() => {
		const handler = (e: KeyboardEvent): void => {
			if (isTextInputTarget(e.target)) return;

			// --- 修飾なし: カーソルキーで選択レイヤー移動 ---
			if (!e.ctrlKey && !e.metaKey && !e.altKey) {
				const dir =
					e.key === "ArrowRight"
						? { dx: 1, dy: 0 }
						: e.key === "ArrowLeft"
							? { dx: -1, dy: 0 }
							: e.key === "ArrowDown"
								? { dx: 0, dy: 1 }
								: e.key === "ArrowUp"
									? { dx: 0, dy: -1 }
									: null;
				if (!dir) return;
				const idx = findSelectedLayerIndex();
				if (idx < 0) return;
				const selected = useLayerStore.getState().selectedLayer;
				if (!selected || selected.locked) return; // locked は移動不可
				const step = e.shiftKey ? NUDGE_SHIFT_STEP : NUDGE_STEP;
				updateLayer(idx, {
					transX: selected.transX + dir.dx * step,
					transY: selected.transY + dir.dy * step,
				});
				e.preventDefault();
				return;
			}

			// --- Ctrl/Cmd 修飾 (Alt 併用は対象外) ---
			if (!(e.ctrlKey || e.metaKey) || e.altKey) return;

			// レイヤー並べ替え (z 順、1 段ずつ)。[ = 前面へ / ] = 背面へ。
			// キー判定は e.code (物理キー位置) ではなく e.key (文字) で行う。
			// 理由: JIS 配列 (特に Mac) では [ ] の物理位置が US と異なり、e.code が
			// "BracketLeft/Right" にならず一致しない。e.key は配列に依らず文字を返す。
			// 最前面/最背面 (旧 Shift+[ ]) は Cmd+Shift+[ ] が Chrome のタブ切替と衝突し
			// ページ側で preventDefault 不可のため、キーボードショートカットは廃止 (UI ボタンで操作)。
			// Shift 併用時は [ → { に化けてここに一致しないので、自然と単段操作のみが残る。
			if (e.key === "[") {
				const idx = findSelectedLayerIndex();
				if (idx < 0) return;
				bringForward(idx);
				e.preventDefault();
				return;
			}
			if (e.key === "]") {
				const idx = findSelectedLayerIndex();
				if (idx < 0) return;
				sendBackward(idx);
				e.preventDefault();
				return;
			}

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
				case "z":
					// 一括切替モード中は undo/redo を止める (docs/bulk-toggle-mode-plan.md)。
					// モード中の変更は退出時に履歴 1 件へまとめる方式なので、途中で undo が
					// 走ると突入時スナップショットと実状態がずれ、まとめ方が壊れる。
					if (useListToolStore.getState().bulkToggleActive) break;
					if (e.shiftKey) redo();
					else undo();
					e.preventDefault();
					break;
				case "y":
					if (useListToolStore.getState().bulkToggleActive) break;
					redo();
					e.preventDefault();
					break;
				default:
					break;
			}
		};
		window.addEventListener("keydown", handler);
		return () => window.removeEventListener("keydown", handler);
	}, [copy, cut, paste, undo, redo, updateLayer, bringForward, sendBackward]);
};
