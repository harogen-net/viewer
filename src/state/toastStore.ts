import { create } from "zustand";

// トースト通知 (非ブロッキング・自動消滅・複数スタック) の状態 (v4 Group D 補間)。
// モーダル (alertStore: 単一 request・ブロッキング) とは寿命特性が異なるため別 store。
// 自動消滅タイマは ToastHost 側が持つ (store は純粋・タイマ非保持)。

export const ToastKind = {
	SUCCESS: "success",
	ERROR: "error",
	INFO: "info",
} as const;
export type ToastKind = (typeof ToastKind)[keyof typeof ToastKind];

export interface ToastItem {
	id: number;
	message: string;
	kind: ToastKind;
	title?: string;
	/** 自動消滅までの ms (ToastHost が使用)。 */
	duration: number;
}

interface ToastStoreState {
	toasts: ToastItem[];
	/** トーストを 1 件追加し、その id を返す。 */
	show: (input: Omit<ToastItem, "id">) => number;
	/** id 一致のトーストを除去 (該当なしは no-op)。 */
	dismiss: (id: number) => void;
}

// id 採番はモジュールスコープの単調増加カウンタ (Date.now/Math.random は使わない = 決定的)。
let nextToastId = 1;

export const useToastStore = create<ToastStoreState>()((set) => ({
	toasts: [],
	show: (input) => {
		const id = nextToastId++;
		set((s) => ({ toasts: [...s.toasts, { ...input, id }] }));
		return id;
	},
	dismiss: (id) =>
		set((s) => {
			if (!s.toasts.some((t) => t.id === id)) return s;
			return { toasts: s.toasts.filter((t) => t.id !== id) };
		}),
}));
