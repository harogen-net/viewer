import type { CSSProperties, FC, ReactNode } from "react";
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
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
//   - UI 表示は CSS hover (起動時は全 UI 非表示、各 UI を hover した時のみ表示。JS タイマ無し)
//   - クロスフェード (key 変化で新フレームが fade-in、旧フレームを下に残し fade 後に除去)
//   - viewport フィット (短辺基準 scale、中央寄せ) + 背景色追従
//   - stage クリックで pause/resume (legacy slideContainer.mousedown)

interface SlideshowShellProps {
	open: boolean;
	onClose: () => void;
}

// interval / duration / flipX/Y / startFullscreen は SlideShowOpsPanel で編集し
// slideshowStore に集約 (legacy のツールバー散在 UI を 1 箇所へ)。
// プレイ中、カーソル静止からこの時間後に非表示にする。
const CURSOR_IDLE_MS = 2000;

// ルート要素。open の間は常にこの黒 DIV を描画し (まず真っ黒を担保)、中身だけを
// 状況 (スライド有無) に応じて差し替える。
const overlayStyle: CSSProperties = {
	position: "fixed",
	inset: 0,
	width: "100vw",
	height: "100vh",
	zIndex: 9999,
	background: "#000",
	overflow: "hidden",
};

// UI は CSS hover で出す。起動時は全 UI 非表示 (.ss-fade = opacity 0)、要素を hover した時だけ表示。
// opacity:0 でも pointer-events は有効なので、各 UI の位置に hover すると出現する (JS タイマ不要)。
const SS_HOVER_CSS = `
	@keyframes ssFadeIn {
		from { opacity: 0; }
		to { opacity: 1; }
	}

	[data-slideshow-overlay] .ss-fade {
		opacity: 0;
		transition: opacity 150ms ease;
		transition-delay: 300ms; /* マウスアウト後に待つ */
	}

	[data-slideshow-overlay] .ss-fade:hover {
		opacity: 1;
		transition-delay: 0s; /* ホバー時は即表示 */
	}
`;

// 中央下部の操作バー (prev / pause / position / next)。黒基調。
const controlsStyle: CSSProperties = {
	position: "fixed",
	bottom: 0,
	left: "50%",
	transform: "translateX(-50%)",
	display: "flex",
	gap: 8,
	alignItems: "center",
	padding: "6px 12px",
	background: "rgba(0,0,0,0.6)",
	color: "#fff",
	userSelect: "none",
};

// バー内ボタン (黒基調)。
const btnStyle: CSSProperties = {
	background: "transparent",
	border: "1px solid rgba(255,255,255,0.4)",
	color: "#fff",
	padding: "2px 8px",
	borderRadius: 4,
	cursor: "pointer",
	fontFamily: "inherit",
};

