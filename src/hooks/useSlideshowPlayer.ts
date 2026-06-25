import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Slide } from "../types/Slide";

// スライドショー タイムラインエンジン (§9、legacy SlideShowViewController の再実装、§0-10)。
// jQuery / DOMSlideView / setInterval クラス群は import せず、標準 setTimeout + hook で再構成。
//
// 担当 (DOM 非依存のロジックのみ。全画面/ミラー/カーソル等の view 操作は SlideshowShell):
//   - disabled スライド除外 (有効スライドのみで timeline 構成)
//   - 選択位置から開始 (startIndex を有効スライド内へマップ)
//   - 無限ループ (index % len、legacy slideShowFunc と同じ)
//   - durationRatio を考慮した 1 枚の表示時間 (interval * durationRatio)
//   - join 連動判定 (keep): 直前スライドが joining かつ可視レイヤー構造が同一なら
//     クロスフェードせず layer transform を tween (frame.key を据え置き = DOM 維持)
//   - 再生/一時停止/再開 (残り時間を保持して resume)、前へ/次へ
//
// frame.key: クロスフェード境界でのみ ++ する。keep (tween) 中は据え置き → 呼び出し側 (Stage)
// は同 key の間 DOM を維持し layer の transform を CSS transition で補間する。

export interface SlideshowFrame {
	/** クロスフェード単位の識別子。keep 中は不変、クロスフェードで +1。 */
	key: number;
	/** 表示するスライド (transform はスライド自身が保持)。 */
	slide: Slide;
	/** true = join 連動 (前 frame から transform を tween)、false = クロスフェード新規表示。 */
	tween: boolean;
}

export interface UseSlideshowPlayer {
	frame: SlideshowFrame | null;
	/** 1-based の現在位置 (有効スライド内)。 */
	position: number;
	/** 有効 (非 disabled) スライド数。 */
	enabledCount: number;
	paused: boolean;
	togglePause: () => void;
	next: () => void;
	prev: () => void;
}

interface UseSlideshowPlayerArgs {
	open: boolean;
	/** 全スライド (disabled 含む)。 */
	slides: Slide[];
	/** 開始スライドの全体 index (選択位置)。範囲外/disabled は有効先頭へ。 */
	startIndex: number;
	/** ViewerDocument.interval (ms)。0 以下なら自動進行しない。 */
	intervalMs: number;
}

// 連続 join 判定: prev が joining かつ 可視レイヤー構造 (種別 + image=imageId/isText / text=text) が一致。
// legacy SlideShowViewController.checkSlidesSame 準拠。
export const sameJoinStructure = (slide: Slide, prev: Slide | undefined): boolean => {
	if (!prev || !prev.joining) return false;
	const va = slide.layers.filter((l) => l.visible);
	const vb = prev.layers.filter((l) => l.visible);
	if (va.length === 0 || vb.length === 0) return false;
	if (va.length !== vb.length) return false;
	for (let i = 0; i < va.length; i++) {
		const l1 = va[i];
		const l2 = vb[i];
		if (l1.type !== l2.type) return false;
		if (l1.type === "image" && l2.type === "image") {
			if (l1.imageId !== l2.imageId) return false;
			if (l1.isText !== l2.isText) return false;
		} else if (l1.type === "text" && l2.type === "text") {
			if (l1.text !== l2.text) return false;
		} else if (l1.id !== l2.id) {
			return false;
		}
	}
	return true;
};

