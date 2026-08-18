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
 * 書込操作の種別 (docs/mode-spec.md §3)。VIEW モードで通す範囲を操作単位で決めるために持つ。
 *
 * 当初は「VIEW モードなら全書込を拒否」の二値だったが、スマホ (常に VIEW) で
 * スライドショーの見え方だけは調整したいという要求が出た。全部開けると文書構造や
 * レイヤーまで触れてしまうので、再生設定だけを別種別として切り出す。
 */
export const EditCapability = {
	/** 文書構造・レイヤー・画像・保存など編集全般。EDIT モード限定。 */
	FULL: "full",
	/**
	 * スライド単位の再生設定 (有効/無効・表示尺・結合)。VIEW モードでも許可する。
	 * 破壊的でなく (スライドもレイヤーも消えない)、スライドショーの見え方だけが変わる操作に限る。
	 * 追加/削除/複製/並び替えと一括操作は含めない。
	 */
	SLIDE_PLAYBACK: "slidePlayback",
} as const;
export type EditCapability = (typeof EditCapability)[keyof typeof EditCapability];

/** その操作種別が現在のモードで許可されるか (純関数)。 */
export const isCapabilityAllowed = (mode: ViewerMode, capability: EditCapability): boolean =>
	isEditable(mode) || capability === EditCapability.SLIDE_PLAYBACK;

/**
 * mutation hook の先頭で呼ぶ gate (§3)。
 * 許可されない操作は false を返し、呼出側は early return する (silent no-op)。
 * throw ではなく silent にするのは、キーボードショートカット等の暴発で UI エラーを
 * 出さないため。開発時デバッグ用に console.warn だけ残す。
 */
export const canEditNow = (
	action?: string,
	capability: EditCapability = EditCapability.FULL
): boolean => {
	if (isCapabilityAllowed(useViewerModeStore.getState().mode, capability)) return true;
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

/** 操作種別ごとの可否 (React 用 selector hook)。UI の出し分けに使う。 */
export const useCanEditCapability = (capability: EditCapability): boolean =>
	useViewerModeStore((s) => isCapabilityAllowed(s.mode, capability));
