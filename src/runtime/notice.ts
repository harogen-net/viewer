type NoticeVariant = "error" | "info";

let hideTimer: number | undefined;

export function showNotice(message: string, variant: NoticeVariant = "error"): void {
  const host = document.getElementById("appNotice");
  if (!host) return;

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
