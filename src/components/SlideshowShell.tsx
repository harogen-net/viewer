import type { CSSProperties, FC } from "react";
import { useCallback, useEffect, useRef, useState } from "react";
import { useSlideshowPlayer } from "../hooks/useSlideshowPlayer";
import { useSlideStore } from "../state/slideStore";
import { useSlideshowStore } from "../state/slideshowStore";
import { useViewerDocumentStore } from "../state/viewerDocumentStore";
import type { Slide } from "../types/Slide";
import { SlideshowStage } from "./slide/SlideshowStage";

// スライドショー全画面シェル (§9、legacy SlideShowViewController 相当)。
// タイムライン (選択開始/disabled除外/ループ/durationRatio/join keep/pause-resume/prev-next) は
// useSlideshowPlayer に委譲。本シェルは view 操作を担う:
//   - 全画面トグル (Fullscreen API)
//   - ミラー H/V トグル (SlideshowStage の container 反転 + text avoidMirror)
//   - カーソル自動非表示 (1 秒アイドルでカーソル + コントロール非表示)
//   - クロスフェード (key 変化で新フレームが fade-in、旧フレームを下に残し fade 後に除去)
//   - viewport フィット (短辺基準 scale、中央寄せ) + 背景色追従
//   - stage クリックで pause/resume (legacy slideContainer.mousedown)

interface SlideshowShellProps {
	open: boolean;
	onClose: () => void;
}

// interval / duration / flipX/Y / startFullscreen は SlideShowOpsPanel で編集し
// slideshowStore に集約 (legacy のツールバー散在 UI を 1 箇所へ)。
const CURSOR_IDLE_MS = 1000;

const overlayStyle = (cursorHidden: boolean): CSSProperties => ({
	position: "fixed",
	inset: 0,
	zIndex: 9999,
	background: "#000",
	overflow: "hidden",
	cursor: cursorHidden ? "none" : "default",
});

const controlsStyle = (visible: boolean): CSSProperties => ({
	position: "fixed",
	bottom: 16,
	left: "50%",
	transform: "translateX(-50%)",
	display: "flex",
	gap: 8,
	alignItems: "center",
	padding: "6px 12px",
	background: "rgba(255,255,255,0.85)",
	color: "#000",
	fontFamily: "monospace",
	fontSize: 13,
	borderRadius: 4,
	userSelect: "none",
	opacity: visible ? 1 : 0,
	transition: "opacity 200ms",
	pointerEvents: visible ? "auto" : "none",
});

const btnStyle: CSSProperties = {
	background: "transparent",
	border: "1px solid #444",
	padding: "2px 8px",
	cursor: "pointer",
	fontFamily: "inherit",
};