export const useSlideshowPlayer = ({
	open,
	slides,
	startIndex,
	intervalMs,
}: UseSlideshowPlayerArgs): UseSlideshowPlayer => {
	const enabled = useMemo(() => slides.filter((s) => !s.disabled), [slides]);
	const len = enabled.length;

	// 各有効スライドが「前スライドからの join 連動」か (ループ境界では末尾を前とみなす)。
	const keepFlags = useMemo(
		() => enabled.map((s, i) => sameJoinStructure(s, enabled[(i - 1 + len) % len])),
		[enabled, len]
	);

	// 開始位置 (全体 index → 有効スライド内 index)。
	const startEnabledIndex = useMemo(() => {
		if (startIndex < 0 || startIndex >= slides.length) return 0;
		// startIndex 以前(自身含む)で最も近い有効スライドの enabled 内位置。
		let target = slides[startIndex];
		if (target.disabled) {
			const fallback = slides
				.slice(0, startIndex + 1)
				.reverse()
				.find((s) => !s.disabled);
			target = fallback ?? enabled[0];
		}
		const idx = enabled.findIndex((s) => s === target);
		return idx < 0 ? 0 : idx;
	}, [slides, startIndex, enabled]);

	const [frame, setFrame] = useState<SlideshowFrame | null>(null);
	const [position, setPosition] = useState(1);
	const [paused, setPaused] = useState(false);

	const stepRef = useRef(0); // 有効スライド内の現在 index
	const keyRef = useRef(0);
	const timerRef = useRef<number | null>(null);
	const startedRef = useRef(0);
	const remainingRef = useRef(0);
	const initRef = useRef(true); // 初回表示 (keep でもクロスフェード扱い)

	const clearTimer = useCallback(() => {
		if (timerRef.current !== null) {
			window.clearTimeout(timerRef.current);
			timerRef.current = null;
		}
	}, []);

	const durationOf = useCallback(
		(ei: number) => intervalMs * (enabled[ei]?.durationRatio ?? 1),
		[intervalMs, enabled]
	);

	// 現在 step を frame として反映。tween は keep かつ非初回のときのみ。
	const show = useCallback(
		(ei: number, allowTween: boolean) => {
			const slide = enabled[ei];
			if (!slide) return;
			const tween = allowTween && keepFlags[ei] && !initRef.current;
			if (!tween) keyRef.current += 1; // クロスフェード境界
			setFrame({ key: keyRef.current, slide, tween });
			setPosition(ei + 1);
			initRef.current = false;
		},
		[enabled, keepFlags]
	);

	// 自動進行タイマーを (再)スケジュール。intervalMs<=0 / 単一スライドでは進めない。
	const scheduleNext = useCallback(
		(ms: number) => {
			clearTimer();
			if (intervalMs <= 0 || len <= 1) return;
			startedRef.current = Date.now();
			remainingRef.current = ms;
			timerRef.current = window.setTimeout(() => {
				const nextEi = (stepRef.current + 1) % len;
				stepRef.current = nextEi;
				show(nextEi, true);
				scheduleNext(durationOf(nextEi));
			}, ms);
		},
		[clearTimer, intervalMs, len, show, durationOf]
	);

	// open 時に開始位置から起動。close / slides 変化でリセット。
	useEffect(() => {
		if (!open || len === 0) {
			clearTimer();
			setFrame(null);
			return;
		}
		initRef.current = true;
		stepRef.current = startEnabledIndex;
		keyRef.current = 0;
		setPaused(false);
		show(startEnabledIndex, false);
		scheduleNext(durationOf(startEnabledIndex));
		return () => clearTimer();
	}, [open, len, startEnabledIndex, show, scheduleNext, durationOf, clearTimer]);

	const togglePause = useCallback(() => {
		if (intervalMs <= 0 || len <= 1) return;
		if (!paused) {
			// pause: 残り時間を保存してタイマー停止。
			const elapsed = Date.now() - startedRef.current;
			remainingRef.current = Math.max(0, remainingRef.current - elapsed);
			clearTimer();
			setPaused(true);
		} else {
			setPaused(false);
			scheduleNext(remainingRef.current);
		}
	}, [paused, intervalMs, len, clearTimer, scheduleNext]);

	const step = useCallback(
		(dir: 1 | -1) => {
			if (len === 0) return;
			const nextEi = (stepRef.current + dir + len) % len;
			stepRef.current = nextEi;
			show(nextEi, false); // 手動移動はクロスフェード (tween しない)
			setPaused(false);
			scheduleNext(durationOf(nextEi));
		},
		[len, show, durationOf, scheduleNext]
	);

	const next = useCallback(() => step(1), [step]);
	const prev = useCallback(() => step(-1), [step]);

	return { frame, position, enabledCount: len, paused, togglePause, next, prev };
};
