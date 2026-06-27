import { Notification } from "@mantine/core";
import type { CSSProperties, FC } from "react";
import { useEffect } from "react";
import { type ToastItem, ToastKind, useToastStore } from "../../state/toastStore";

// トースト描画ホスト (非ブロッキング・自動消滅・複数スタック)。AppShell に 1 つだけマウントする。
// toastStore.toasts を画面右下に縦積みで描画し、各アイテムが個別タイマで自動消滅する。
// モーダル (AlertHost) と関心分離 (こちらは Promise を介さない一方向通知)。

// モーダル (Mantine Modal は ~200番台) / スライドショー overlay (9999) より上に出す。
const Z_INDEX = 100000;

const containerStyle: CSSProperties = {
	position: "fixed",
	right: 16,
	bottom: 16,
	zIndex: Z_INDEX,
	display: "flex",
	flexDirection: "column",
	gap: 8,
	maxWidth: "min(92vw, 380px)",
	pointerEvents: "none", // 容器は素通り、各トースト (ボタン) のみ受ける
};

const kindColor: Record<ToastKind, string> = {
	[ToastKind.SUCCESS]: "green",
	[ToastKind.ERROR]: "red",
	[ToastKind.INFO]: "blue",
};

// 1 トースト = 1 子コンポーネント。個別に自動消滅タイマを張り、アンマウント/手動 close で解除。
const ToastEntry: FC<{ toast: ToastItem; onDismiss: (id: number) => void }> = ({
	toast,
	onDismiss,
}) => {
	useEffect(() => {
		if (toast.duration <= 0) return; // duration<=0 は手動 close のみ
		const timer = window.setTimeout(() => onDismiss(toast.id), toast.duration);
		return () => window.clearTimeout(timer);
	}, [toast.id, toast.duration, onDismiss]);

	return (
		<Notification
			color={kindColor[toast.kind]}
			title={toast.title}
			withCloseButton
			onClose={() => onDismiss(toast.id)}
			style={{ pointerEvents: "auto", boxShadow: "0 2px 12px rgba(0,0,0,0.18)" }}
			data-toast
			data-toast-kind={toast.kind}>
			<span data-toast-message>{toast.message}</span>
		</Notification>
	);
};

export const ToastHost: FC = () => {
	const toasts = useToastStore((s) => s.toasts);
	const dismiss = useToastStore((s) => s.dismiss);

	if (toasts.length === 0) return null;

	return (
		<div style={containerStyle} data-toast-host>
			{toasts.map((toast) => (
				<ToastEntry key={toast.id} toast={toast} onDismiss={dismiss} />
			))}
		</div>
	);
};
