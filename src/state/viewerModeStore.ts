import { isMobileEnv } from "@/utils/mobileDetect";
import { create } from "zustand";

// 起動モード (v4 Group D 補間 + mobile PWA 対応)。
// レガシー Viewer.startUpMode (VIEW_AND_EDIT / VIEW_ONLY) 相当 + spec §2 の mobile 判定を合流。
//
// 判定優先順位 (docs/mode-spec.md §2.2):
//   1. URL クエリ `?mode=view` (最優先。PC でも手動で view にできる)
//   2. mobile PWA 環境 (standalone + mobile UA/viewport) → 自動で VIEW
//   3. それ以外は EDIT (既定)
//
// アプリ内トグルは持たない (レガシー同様、起動時に確定)。
// store にしてあるのはテストで mode を差し替えられるようにするため。
//
// 文字列 union ではなく const オブジェクト + 派生型 (LayerType / AlertKind と同方針)。

export const ViewerMode = {
	EDIT: "edit",
	VIEW: "view",
} as const;
export type ViewerMode = (typeof ViewerMode)[keyof typeof ViewerMode];

/** URL search と mobile 判定から起動モードを解決する純関数。 */
export const resolveViewerMode = (search: string, mobile: boolean): ViewerMode => {
	const q = new URLSearchParams(search).get("mode");
	if (q === ViewerMode.VIEW) return ViewerMode.VIEW;
	if (mobile) return ViewerMode.VIEW;
	return ViewerMode.EDIT;
};

/** 編集可能か。書込 action の gate に使う (§3 action-level reject)。 */
export const isEditable = (mode: ViewerMode): boolean => mode === ViewerMode.EDIT;

/**
 * mutation hook の先頭で呼ぶ gate (§3)。
 * VIEW モードでは false を返し、呼出側は early return する (silent no-op)。
 * throw ではなく silent にするのは、キーボードショートカット等の暴発で UI エラーを
 * 出さないため。開発時デバッグ用に console.warn だけ残す。
 */
export const canEditNow = (action?: string): boolean => {
	if (isEditable(useViewerModeStore.getState().mode)) return true;
	if (action) console.warn(`[viewerMode] rejected in VIEW mode: ${action}`);
	return false;
};

interface ViewerModeState {
	mode: ViewerMode;
	/** mobile PWA 環境か (VIEW モード自動切替に使用、feature gate ではない)。 */
	isMobileEnv: boolean;
}

const initialMobile = isMobileEnv();
const initialSearch = typeof window !== "undefined" ? window.location.search : "";

export const useViewerModeStore = create<ViewerModeState>()(() => ({
	mode: resolveViewerMode(initialSearch, initialMobile),
	isMobileEnv: initialMobile,
}));

/** 編集可能か (React 用 selector hook)。mutation hook の gate 判定に使う。 */
export const useCanEdit = (): boolean => useViewerModeStore((s) => isEditable(s.mode));
