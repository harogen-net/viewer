import { ViewerBridge } from "../bridge/ViewerBridge";

type NoticeVariant = "error" | "info";

let lastMessage: string | undefined;
let lastShownAt = 0;
let noticeId = 0;

export function showNotice(message: string, variant: NoticeVariant = "error"): void {
	const normalizedMessage = String(message ?? "").trim();
	if (!normalizedMessage) return;

	const now = Date.now();
	if (lastMessage == normalizedMessage && now - lastShownAt < 1200) {
		return;
	}

	lastMessage = normalizedMessage;
	lastShownAt = now;
	noticeId += 1;
	ViewerBridge.emit("noticeChanged", {
		id: noticeId,
		message: normalizedMessage,
		variant,
	});
}
