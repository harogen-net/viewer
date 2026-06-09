export type AppRuntimeMode = "browser" | "mobile-pwa";

export function resolveRuntimeMode(search: string = window.location.search): AppRuntimeMode {
	const forcedMode = getForcedMode(search);
	if (forcedMode) return forcedMode;

	if (isStandaloneDisplayMode() && isMobileDevice()) {
		return "mobile-pwa";
	}

	return "browser";
}

function getForcedMode(search: string): AppRuntimeMode | null {
	try {
		const params = new URLSearchParams(search || "");
		const mode = params.get("mode");
		if (mode === "browser") return "browser";
		if (mode === "mobile") return "mobile-pwa";
	} catch (e) {
		// Ignore malformed query string and continue with normal resolution.
	}

	return null;
}

function isStandaloneDisplayMode(): boolean {
	try {
		return window.matchMedia("(display-mode: standalone)").matches;
	} catch (e) {
		return false;
	}
}

function isMobileDevice(): boolean {
	const ua = navigator.userAgent || "";
	const isMobileUA = /Android|iPhone|iPad|iPod|Mobile/i.test(ua);
	const isSmallViewport = Math.min(window.innerWidth, window.innerHeight) <= 900;

	return isMobileUA || isSmallViewport;
}
