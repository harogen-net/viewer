type NoticeVariant = "error" | "info";

let hideTimer: number | undefined;
let lastMessage: string | undefined;
let lastShownAt = 0;

export function showNotice(message: string, variant: NoticeVariant = "error"): void {
  const host = document.getElementById("appNotice");
  if (!host) return;

  const now = Date.now();
  if (lastMessage == message && now - lastShownAt < 1200) {
    return;
  }

  lastMessage = message;
  lastShownAt = now;

  host.textContent = message;
  host.setAttribute("data-variant", variant);
  host.classList.add("visible");

  if (hideTimer) {
    window.clearTimeout(hideTimer);
  }

  hideTimer = window.setTimeout(() => {
    host.classList.remove("visible");
  }, 2600);
}
