import { create } from "zustand";

// 起動モード (v4 Group D 補間)。レガシー Viewer.startUpMode (VIEW_AND_EDIT / VIEW_ONLY) 相当。
// URL の ?mode=view で閲覧モード、それ以外は編集モード (既定)。アプリ内トグルは持たない
// (レガシー同様、起動時に確定)。store にしてあるのはテストで mode を差し替えられるようにするため。
//
// 文字列 union ではなく const オブジェクト + 派生型 (LayerType / AlertKind と同方針)。

export const ViewerMode = {
	EDIT: "edit",
	VIEW: "view",
} as const;
export type ViewerMode = (typeof ViewerMode)[keyof typeof ViewerMode];

/** URL search (?mode=view) から起動モードを解決する純関数。 */
export const resolveViewerMode = (search: string): ViewerMode =>
	new URLSearchParams(search).get("mode") === ViewerMode.VIEW ? ViewerMode.VIEW : ViewerMode.EDIT;

interface ViewerModeState {
	mode: ViewerMode;
}

export const useViewerModeStore = create<ViewerModeState>()(() => ({
	mode: resolveViewerMode(typeof window !== "undefined" ? window.location.search : ""),
}));
