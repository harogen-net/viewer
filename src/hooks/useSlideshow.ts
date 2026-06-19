import { useEffect } from "react";
import type { Slide } from "../types/Slide";

// スライドショー自動進行タイマー (v3 Group A build 6、§0-10 新側内製)。
// レガシー src/viewController/SlideShowViewController.ts のタイマーロジックを
// 純粋関数 / hook として再実装 (jQuery / setInterval 抽象クラス類は使わず
// 標準の setTimeout のみ)。
//
// 設計:
// - enabled=false なら何もしない (一時停止)
// - 現在 slide が disabled なら待たずに次へ (durationRatio 適用なし)
// - 通常は intervalMs * (durationRatio ?? 1) ms 後に次の index へ進む
// - 末尾に到達したら停止 (loop しない、レガシー挙動と同じ)
// - useEffect の cleanup で setTimeout を確実に解除
//
// 注: transition duration (ViewerDocument.duration、フェード時間) は
// 表示時間に加算しない (レガシー実装と同じ独立分離扱い)。

interface UseSlideshowOptions {
	/** タイマーを動かすか (false なら停止)。 */
	enabled: boolean;
	/** スライド配列 (slideStore から)。 */
	slides: Slide[];
	/** 現在表示中の index (SlideshowShell が管理)。 */
	index: number;
	/** index を変更する setter (React.useState の setter 互換シグネチャ)。 */
	setIndex: (next: number | ((prev: number) => number)) => void;
	/** ViewerDocument.interval (ms)。未指定/0 なら自動進行は事実上停止扱い。 */
	intervalMs: number;
}

export function useSlideshow({ enabled, slides, index, setIndex, intervalMs }: UseSlideshowOptions): void {
	useEffect(() => {
		if (!enabled) return;
		if (slides.length === 0) return;
		if (intervalMs <= 0) return;
		const current = slides[index];
		if (!current) return;

		// disabled な slide は表示せず即次へ。末尾なら停止。
		if (current.disabled) {
			if (index < slides.length - 1) setIndex(index + 1);
			return;
		}

		const wait = intervalMs * (current.durationRatio ?? 1);
		const id = window.setTimeout(() => {
			setIndex((i) => (i >= slides.length - 1 ? i : i + 1));
		}, wait);
		return () => window.clearTimeout(id);
	}, [enabled, slides, index, intervalMs, setIndex]);
}