export const SlideshowShell: FC<SlideshowShellProps> = ({ open, onClose }) => {
	const slides = useSlideStore((s) => s.slides);
	const selectedIndex = useSlideStore((s) => s.selectedIndex);
	const meta = useViewerDocumentStore((s) => s.meta);
	const bgColor = meta?.bgColor;

	// 再生設定は slideshowStore (SlideShowOpsPanel で編集)。
	const intervalMs = useSlideshowStore((s) => s.intervalMs);
	const fadeMs = useSlideshowStore((s) => s.durationMs);
	const mirrorH = useSlideshowStore((s) => s.flipX);
	const mirrorV = useSlideshowStore((s) => s.flipY);
	const toggleFlipX = useSlideshowStore((s) => s.toggleFlipX);
	const toggleFlipY = useSlideshowStore((s) => s.toggleFlipY);
	const startFullscreen = useSlideshowStore((s) => s.startFullscreen);

	const { frame, position, enabledCount, paused, togglePause, next, prev } = useSlideshowPlayer({
		open,
		slides,
		startIndex: selectedIndex,
		intervalMs,
	});

	const overlayRef = useRef<HTMLDivElement>(null);
	const [isFullscreen, setIsFullscreen] = useState(false);
	const [cursorHidden, setCursorHidden] = useState(false);
	const [scale, setScale] = useState(1);

	// クロスフェード: key 変化で旧フレームを下層に残し、新フレームを fade-in。
	const [underSlide, setUnderSlide] = useState<Slide | null>(null);
	const prevKeyRef = useRef<number | null>(null);
	const prevSlideRef = useRef<Slide | null>(null);
	const fadeTimerRef = useRef<number | null>(null);

	useEffect(() => {
		if (!frame) {
			prevKeyRef.current = null;
			prevSlideRef.current = null;
			setUnderSlide(null);
			return;
		}
		const prevKey = prevKeyRef.current;
		if (prevKey !== null && prevKey !== frame.key && !frame.tween && prevSlideRef.current) {
			// クロスフェード: 直前スライドを下層に残し fade 後に除去。
			setUnderSlide(prevSlideRef.current);
			if (fadeTimerRef.current !== null) window.clearTimeout(fadeTimerRef.current);
			fadeTimerRef.current = window.setTimeout(() => setUnderSlide(null), fadeMs);
		}
		prevKeyRef.current = frame.key;
		prevSlideRef.current = frame.slide;
	}, [frame, fadeMs]);

	// 起動時: カーソル表示をリセットし、設定で「全画面で開始」なら全画面化を試みる。
	// (ミラーは slideshowStore の設定値をそのまま使うのでリセットしない)
	// biome-ignore lint/correctness/useExhaustiveDependencies: open 立ち上がりのみ
	useEffect(() => {
		if (!open) return;
		setCursorHidden(false);
		if (startFullscreen) overlayRef.current?.requestFullscreen?.().catch(() => {});
	}, [open]);

	// viewport フィット (短辺基準 scale)。背景・サイズ追従 (resize)。
	const slide = frame?.slide ?? null;
	useEffect(() => {
		if (!open || !slide) return;
		const compute = () => {
			setScale(Math.min(window.innerWidth / slide.width, window.innerHeight / slide.height));
		};
		compute();
		window.addEventListener("resize", compute);
		return () => window.removeEventListener("resize", compute);
	}, [open, slide]);

	// fullscreen 状態追従。
	useEffect(() => {
		if (!open) return;
		const onFs = () => setIsFullscreen(document.fullscreenElement === overlayRef.current);
		document.addEventListener("fullscreenchange", onFs);
		return () => document.removeEventListener("fullscreenchange", onFs);
	}, [open]);

	// カーソル自動非表示: mousemove で表示、CURSOR_IDLE_MS アイドルで非表示。
	const cursorTimerRef = useRef<number | null>(null);
	const onPointerActivity = useCallback(() => {
		setCursorHidden(false);
		if (cursorTimerRef.current !== null) window.clearTimeout(cursorTimerRef.current);
		cursorTimerRef.current = window.setTimeout(() => setCursorHidden(true), CURSOR_IDLE_MS);
	}, []);
	useEffect(() => {
		if (!open) return;
		onPointerActivity();
		return () => {
			if (cursorTimerRef.current !== null) window.clearTimeout(cursorTimerRef.current);
		};
	}, [open, onPointerActivity]);

	// キーボード: ESC 閉じる / ←→ 前後。
	useEffect(() => {
		if (!open) return;
		const onKey = (e: KeyboardEvent) => {
			if (e.key === "Escape") onClose();
			else if (e.key === "ArrowLeft") prev();
			else if (e.key === "ArrowRight") next();
		};
		window.addEventListener("keydown", onKey);
		return () => window.removeEventListener("keydown", onKey);
	}, [open, onClose, prev, next]);

	const toggleFullscreen = useCallback(() => {
		const el = overlayRef.current;
		if (!el) return;
		if (document.fullscreenElement === el) {
			document.exitFullscreen?.().catch(() => {});
		} else {
			el.requestFullscreen?.().catch(() => {});
		}
	}, []);

	if (!open) return null;

	if (enabledCount === 0 || !frame) {
		return (
			<div style={overlayStyle(false)} ref={overlayRef} data-slideshow-overlay>
				<div
					style={{
						position: "absolute",
						inset: 0,
						display: "flex",
						alignItems: "center",
						justifyContent: "center",
						color: "#fff",
						fontFamily: "monospace",
					}}>
					表示できる (有効な) スライドがありません
				</div>
				<div style={controlsStyle(true)}>
					<button type="button" style={btnStyle} onClick={onClose} data-ss="close">
						× close
					</button>
				</div>
			</div>
		);
	}

	const tweenMs = Math.max(1, intervalMs * (frame.slide.durationRatio ?? 1));
	// 中央寄せは flex ではなく absolute + translate(-50%,-50%) scale()。
	// stack の **レイアウト寸法はスケール前の doc サイズ** (transform は layout に影響しない) のため、
	// 表示領域が doc より狭いと flex の unsafe-center で中心がずれる (legacy は translate offset で
	// 明示中央寄せだった)。translate 中央寄せは scale 後も中心を viewport 中心へ固定する。
	const stackStyle: CSSProperties = {
		position: "absolute",
		left: "50%",
		top: "50%",
		width: frame.slide.width,
		height: frame.slide.height,
		transform: `translate(-50%, -50%) scale(${scale})`,
		transformOrigin: "center center",
	};
	const frameWrapStyle = (z: number, fade: boolean): CSSProperties => ({
		position: "absolute",
		inset: 0,
		zIndex: z,
		// 新フレームは fade-in (key で remount 時に再生)。keep tween は key 不変 = 再生しない。
		animation: fade ? `ssFadeIn ${fadeMs}ms ease both` : undefined,
	});

	return (
		<div
			style={overlayStyle(cursorHidden)}
			ref={overlayRef}
			data-slideshow-overlay
			onMouseMove={onPointerActivity}>
			<style>{"@keyframes ssFadeIn { from { opacity: 0 } to { opacity: 1 } }"}</style>
			{/* フィット中央寄せ + stage クリックで pause/resume (legacy slideContainer.mousedown) */}
			<button
				type="button"
				onClick={togglePause}
				aria-label="toggle pause"
				style={{
					position: "absolute",
					inset: 0,
					border: "none",
					padding: 0,
					background: "transparent",
					cursor: cursorHidden ? "none" : "pointer",
				}}>
				<div style={stackStyle} data-slideshow-stack>
					{underSlide && (
						<div style={frameWrapStyle(1, false)} data-slideshow-under>
							<SlideshowStage
								slide={underSlide}
								bgColor={bgColor}
								tween={false}
								tweenMs={tweenMs}
								mirrorH={mirrorH}
								mirrorV={mirrorV}
							/>
						</div>
					)}
					<div key={frame.key} style={frameWrapStyle(2, !frame.tween)} data-slideshow-top>
						<SlideshowStage
							slide={frame.slide}
							bgColor={bgColor}
							tween={frame.tween}
							tweenMs={tweenMs}
							mirrorH={mirrorH}
							mirrorV={mirrorV}
						/>
					</div>
				</div>
			</button>

			<div style={controlsStyle(!cursorHidden)} data-slideshow-controls>
				<button type="button" style={btnStyle} onClick={prev} data-ss="prev">
					← prev
				</button>
				<button
					type="button"
					style={btnStyle}
					onClick={togglePause}
					disabled={enabledCount <= 1}
					data-ss="pause">
					{paused ? "▶ play" : "❚❚ pause"}
				</button>
				<span data-ss="position">
					{position} / {enabledCount}
				</span>
				<button type="button" style={btnStyle} onClick={next} data-ss="next">
					next →
				</button>
				<button
					type="button"
					style={{ ...btnStyle, fontWeight: mirrorH ? 700 : 400 }}
					onClick={toggleFlipX}
					data-ss="mirror-h"
					aria-pressed={mirrorH}>
					⇄ H
				</button>
				<button
					type="button"
					style={{ ...btnStyle, fontWeight: mirrorV ? 700 : 400 }}
					onClick={toggleFlipY}
					data-ss="mirror-v"
					aria-pressed={mirrorV}>
					⇅ V
				</button>
				<button type="button" style={btnStyle} onClick={toggleFullscreen} data-ss="fullscreen">
					{isFullscreen ? "⊡ exit" : "⛶ full"}
				</button>
				<button type="button" style={btnStyle} onClick={onClose} data-ss="close">
					× close
				</button>
			</div>
		</div>
	);
};
