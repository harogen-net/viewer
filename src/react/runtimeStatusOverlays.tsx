import { Paper, Progress, Text } from "@mantine/core";
import { useEffect, useState } from "react";

// R5: 全画面 overlay (storage 進捗バー + 通知トースト) を `RuntimeShell` から分離。

export type RuntimeNoticePayload = {
	id: number;
	message: string;
	variant: "error" | "info";
} | null;

export function RuntimeProgress({ percentage }: { percentage: number }) {
	if (percentage <= 0 || percentage >= 1) return null;
	return (
		<Progress
			aria-label="Storage progress"
			value={Math.round(percentage * 100)}
			color="blue"
			size="xs"
			style={{
				position: "fixed",
				top: 0,
				left: 0,
				width: "100vw",
				zIndex: 2147483647,
			}}
		/>
	);
}

export function RuntimeNotice({ notice }: { notice: RuntimeNoticePayload }) {
	const [activeNotice, setActiveNotice] = useState<RuntimeNoticePayload>(null);

	useEffect(() => {
		if (!notice) return;
		setActiveNotice(notice);
		const hideTimer = window.setTimeout(() => {
			setActiveNotice(null);
		}, 2600);
		return () => window.clearTimeout(hideTimer);
	}, [notice?.id]);

	if (!activeNotice) return null;

	return (
		<Paper
			role="status"
			aria-live="polite"
			shadow="md"
			p="sm"
			radius="sm"
			style={{
				position: "fixed",
				left: 16,
				bottom: 16,
				zIndex: 2147483647,
				maxWidth: "min(78vw, 560px)",
				color: "#fff",
				background: activeNotice.variant === "error" ? "rgba(163, 35, 45, 0.96)" : "rgba(24, 78, 125, 0.96)",
				pointerEvents: "none",
			}}>
			<Text size="sm" c="inherit" lh={1.4}>
				{activeNotice.message}
			</Text>
		</Paper>
	);
}
