import { create } from "zustand";

// 汎用モーダル (alert / confirm / prompt) の単一リクエスト状態。
// window.alert/confirm/prompt は同期ブロッキングだが、本モーダルは非同期 (Promise)。
// useAlert がリクエストを積み、AlertHost が描画して resolve する。
// 同時に 1 件のみ (後勝ちにはせず、表示中は新規リクエストの resolve(キャンセル相当) で畳む運用は
// 呼び出し側が await 直列化する前提)。

export const AlertKind = {
	ALERT: "alert",
	CONFIRM: "confirm",
	PROMPT: "prompt",
	CHOICE: "choice",
} as const;
export type AlertKind = (typeof AlertKind)[keyof typeof AlertKind];

/** choice ダイアログの 1 選択肢 (value = resolve される識別子、label = 表示文言)。 */
export interface AlertChoice {
	value: string;
	label: string;
}

export interface AlertRequest {
	kind: AlertKind;
	message: string;
	title?: string;
	okLabel?: string;
	cancelLabel?: string;
	/** prompt の初期値。 */
	defaultValue?: string;
	/** choice の選択肢 (kind=CHOICE のときのみ)。各ボタンが value で resolve する。 */
	choices?: AlertChoice[];
	/**
	 * OK = (confirm:true / prompt:入力文字列 / alert:null) / キャンセル = (confirm:false / prompt:null)。
	 * choice = 選んだ value (X/Esc/overlay での dismiss は null)。
	 */
	resolve: (value: boolean | string | null) => void;
}

interface AlertStoreState {
	request: AlertRequest | null;
	setRequest: (request: AlertRequest) => void;
	clear: () => void;
}

export const useAlertStore = create<AlertStoreState>()((set) => ({
	request: null,
	setRequest: (request) => set({ request }),
	clear: () => set({ request: null }),
}));
