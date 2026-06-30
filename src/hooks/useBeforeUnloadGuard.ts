import { useViewerDocumentStore } from "@/state/viewerDocumentStore";
import { useEffect } from "react";

// 未保存変更がある状態でのタブ閉じ / リロード / 離脱を警告する (v4 Group D 補間、§0-10 新側内製)。
// アプリ内の document 置換 (ロード/新規/import) は FileIOPanel の confirmDiscardIfModified が
// 確認するが、ブラウザの閉じる/更新はそれを経由しないため beforeunload で別途ガードする。
//
// modified=true の間だけ listener を張る。離脱を抑止するには preventDefault に加え
// returnValue へ文字列をセットする必要がある (旧 Chrome 互換)。実際の確認文言は
// ブラウザ既定 (任意文言の表示は現行ブラウザでは不可)。
export const useBeforeUnloadGuard = (): void => {
	const modified = useViewerDocumentStore((s) => s.modified);

	useEffect(() => {
		if (!modified) return;
		const handler = (e: BeforeUnloadEvent): void => {
			e.preventDefault();
			e.returnValue = "";
		};
		window.addEventListener("beforeunload", handler);
		return () => window.removeEventListener("beforeunload", handler);
	}, [modified]);
};
