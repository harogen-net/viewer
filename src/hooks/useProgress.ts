import { useViewerDocumentStore } from "@/state/viewerDocumentStore";
import { useCallback } from "react";

/** 進捗レポート関数。0..1 の割合を渡す (内部で 0.999 上限にクランプ = report では完了させない)。 */
export type ProgressReporter = (fraction: number) => void;

export interface UseProgress {
	/**
	 * 非同期タスクをグローバル進捗バー付きで実行する。バーが消えるのは 2 つの場合のみ:
	 *   - タスクが非 null を返す = 正常完了 → progress を 1 にして「100% まで伸ばし切る」アニメで自然消滅。
	 *   - タスクが null を返す / 例外を投げる = キャンセル/エラー = 明示的 Abort → progress を null にして即消し。
	 * report(fraction) は 0..0.999 に制限され、途中でバーを完了させない。
	 * report を一度も呼ばなければバーは出ない (高速処理はチラつかせない)。
	 */
	run: <T>(label: string, task: (report: ProgressReporter) => Promise<T>) => Promise<T>;
}

export const useProgress = (): UseProgress => {
	const run = useCallback(
		async <T>(label: string, task: (report: ProgressReporter) => Promise<T>): Promise<T> => {
			const setProgress = useViewerDocumentStore.getState().setProgress;
			// report は完了 (>=1) させない。完了は成功時にのみ明示的に行う。
			const report: ProgressReporter = (fraction) =>
				setProgress(Math.min(0.999, Math.max(0, fraction)), label);
			try {
				const result = await task(report);
				// null = キャンセル (PW 未入力等) → 明示的 Abort。非 null = 正常完了 → 100% へ。
				setProgress(result == null ? null : 1, label);
				return result;
			} catch (e) {
				setProgress(null); // エラー = Abort → 即消し
				throw e;
			}
		},
		[]
	);
	return { run };
};
