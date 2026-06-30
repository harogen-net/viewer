import { useCallback } from "react";
import { useAlert } from "../../../hooks/useAlert";
import { useToast } from "../../../hooks/useToast";
import { useViewerDocumentStore } from "../../../state/viewerDocumentStore";

/**
 * FileIOToolbar / FileIOSubMenu が共有する非同期アクション補助。
 * - wrap: 非同期ハンドラの例外を握って toast に出す共通エラーハンドラ
 * - confirmDiscardIfModified: document 置換 (新規 / ロード / import) 前の未保存変更ガード
 */
export const useFileIOCommon = () => {
	const alert = useAlert();
	const toast = useToast();

	// useToast / useAlert は getState ベースで stable な ref を返すため deps は安定。
	const wrap = useCallback(
		(action: () => Promise<void>) => async () => {
			try {
				await action();
			} catch (e) {
				console.error("[FileIOPanel] error:", e);
				toast.error(`エラー: ${String(e)}`);
			}
		},
		[toast]
	);

	// modified は最新を getState() で読む (load/new/import 後は setDocument が false にリセット)。
	const confirmDiscardIfModified = useCallback(async (): Promise<boolean> => {
		if (!useViewerDocumentStore.getState().modified) return true;
		return alert.confirm("未保存の変更があります。破棄して続行しますか?", {
			okLabel: "破棄して続行",
			cancelLabel: "キャンセル",
		});
	}, [alert]);

	return { wrap, confirmDiscardIfModified };
};
