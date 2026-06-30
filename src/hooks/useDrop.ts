import naturalCompare from "natural-compare";
import type { DragEvent as ReactDragEvent } from "react";
import { useCallback, useState } from "react";

// ドラッグ&ドロップ受け口 hook (v4 Group D D-11、function-list §5/§11/§13)。
// レガシー src/utils/DropHelper.ts (EventDispatcher + jQuery) は import せず新規実装 (§0-10)。
//
// 担当 (1 責務 = 「drop zone の dragover 状態 + drop 内容の振り分け」):
//   - dragover 中の isOver 状態管理 (子要素間移動でちらつかないよう relatedTarget で判定)
//   - drop された dataTransfer の中身を 2 経路に振り分け:
//       a) パレット由来 imageId (dataTransfer.getData("imageId")) → onImageId
//       b) OS ファイル群 (image/* のみ) → natural-sort して 1 件ずつ onFile を await
//          (legacy DropHelper: 「foreach 同時投げは不具合 → 素直に for で順番保証」を踏襲)
//
// imageId 経路はファイル経路より優先する (legacy DropHelper と同順)。
// 配置先 (どの slide にどう置くか) は呼び出し側 (SlideEditView / SlideListPanel) の責務。

export interface UseDropHandlers {
	onDragOver: (e: ReactDragEvent) => void;
	onDragLeave: (e: ReactDragEvent) => void;
	onDrop: (e: ReactDragEvent) => void;
}

export interface UseDropResult {
	/** ドラッグ要素が zone 上にある間 true (ハイライト表示用)。 */
	isOver: boolean;
	/** drop zone 要素へそのまま spread する DnD ハンドラ群。 */
	dropProps: UseDropHandlers;
}

export interface UseDropOptions {
	/** パレットからドラッグされた imageId が drop されたとき。 */
	onImageId?: (imageId: string) => void | Promise<void>;
	/** OS ファイル (image/*) が drop されたとき。natural-sort 済みで 1 件ずつ呼ばれる。 */
	onFile?: (file: File) => void | Promise<void>;
	/** true の間は dragover ハイライトも drop 処理も行わない (mobile pwa 等で閲覧専用化)。 */
	disabled?: boolean;
}

export const useDrop = (options: UseDropOptions = {}): UseDropResult => {
	const { onImageId, onFile, disabled = false } = options;
	const [isOver, setIsOver] = useState(false);

	const onDragOver = useCallback(
		(e: ReactDragEvent) => {
			if (disabled) return;
			// drop イベント発火のために dragover での preventDefault は必須。
			e.preventDefault();
			if (e.dataTransfer) e.dataTransfer.dropEffect = "copy";
			setIsOver(true);
		},
		[disabled]
	);

	const onDragLeave = useCallback((e: ReactDragEvent) => {
		// 子要素間の移動 (relatedTarget が zone 内) ではちらつかせない。
		const related = e.relatedTarget as Node | null;
		if (related && (e.currentTarget as Node).contains(related)) return;
		setIsOver(false);
	}, []);

	const onDrop = useCallback(
		async (e: ReactDragEvent) => {
			if (disabled) return;
			e.preventDefault();
			setIsOver(false);
			const dt = e.dataTransfer;
			if (!dt) return;

			// a) パレット由来 imageId 優先 (legacy DropHelper と同順)
			const imageId = dt.getData("imageId");
			if (imageId && imageId.length > 0) {
				await onImageId?.(imageId);
				return;
			}

			// b) OS ファイル: image/* のみ、natural-sort で順序を決め、逐次処理
			const files = Array.from(dt.files ?? []).filter((f) => f.type.startsWith("image/"));
			files.sort((a, b) => naturalCompare(a.name, b.name));
			for (const f of files) {
				await onFile?.(f);
			}
		},
		[disabled, onImageId, onFile]
	);

	return { isOver, dropProps: { onDragOver, onDragLeave, onDrop } };
};
