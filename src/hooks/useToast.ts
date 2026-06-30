import { ToastKind, useToastStore } from "@/state/toastStore";
import { useMemo } from "react";

// トースト通知の発火 hook (useAlert と同じ useMemo + getState パターン)。
// 非ブロッキング (Promise を返さない fire-and-forget)。描画/自動消滅は ToastHost が担う。
//   toast.success("保存しました")
//   toast.error("失敗しました", { title: "保存エラー" })

const DEFAULT_DURATION_MS = 3000;
const ERROR_DURATION_MS = 5000;

export interface ToastOptions {
	title?: string;
	duration?: number;
}

export interface UseToast {
	show: (message: string, opts?: ToastOptions & { kind?: ToastKind }) => number;
	success: (message: string, opts?: ToastOptions) => number;
	error: (message: string, opts?: ToastOptions) => number;
	info: (message: string, opts?: ToastOptions) => number;
}

export const useToast = (): UseToast =>
	useMemo(() => {
		const show = useToastStore.getState().show;
		const emit = (kind: ToastKind, message: string, opts?: ToastOptions): number =>
			show({
				kind,
				message,
				title: opts?.title,
				duration:
					opts?.duration ?? (kind === ToastKind.ERROR ? ERROR_DURATION_MS : DEFAULT_DURATION_MS),
			});
		return {
			show: (message, opts) => emit(opts?.kind ?? ToastKind.INFO, message, opts),
			success: (message, opts) => emit(ToastKind.SUCCESS, message, opts),
			error: (message, opts) => emit(ToastKind.ERROR, message, opts),
			info: (message, opts) => emit(ToastKind.INFO, message, opts),
		};
	}, []);
