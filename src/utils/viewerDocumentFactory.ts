import type { ViewerDocument } from "@/types/ViewerDocument";

// 新規 ViewerDocument を生成する factory (v3 Group B、§0-10 新側内製)。
//
// width/height は実行環境のディスプレイサイズ (landscape 向き) から取る:
//   width  = max(window.screen.width, window.screen.height)
//   height = min(window.screen.width, window.screen.height)
// legacy `Viewer.SCREEN_WIDTH` / `Viewer.SCREEN_HEIGHT` (src/Viewer.ts L31-32)
// と同等の挙動。

/** 標準フォールバック (window が無い test/SSR 環境用)。 */
const FALLBACK_WIDTH = 1920;
const FALLBACK_HEIGHT = 1080;

function detectDisplaySize(): { width: number; height: number } {
	if (typeof window === "undefined" || typeof window.screen === "undefined") {
		return { width: FALLBACK_WIDTH, height: FALLBACK_HEIGHT };
	}
	const w = window.screen.width;
	const h = window.screen.height;
	return { width: Math.max(w, h), height: Math.min(w, h) };
}

/**
 * 新規 ViewerDocument を生成する。
 * - title: "(new)"
 * - width/height: 実行環境のディスプレイ landscape 寸法
 * - bgColor: 白 (#ffffff)。SlideView は bgColor 未指定時に白で描画するため、その既定と一致させる。
 * - createTime/editTime: 引数 now (省略時は Date.now())
 * - slides: 空配列
 */
export function createNewViewerDocument(now: number = Date.now()): ViewerDocument {
	const { width, height } = detectDisplaySize();
	return {
		title: "(new)",
		width,
		height,
		bgColor: "#ffffff",
		createTime: now,
		editTime: now,
		slides: [],
	};
}
