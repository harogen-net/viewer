import { create } from "zustand";

// スライドショーの起動状態 + 再生設定 (§9)。
// legacy はツールバーの #interval / #duration / #cb_fullscreen / #cb_mirrorH/V から
// 取得していた。新側はこれらを SlideShowOpsPanel で編集し本 store に集約する
// (HVD には保存しない = セッション設定。legacy も doc には持たなかった)。

export const INTERVAL_DEFAULT_MS = 6000; // legacy #interval 既定
export const DURATION_DEFAULT_MS = 2000; // legacy #duration 既定 (クロスフェード時間)

interface SlideshowState {
	/** スライドショー実行中か (SlideshowShell の open に対応)。 */
	running: boolean;
	/** 自動進行間隔 (ms)。 */
	intervalMs: number;
	/** クロスフェード時間 (ms)。 */
	durationMs: number;
	/** 水平反転 (mirrorH)。 */
	flipX: boolean;
	/** 垂直反転 (mirrorV)。 */
	flipY: boolean;
	/** 開始時に全画面化するか。 */
	startFullscreen: boolean;

	start: () => void;
	stop: () => void;
	setIntervalMs: (ms: number) => void;
	setDurationMs: (ms: number) => void;
	setFlipX: (v: boolean) => void;
	setFlipY: (v: boolean) => void;
	toggleFlipX: () => void;
	toggleFlipY: () => void;
	setStartFullscreen: (v: boolean) => void;
}

export const useSlideshowStore = create<SlideshowState>()((set) => ({
	running: false,
	intervalMs: INTERVAL_DEFAULT_MS,
	durationMs: DURATION_DEFAULT_MS,
	flipX: false,
	flipY: false,
	startFullscreen: false,

	start: () => set({ running: true }),
	stop: () => set({ running: false }),
	setIntervalMs: (ms) => set({ intervalMs: Math.max(0, ms) }),
	setDurationMs: (ms) => set({ durationMs: Math.max(0, ms) }),
	setFlipX: (v) => set({ flipX: v }),
	setFlipY: (v) => set({ flipY: v }),
	toggleFlipX: () => set((s) => ({ flipX: !s.flipX })),
	toggleFlipY: () => set((s) => ({ flipY: !s.flipY })),
	setStartFullscreen: (v) => set({ startFullscreen: v }),
}));
