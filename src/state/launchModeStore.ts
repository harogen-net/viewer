import { isMobileEnv } from "@/utils/mobileDetect";
import { create } from "zustand";

// 起動モード = モードの軸 A (docs/mode-spec.md §1)。端末で決まり、実行中は変わらない。
//   PCモード     … 編集可能。PC ブラウザ起動時。
//   スマホモード … 閲覧中心。スマホ起動時 (PWA / ブラウザ問わず)。
//
// 画面モードの軸 B (一覧モード / 編集モード = slideStore.editingIndex) とは別軸。
// 「編集モード」は軸 B の呼び名なので、この軸の値に EDIT/VIEW という名前は使わない
// (以前 ViewerMode.EDIT/VIEW という命名で軸を混同し、実装を誤ったことがある)。
//
// レガシー Viewer.startUpMode (VIEW_AND_EDIT / VIEW_ONLY) 相当。
//
// 判定優先順位 (docs/mode-spec.md §2.2):
//   1. URL クエリ `?mode=mobile` (最優先。PC でも手動でスマホモードにできる)
//   2. スマホ環境 (mobile UA / 小 viewport) → 自動でスマホモード
//   3. それ以外は PCモード (既定)
//
// アプリ内トグルは持たない (レガシー同様、起動時に確定)。
// store にしてあるのはテストで mode を差し替えられるようにするため。
//
// 文字列 union ではなく const オブジェクト + 派生型 (LayerType / AlertKind と同方針)。

export const LaunchMode = {
	PC: "pc",
	MOBILE: "mobile",
} as const;
export type LaunchMode = (typeof LaunchMode)[keyof typeof LaunchMode];

/**
 * `?mode=` でスマホモードを指定する値。`mobile` が正、`view` は旧名の互換
 * (改名前は `?mode=view` だったため、既存のブックマークを壊さないよう受け続ける)。
 */
const MOBILE_QUERY_VALUES = ["mobile", "view"];

/** URL search とスマホ環境判定から起動モードを解決する純関数。 */
export const resolveLaunchMode = (search: string, mobile: boolean): LaunchMode => {
	const q = new URLSearchParams(search).get("mode");
	if (q !== null && MOBILE_QUERY_VALUES.includes(q)) return LaunchMode.MOBILE;
	if (mobile) return LaunchMode.MOBILE;
	return LaunchMode.PC;
};

/** PCモードか。書込 gate と UI の出し分けの基準 (§3 action-level reject)。 */
export const isPcMode = (mode: LaunchMode): boolean => mode === LaunchMode.PC;

/**
 * 書込操作の種別 (docs/mode-spec.md §3.1)。スマホモードで通す範囲を操作単位で決めるために持つ。
 *
 * 当初は「スマホモードなら全書込を拒否」の二値だったが、スマホで
 * スライドショーの見え方だけは調整したいという要求が出た。全部開けると文書構造や
 * レイヤーまで触れてしまうので、再生設定だけを別種別として切り出す。
 *
 * 名前が "Write" なのは、軸 B の「編集モード」と語を衝突させないため。
 */
export const WriteCapability = {
	/** 文書構造・レイヤー・画像・保存など書込全般。PCモード限定。 */
	FULL: "full",
	/**
	 * スライド単位の再生設定 (有効/無効・表示尺・結合)。スマホモードでも許可する。
	 * 破壊的でなく (スライドもレイヤーも消えない)、スライドショーの見え方だけが変わる操作に限る。
	 * 追加/削除/複製/並び替えと一括操作は含めない。
	 */
	SLIDE_PLAYBACK: "slidePlayback",
} as const;
export type WriteCapability = (typeof WriteCapability)[keyof typeof WriteCapability];

/** その操作種別が現在の起動モードで許可されるか (純関数)。 */
export const isWriteAllowed = (mode: LaunchMode, capability: WriteCapability): boolean =>
	isPcMode(mode) || capability === WriteCapability.SLIDE_PLAYBACK;

/**
 * mutation hook の先頭で呼ぶ gate (§3)。
 * 許可されない操作は false を返し、呼出側は early return する (silent no-op)。
 * throw ではなく silent にするのは、キーボードショートカット等の暴発で UI エラーを
 * 出さないため。開発時デバッグ用に console.warn だけ残す。
 */
export const canWriteNow = (
	action?: string,
	capability: WriteCapability = WriteCapability.FULL
): boolean => {
	if (isWriteAllowed(useLaunchModeStore.getState().mode, capability)) return true;
	if (action) console.warn(`[launchMode] rejected in スマホモード: ${action}`);
	return false;
};

interface LaunchModeState {
	mode: LaunchMode;
	/** スマホ環境か (スマホモード自動切替に使用、feature gate ではない)。 */
	isMobileEnv: boolean;
}

const initialMobile = isMobileEnv();
const initialSearch = typeof window !== "undefined" ? window.location.search : "";

export const useLaunchModeStore = create<LaunchModeState>()(() => ({
	mode: resolveLaunchMode(initialSearch, initialMobile),
	isMobileEnv: initialMobile,
}));

/** PCモードか (React 用 selector hook)。UI の出し分けに使う。 */
export const useIsPcMode = (): boolean => useLaunchModeStore((s) => isPcMode(s.mode));
