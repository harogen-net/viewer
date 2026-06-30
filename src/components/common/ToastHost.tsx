import { Notification } from "@mantine/core";
import type { CSSProperties, FC } from "react";
import { useCallback, useEffect, useState } from "react";
import { type ToastItem, ToastKind, useToastStore } from "../../state/toastStore";

// トースト描画ホスト (非ブロッキング・自動消滅・複数スタック)。AppShell に 1 つだけマウントする。
// toastStore.toasts を画面右下に縦積みで描画し、各アイテムが個別タイマで自動消滅する。
// モーダル (AlertHost) と関心分離 (こちらは Promise を介さない一方向通知)。
//
// アニメーション: 出現時は右からスライドイン、消滅時 (自動 or 手動 close) はフェードアウト。
// 消滅は 2 段: exiting=true で退場アニメ → アニメ完了後に store から除去 (即除去だと退場が見えない)。

// モーダル (Mantine Modal は ~200番台) / スライドショー overlay (9999) より上に出す。
const Z_INDEX = 100000;
// 退場 (フェードアウト) アニメ時間 (ms)。
const EXIT_MS = 200;

// 右からのスライドイン + フェードアウトの keyframes。
// 出現は translateX(24px)→0 + opacity、退場は逆 + opacity:0 を forwards で保持。
const TOAST_ANIM_CSS = `
	@keyframes toastSlideIn {
		from { opacity: 0; transform: translateX(24px); }
		to   { opacity: 1; transform: translateX(0); }
	}
	@keyframes toastFadeOut {
		from { opacity: 1; transform: translateX(0); }
		to   { opacity: 0; transform: translateX(24px); }
	}
`;

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
	const [exiting, setExiting] = useState(false);
	// 退場開始 (自動消滅タイマ満了 / 手動 close の両方からここを通す)。
	const beginExit = useCallback(() => setExiting(true), []);

	// 自動消滅: duration 経過で退場開始 (即除去ではなくフェードアウトさせる)。
	useEffect(() => {
		if (toast.duration <= 0) return; // duration<=0 は手動 close のみ
		const timer = window.setTimeout(beginExit, toast.duration);
		return () => window.clearTimeout(timer);
	}, [toast.duration, beginExit]);

	// 退場アニメ完了後に store から除去 (これで DOM から消える)。
	useEffect(() => {
		if (!exiting) return;
		const timer = window.setTimeout(() => onDismiss(toast.id), EXIT_MS);
		return () => window.clearTimeout(timer);
	}, [exiting, toast.id, onDismiss]);

	const animation = exiting
		? `toastFadeOut ${EXIT_MS}ms ease forwards`
		: "toastSlideIn 220ms cubic-bezier(.2,.8,.2,1)";

	return (
		<Notification
			color={kindColor[toast.kind]}
			title={toast.title}
			withCloseButton
			onClose={beginExit}
			style={{ pointerEvents: "auto", boxShadow: "0 2px 12px rgba(0,0,0,0.18)", animation }}
			data-toast
			data-toast-kind={toast.kind}
			data-toast-exiting={exiting ? "true" : "false"}>
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
			<style>{TOAST_ANIM_CSS}</style>
			{toasts.map((toast) => (
				<ToastEntry key={toast.id} toast={toast} onDismiss={dismiss} />
			))}
		</div>
	);
};
