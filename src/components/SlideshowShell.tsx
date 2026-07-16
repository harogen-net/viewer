import { useDeviceMode } from "@/hooks/useDeviceMode";
import { useSlideshowPlayer } from "@/hooks/useSlideshowPlayer";
import { useSlideStore } from "@/state/slideStore";
import { useSlideshowStore } from "@/state/slideshowStore";
import { useViewerDocumentStore } from "@/state/viewerDocumentStore";
import type { Slide } from "@/types/Slide";
import type { CSSProperties, FC, ReactNode } from "react";
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
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
// 外側 = 常に inset:0 で safe-area まで黒を塗る (rotate 有無に依存しない)。
// 内側 = rotate/寸法計算を担う (portrait 時に 90° 回転で landscape 表示)。
// この分離により portrait rotate 時に内側の 100vh が safe-area を含まない場合でも
// 外側が top/bottom のギャップを黒で埋めるため、上端に body の白が残らない。
const overlayOuterStyle: CSSProperties = {
	position: "fixed",
	inset: 0,
	zIndex: 9999,
	background: "#000",
	overflow: "hidden",
};

// 内側 (rotate 中は 90° 回転しつつ寸法を swap)。translate(-50%,-50%) で外側中央にアラインし、
// center 原点で回転。inset:0 のままだと元ポートレートの矩形が回転で外側からはみ出す。
const overlayInnerBaseStyle: CSSProperties = {
	position: "absolute",
	inset: 0,
	// 外側で黒を担保しているので inner の bg は不要 (差し替え時のちらつき原因になり得るため未指定)。
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
	// mobile 環境ではタップターゲット拡大 + UI 常時表示 + ポーズ砂時計を表示 (hover が効かないため)。
	// 「閲覧モード (VIEW)」ではなく「スマホ端末 (mobile UA)」で分岐する — 両者は独立軸。
	// isPortrait は overlay の 90° 回転 (portrait → landscape 見た目) にも使う。
	const { isMobile, isPortrait } = useDeviceMode();

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
	// mobile UA + portrait のときに overlay 自体を 90° 回転させて常に長辺を横にする。
	// body には触らず overlay 単体のみ回転するのでモーダル等の他要素は影響を受けない。
	// device 軸 (useDeviceMode) で判定 — 起動モード (VIEW/EDIT) とは独立。PC で portrait window
	// にした場合の意図しない回転は isMobile=false で弾かれる。
	const rotate = open && isMobile && isPortrait;
	// スライドショー実行中は <html> に属性を付け、safe-area まで黒背景を効かせる
	// (styles/index.css + index.html の viewport-fit=cover と連動)。
	useEffect(() => {
		if (!open) return;
		const html = document.documentElement;
		html.setAttribute("data-slideshow-active", "");
		return () => html.removeAttribute("data-slideshow-active");
	}, [open]);
	// viewport 寸法は state で持ち、scale は render 中に同期計算する (post-paint 反映による
	// 初回 scale=1 の白ちらつきを防ぐ)。resize 時のみ state を更新。
	// rotate 中は使える寸法が swap されるので innerWidth/Height も swap する。
	const readViewport = (rot: boolean): { w: number; h: number } =>
		rot
			? { w: window.innerHeight, h: window.innerWidth }
			: { w: window.innerWidth, h: window.innerHeight };
	const [viewport, setViewport] = useState(() => readViewport(false));
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
		const onResize = () => setViewport(readViewport(rotate));
		onResize();
		window.addEventListener("resize", onResize);
		return () => window.removeEventListener("resize", onResize);
	}, [open, rotate]);

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
	// mobile は hover が無いので stage tap で UI を出し、3s 後にフェードアウトする (state 駆動)。
	// UI 上の操作 (ボタン click 等) では showMobileUI を呼んで猶予をリセットする。
	const [mobileUIVisible, setMobileUIVisible] = useState(false);
	const uiFadeTimerRef = useRef<number | null>(null);
	const MOBILE_UI_HIDE_MS = 3000;
	const showMobileUI = useCallback(() => {
		if (!isMobile) return;
		setMobileUIVisible(true);
		if (uiFadeTimerRef.current !== null) window.clearTimeout(uiFadeTimerRef.current);
		uiFadeTimerRef.current = window.setTimeout(() => setMobileUIVisible(false), MOBILE_UI_HIDE_MS);
	}, [isMobile]);
	// mobile 用: click hook の共通化。渡された handler の前後で showMobileUI で猶予をリセット。
	const wrapMobileClick = useCallback(
		(handler: () => void) => (): void => {
			handler();
			showMobileUI();
		},
		[showMobileUI],
	);
	useEffect(
		() => () => {
			if (uiFadeTimerRef.current !== null) window.clearTimeout(uiFadeTimerRef.current);
		},
		[],
	);

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

	// mobile ではタップターゲット拡大 + hover を使わず state 駆動 fade (mobileUIStyle) で制御。
	// mobileUIStyle: 1s タイマの間だけ opacity 1 / pointer-events 有効。それ以外は完全に不可視 + 透過。
	const fadeClass = isMobile ? undefined : "ss-fade";
	const mobileUIStyle: CSSProperties = isMobile
		? {
				opacity: mobileUIVisible ? 1 : 0,
				pointerEvents: mobileUIVisible ? "auto" : "none",
				transition: "opacity 200ms ease",
			}
		: {};
	const cornerSize = isMobile ? 72 : 48;
	const cornerFont = isMobile ? 32 : 22;
	const cornerBtnDyn: CSSProperties = {
		...cornerBtnStyle,
		width: cornerSize,
		height: cornerSize,
		fontSize: cornerFont,
	};
	const controlPad = isMobile ? "10px 16px" : "6px 12px";
	const controlGap = isMobile ? 14 : 8;
	const controlFont = isMobile ? 20 : 14;
	const controlsDyn: CSSProperties = {
		...controlsStyle,
		padding: controlPad,
		gap: controlGap,
		fontSize: controlFont,
	};
	const btnDyn: CSSProperties = {
		...btnStyle,
		padding: isMobile ? "6px 14px" : "2px 8px",
		fontSize: controlFont,
	};
	// L/R 画面端ナビ (通常/mobile 共通)。mobile では大きめ + 常時表示。
	const navW = isMobile ? 64 : 44;
	const navH = isMobile ? 140 : 100;
	const navFont = isMobile ? 40 : 26;
	const navBase: CSSProperties = {
		position: "fixed",
		top: "50%",
		width: navW,
		height: navH,
		transform: "translateY(-50%)",
		display: "flex",
		alignItems: "center",
		justifyContent: "center",
		background: "rgba(0,0,0,0.45)",
		color: "#fff",
		border: "none",
		padding: 0,
		fontSize: navFont,
		lineHeight: 1,
		cursor: "pointer",
		userSelect: "none",
		zIndex: 10000,
	};
	const navLeft: CSSProperties = { ...navBase, left: 0, borderRadius: `0 ${CORNER_R}px ${CORNER_R}px 0` };
	const navRight: CSSProperties = { ...navBase, right: 0, borderRadius: `${CORNER_R}px 0 0 ${CORNER_R}px` };

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
				<div style={controlsDyn}>
					<button type="button" style={btnDyn} onClick={onClose} data-ss="close">
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
				    コーナー/操作バーは後置の絶対配置要素 = この上に乗るので誤発火しない。
				    mobile では pause/resume ではなく UI 表示トリガ (1s フェードアウト)。 */}
				<div
					onMouseDown={isMobile ? showMobileUI : togglePause}
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

				{/* 4 隅のコントロール (同サイズ・黒基調)。
				    - 左上: PC は全画面ボタン / mobile は砂時計 (ポーズ時のみ、tap で解除 / 背景なし)
				    - 右上: 終了 / 左下: 左右フリップ / 右下: 上下フリップ */}
				{isMobile ? (
					paused && (
						<button
							type="button"
							style={{
								...cornerBtnDyn,
								...cornerPos.tl,
								background: "transparent",
							}}
							onClick={togglePause}
							data-ss="pause-indicator"
							aria-label="resume">
							⌛
						</button>
					)
				) : (
					<button
						type="button"
						className={fadeClass}
						style={{ ...cornerBtnDyn, ...cornerPos.tl }}
						onClick={toggleFullscreen}
						data-ss="fullscreen"
						aria-label="fullscreen">
						⛶
					</button>
				)}
				<button
					type="button"
					className={fadeClass}
					style={{ ...cornerBtnDyn, ...cornerPos.tr, ...mobileUIStyle }}
					onClick={isMobile ? wrapMobileClick(onClose) : onClose}
					data-ss="close"
					aria-label="close">
					✕
				</button>
				<button
					type="button"
					className={fadeClass}
					style={{ ...cornerBtnDyn, ...cornerPos.bl, ...mobileUIStyle }}
					onClick={isMobile ? wrapMobileClick(toggleFlipX) : toggleFlipX}
					data-ss="mirror-h">
					⇄
				</button>
				<button
					type="button"
					className={fadeClass}
					style={{ ...cornerBtnDyn, ...cornerPos.br, ...mobileUIStyle }}
					onClick={isMobile ? wrapMobileClick(toggleFlipY) : toggleFlipY}
					data-ss="mirror-v">
					⇅
				</button>

				{/* 画面左右のナビゲーション (通常/mobile 共通)。mobile は tap で 3s だけ表示 (操作で reset)。 */}
				<button
					type="button"
					className={fadeClass}
					style={{ ...navLeft, ...mobileUIStyle }}
					onClick={isMobile ? wrapMobileClick(prev) : prev}
					data-ss="nav-prev"
					aria-label="prev">
					‹
				</button>
				<button
					type="button"
					className={fadeClass}
					style={{ ...navRight, ...mobileUIStyle }}
					onClick={isMobile ? wrapMobileClick(next) : next}
					data-ss="nav-next"
					aria-label="next">
					›
				</button>

				{/* 中央下部の操作バー。PC は prev / pause / position / next。
				    mobile は前後移動を撤去 (画面端 nav-prev/next で代替) し、pause を大きく + position のみ。
				    起動時は非表示、hover で表示 (.ss-fade)。mobile は tap で 3s 表示 + 操作で reset。 */}
				<div
					className={fadeClass}
					style={{ ...controlsDyn, ...mobileUIStyle }}
					data-slideshow-controls>
					{!isMobile && (
						<button type="button" style={btnDyn} onClick={prev} data-ss="prev">
							← prev
						</button>
					)}
					<button
						type="button"
						style={isMobile ? { ...btnDyn, padding: "10px 32px", fontSize: 24 } : btnDyn}
						onClick={isMobile ? wrapMobileClick(togglePause) : togglePause}
						disabled={enabledCount <= 1}
						data-ss="pause">
						{paused ? "▶ play" : "❚❚ pause"}
					</button>
					<span data-ss="position">
						{position} / {enabledCount}
					</span>
					{!isMobile && (
						<button type="button" style={btnDyn} onClick={next} data-ss="next">
							next →
						</button>
					)}
				</div>
			</>
		);
	}

	// rotate 中は overlay を 90° 回転しつつ寸法を swap (translate(-50%,-50%) で viewport 中央にアラインし、
	// center 原点で回転)。inset:0 のままだと元ポートレートの矩形が回転されて画面外にはみ出す。
	const rotatedOverlayStyle: CSSProperties = rotate
		? {
				inset: "auto",
				top: "50%",
				left: "50%",
				width: "100vh",
				height: "100vw",
				transform: "translate(-50%, -50%) rotate(90deg)",
				transformOrigin: "center",
			}
		: {};

	return (
		<div
			style={overlayOuterStyle}
			ref={overlayRef}
			onMouseMove={handleMouseMove}
			data-slideshow-overlay
			data-slideshow-rotate={rotate ? "portrait" : undefined}>
			<style>{SS_HOVER_CSS}</style>
			<div style={{ ...overlayInnerBaseStyle, ...rotatedOverlayStyle, cursor: stageCursor }}>
				{body}
			</div>
		</div>
	);
};