// 4 隅のコントロール。全て同サイズ・黒基調の矩形 (角丸/ボーダーなし)。
// 画面隅にピッタリ密着 (margin 0) させ、Fitts の法則どおり「隅にマウスを投げれば当たる」ようにする。
// 角丸は「辺に接しない内側 1 隅」だけ許容 (画面内側を向く角のみ丸める)。
const CORNER_BTN = 48;
const CORNER_R = 8;
const cornerBtnStyle: CSSProperties = {
	position: "fixed",
	width: CORNER_BTN,
	height: CORNER_BTN,
	display: "flex",
	alignItems: "center",
	justifyContent: "center",
	background: "rgba(0,0,0,0.55)",
	color: "#fff",
	border: "none",
	padding: 0,
	lineHeight: 1,
	cursor: "pointer",
	userSelect: "none",
	zIndex: 10000,
};
// 各隅: 画面隅に密着 (top/left=0 等)、内側を向く角だけ角丸 (borderRadius: TL TR BR BL)。
const cornerPos = {
	tl: { top: 0, left: 0, borderRadius: `0 0 ${CORNER_R}px 0` }, // 内側 = 右下
	tr: { top: 0, right: 0, borderRadius: `0 0 0 ${CORNER_R}px` }, // 内側 = 左下
	bl: { bottom: 0, left: 0, borderRadius: `0 ${CORNER_R}px 0 0` }, // 内側 = 右上
	br: { bottom: 0, right: 0, borderRadius: `${CORNER_R}px 0 0 0` }, // 内側 = 左上
} as const;

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
	const setStartFullscreen = useSlideshowStore((s) => s.setStartFullscreen);

	const { frame, position, enabledCount, paused, togglePause, next, prev } = useSlideshowPlayer({
		open,
		slides,
		startIndex: selectedIndex,
		intervalMs,
	});

	const overlayRef = useRef<HTMLDivElement>(null);
	const [isFullscreen, setIsFullscreen] = useState(false);
	// viewport 寸法は state で持ち、scale は render 中に同期計算する (post-paint 反映による
	// 初回 scale=1 の白ちらつきを防ぐ)。resize 時のみ state を更新。
	const [viewport, setViewport] = useState(() => ({
		w: window.innerWidth,
		h: window.innerHeight,
	}));
	const [cursorHidden, setCursorHidden] = useState(false);
	const cursorTimerRef = useRef<number | null>(null);

	// クロスフェード: key 変化で旧フレームを下層に残し、新フレームを fade-in。
	const [underSlide, setUnderSlide] = useState<Slide | null>(null);
	const prevKeyRef = useRef<number | null>(null);
	const prevSlideRef = useRef<Slide | null>(null);
	const fadeTimerRef = useRef<number | null>(null);

	// useEffect ではなく useLayoutEffect: underSlide のセットをペイント前に同期実行する。
	// useEffect だと「新フレームが opacity 0 / underSlide 未挿入」の状態が 1 フレーム描画され、
	// 切れ目で背景(黒)がちらつく。useLayoutEffect なら underSlide 挿入後に 1 回だけペイントされる。
	useLayoutEffect(() => {
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
		if (startFullscreen) overlayRef.current?.requestFullscreen?.().catch(() => {});
	}, [open]);

	// viewport フィット: 寸法 (resize 追従) は state、scale は render 中に算出する (下記)。
	useEffect(() => {
		if (!open) return;
		const onResize = () => setViewport({ w: window.innerWidth, h: window.innerHeight });
		onResize();
		window.addEventListener("resize", onResize);
		return () => window.removeEventListener("resize", onResize);
	}, [open]);

	// fullscreen 状態追従。スライドショー中の全画面操作 (ボタン / ESC) を本体設定
	// (startFullscreen) にも反映する (= 次回開始時の全画面有無に引き継ぐ)。
	useEffect(() => {
		if (!open) return;
		const onFs = () => {
			const isFs = document.fullscreenElement === overlayRef.current;
			setIsFullscreen(isFs);
			setStartFullscreen(isFs);
		};
		document.addEventListener("fullscreenchange", onFs);
		return () => document.removeEventListener("fullscreenchange", onFs);
	}, [open, setStartFullscreen]);

	// カーソル制御 (コントロール UI は CSS hover で別管理)。
	//   - ポーズ中: 砂時計 (wait) を常時表示 (非表示タイマは止める)。
	//   - プレイ中: 矢印 (default)。静止 CURSOR_IDLE_MS で非表示 (none)、mousemove で再表示。
	const clearCursorTimer = useCallback(() => {
		if (cursorTimerRef.current !== null) {
			window.clearTimeout(cursorTimerRef.current);
			cursorTimerRef.current = null;
		}
	}, []);
	// プレイ中のみ静止検出タイマを張る。ポーズ中はカーソル常時表示。
	useEffect(() => {
		if (!open) return;
		clearCursorTimer();
		if (paused) {
			setCursorHidden(false);
			return;
		}
		cursorTimerRef.current = window.setTimeout(() => setCursorHidden(true), CURSOR_IDLE_MS);
		return clearCursorTimer;
	}, [open, paused, clearCursorTimer]);
	// マウス移動で再表示 + (プレイ中なら) タイマ再セット。
	const handleMouseMove = useCallback(() => {
		setCursorHidden(false);
		clearCursorTimer();
		if (!paused) {
			cursorTimerRef.current = window.setTimeout(() => setCursorHidden(true), CURSOR_IDLE_MS);
		}
	}, [paused, clearCursorTimer]);

	// コントロール UI の表示/非表示は CSS hover (起動時は全 UI 非表示、要素 hover で表示)。

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

	// ポーズ中は砂時計を常時表示。プレイ中は矢印、静止で非表示。
	const stageCursor = paused ? "wait" : cursorHidden ? "none" : "default";

	// 中身: 有効スライドが無ければメッセージ、あれば stage + コントロール。
	// ルート (黒 overlay) は常に描画されるので、開始時は必ず真っ黒。
	let body: ReactNode;
	if (enabledCount === 0 || !frame) {
		body = (
			<>
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
				<div style={controlsStyle}>
					<button type="button" style={btnStyle} onClick={onClose} data-ss="close">
						× close
					</button>
				</div>
			</>
		);
	} else {
		const tweenMs = Math.max(1, intervalMs * (frame.slide.durationRatio ?? 1));
		// 短辺基準でフィットする scale を render 中に同期算出 (初回ペイントから正しいサイズ)。
		const scale = Math.min(viewport.w / frame.slide.width, viewport.h / frame.slide.height);
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

		body = (
			<>
				{/* フィット中央寄せ + stage の mousedown で pause/resume (legacy slideContainer.mousedown)。
				    ボタンを敷くと cursor が固定され邪魔になるため、素の div を mousedown で扱う。
				    コーナー/操作バーは後置の絶対配置要素 = この上に乗るので誤発火しない。 */}
				<div
					onMouseDown={togglePause}
					style={{ position: "absolute", inset: 0 }}
					data-slideshow-stage>
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
				</div>

				{/* 4 隅のコントロール (同サイズ・黒基調)。左上=フルスクリーン / 右上=終了 /
				    左下=左右フリップ / 右下=上下フリップ。 */}
				<button
					type="button"
					className="ss-fade"
					style={{ ...cornerBtnStyle, ...cornerPos.tl }}
					onClick={toggleFullscreen}
					data-ss="fullscreen"
					aria-label="fullscreen">
					⛶
				</button>
				<button
					type="button"
					className="ss-fade"
					style={{ ...cornerBtnStyle, ...cornerPos.tr }}
					onClick={onClose}
					data-ss="close"
					aria-label="close">
					✕
				</button>
				<button
					type="button"
					className="ss-fade"
					style={{ ...cornerBtnStyle, ...cornerPos.bl }}
					onClick={toggleFlipX}
					data-ss="mirror-h">
					⇄
				</button>
				<button
					type="button"
					className="ss-fade"
					style={{ ...cornerBtnStyle, ...cornerPos.br }}
					onClick={toggleFlipY}
					data-ss="mirror-v">
					⇅
				</button>

				{/* 中央下部の操作バー (prev / pause / position / next) は位置そのまま、黒基調化。
				    起動時は非表示、hover で表示 (.ss-fade)。 */}
				<div className="ss-fade" style={controlsStyle} data-slideshow-controls>
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
				</div>
			</>
		);
	}

	return (
		<div
			style={{ ...overlayStyle, cursor: stageCursor }}
			ref={overlayRef}
			onMouseMove={handleMouseMove}
			data-slideshow-overlay>
			<style>{SS_HOVER_CSS}</style>
			{body}
		</div>
	);
};
