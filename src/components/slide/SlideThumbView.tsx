import { useImageLibraryStore } from "@/state/imageLibraryStore";
import { MAX_DURATION, MIN_DURATION } from "@/utils/slideOps";
import { drawSlideToCanvas } from "@/utils/slideThumbnail";
import type {
	CSSProperties,
	FC,
	MouseEvent as ReactMouseEvent,
	PointerEvent as ReactPointerEvent,
} from "react";
import { useEffect, useMemo, useRef, useState } from "react";
import type { SlideViewProps } from "./SlideView";

// SlideListPanel の 1 要素 (v4 Group C C-3R で slide/ 配下に切り出し、C-9 で legacy thumb UI 同梱、
//                       C-10 で canvas 1 枚描画化、legacy CanvasSlideView/ThumbSlideView 互換)。
//
// 役割:
//   - thumb サムネ描画 (canvas 1 枚に焼付け、layer DOM を作らない = 大量画像でも軽量)
//   - 選択枠 (selected で青ボーダー)
//   - disabled のグレーアウト (絵柄と下地のみ。コントロールは沈めない。半透明ではなく filter)
//   - クリック → 親 onClick
//   - 1-indexed 番号バッジ (左下)
//   - durationRatio コントローラ ( [-] xN [+]、N != 1 のみ label 表示)
//   - joining toggle ボタン (右辺中央)
//   - disabled checkbox (右上)
//   - durationRatio に応じた wrapper width 補正 (canvas は native aspect、wrapper を CSS で横方向 stretch)
//
// SlideView (DOM 描画) はここでは使わない。Slideshow 用の display 描画は SlideView を直接使う。
// Edit canvas (Group D) は SlideEditView 等の別 wrapper を用意し、SlideView (DOM 描画) を内包する想定。

interface SlideThumbViewProps extends SlideViewProps {
	index: number;
	selected: boolean;
	onClick: () => void;
	/** ダブルクリック (一覧での編集移行に使う)。 */
	onDoubleClick?: () => void;
	/** スライド内「編集」ボタン (編集移行)。 */
	onEdit?: () => void;
	/** スライド内「複製」ボタン (このスライドを複製、選択不要)。 */
	onDuplicate?: () => void;
	/** スライド内「削除」ボタン (このスライドを削除、選択不要)。 */
	onDelete?: () => void;
	/** durationRatio を直接設定する (右端ドラッグでのリサイズ確定時に 1 回呼ぶ)。 */
	onSetDuration: (ratio: number) => void;
	onToggleJoining: () => void;
	onToggleDisabled: () => void;
	/** thumb の固定高さ (px)。デフォルト 110 (legacy THUMB_HEIGHT 互換)。 */
	thumbHeight?: number;
	/** スマホモード: 有効/無効・結合・duration の編集コントロールを隠す (選択のみ可)。 */
	mobileMode?: boolean;
	/**
	 * 一括切替モード (docs/bulk-toggle-mode-plan.md): サムネ上の操作口を全て隠す
	 * (有効/無効チェックボックスも)。切替はサムネ本体のクリックで行い、状態は暗転で読ませる。
	 */
	bulkToggleMode?: boolean;
}

// canvas 再描画 debounce ms (legacy CanvasSlideView.refresh の setTimeout 100ms 互換)。
const DEBOUNCE_MS = 100;

// 取り得る尺の段階 (legacy ±ボタンの増減ステップと一致: <1 は 0.2 刻み、1〜2 は 0.5 刻み、2〜9 は 1 刻み)。
// ドラッグ確定尺はこの段階へ最近傍スナップする。
const DURATION_STEPS = [0.2, 0.4, 0.6, 0.8, 1, 1.5, 2, 3, 4, 5, 6, 7, 8, 9];
const snapToStep = (ratio: number): number =>
	DURATION_STEPS.reduce((best, s) => (Math.abs(s - ratio) < Math.abs(best - ratio) ? s : best));
// thumb 外枠の最小幅。尺を縮めてもコーナーボタン群 (各 30px) + 中央ラベル +
// 右端リサイズハンドルが重ならず操作可能な下限を保証する (片道トラップ防止の土台)。
const DURATION_MIN_THUMB_W = 92;

// 無効スライドの絵柄に掛けるフィルタ。暗く落として少しだけ透かす。
// legacy (css/index.css の `.slide.disabled`) も filter: brightness(40%) で、手法は同じ。
// opacity 単体では白地に色が抜けるだけで、明るい絵だと «無効» に見えない。
const DISABLED_THUMB_FILTER = "brightness(0.6) opacity(0.8)";
// 無効スライドの下地。透明ボーダー (2px) の下から覗く白い枠線もここで暗くする
// (絵柄だけ沈めて枠が白く残ると、非活性に見えない)。上のフィルタと対で見た目を合わせてあるので、
// 片方だけ変えると枠が浮くか沈むかする。
const DISABLED_THUMB_BG = "#BBB";

// legacy ThumbSlideView.fitToHeight() の幅補正式:
//   r == 1     → 1
//   r < 1      → pow(r, 0.4)
//   r > 1      → atan(r - 1) * 0.5 + 1
export const computeDurationCorrection = (ratio: number): number => {
	if (ratio === 1) return 1;
	if (ratio < 1) return ratio ** 0.4;
	return Math.atan(ratio - 1) * 0.5 + 1;
};

// computeDurationCorrection の逆関数: 見かけ幅 (px) から durationRatio を復元する。
// 右端ドラッグ (幅=尺) で使う。結果は legacy と同じ段階 (DURATION_STEPS) へ最近傍スナップする。
export const wrapperWidthToRatio = (targetWidth: number, canvasW: number): number => {
	if (canvasW <= 0) return 1;
	const c = targetWidth / canvasW; // 補正係数
	let ratio: number;
	if (c <= 1) {
		// 尺<=1 側: correction = ratio^0.4 → ratio = c^(1/0.4) = c^2.5
		ratio = c ** 2.5;
	} else if (c >= 1 + Math.PI / 4) {
		// 尺>1 側: correction = atan(ratio-1)*0.5+1。c が 1+π/4 以上は tan が発散 → 上限へ。
		ratio = MAX_DURATION;
	} else {
		// ratio = tan((c-1)*2) + 1
		ratio = Math.tan((c - 1) * 2) + 1;
	}
	return snapToStep(Math.min(MAX_DURATION, Math.max(MIN_DURATION, ratio)));
};

// 親要素への click 伝播を止めるラッパー (duration ボタン等で thumb 選択が走らないように)。
const stopClick =
	(handler: () => void) =>
	(e: ReactMouseEvent): void => {
		e.stopPropagation();
		e.preventDefault();
		handler();
	};

export const SlideThumbView: FC<SlideThumbViewProps> = ({
	slide,
	bgColor,
	index,
	selected,
	onClick,
	onDoubleClick,
	onEdit,
	onDuplicate,
	onDelete,
	onSetDuration,
	onToggleJoining,
	onToggleDisabled,
	bulkToggleMode = false,
	thumbHeight = 110,
	mobileMode = false,
}) => {
	// 右端ドラッグ中の暫定尺 (null=非ドラッグ)。ドラッグ中は store を触らず幅/ラベルだけ即時追従し、
	// 離した時に onSetDuration で 1 回だけ確定 (履歴を汚さない)。
	const [dragRatio, setDragRatio] = useState<number | null>(null);
	const effectiveRatio = dragRatio ?? slide.durationRatio;

	const scale = thumbHeight / slide.height;
	const correction = computeDurationCorrection(effectiveRatio);
	// canvas natural size (native aspect、durationCorrection なし)
	const canvasW = Math.round(slide.width * scale);
	const canvasH = thumbHeight;
	// wrapper の見かけ width (durationCorrection を CSS stretch として反映)
	const wrapperW = Math.round(canvasW * correction);
	const durationLabel =
		effectiveRatio === 1 ? "" : `x${effectiveRatio.toString().substr(0, 3)}`;

	// 右端ドラッグ (幅=尺) のハンドラ。開始時の pointerX と wrapper 幅を基準に、移動量を幅へ加算し逆変換。
	const dragStart = useRef<{ x: number; w: number } | null>(null);
	const handleResizeDown = (e: ReactPointerEvent): void => {
		// 親 (SortableSlideThumb) の dnd-kit listeners へ伝播させない = 並べ替えの誤発火を防ぐ。
		e.stopPropagation();
		e.preventDefault();
		dragStart.current = { x: e.clientX, w: wrapperW };
		e.currentTarget.setPointerCapture(e.pointerId);
	};
	const handleResizeMove = (e: ReactPointerEvent): void => {
		if (!dragStart.current) return;
		const newW = Math.max(1, dragStart.current.w + (e.clientX - dragStart.current.x));
		setDragRatio(wrapperWidthToRatio(newW, canvasW));
	};
	const handleResizeUp = (e: ReactPointerEvent): void => {
		if (!dragStart.current) return;
		dragStart.current = null;
		e.currentTarget.releasePointerCapture(e.pointerId);
		onSetDuration(dragRatio ?? slide.durationRatio);
		setDragRatio(null);
	};

	// imageLibraryStore を購読 (slide の参照する image 更新時に redraw)
	const imageById = useImageLibraryStore((s) => s.imageById);
	const imageMap = useMemo(() => {
		const map: Record<string, string> = {};
		for (const [id, entry] of Object.entries(imageById)) {
			map[id] = entry.dataURL;
		}
		return map;
	}, [imageById]);

	// canvas 描画 (legacy CanvasSlideView 相当、debounce)。
	// legacy `CanvasSlideView.refresh()` は setTimeout 100ms で連続更新を間引いている。
	// 同等にするため effect で前回 timer を clear → 100ms 後に描画。
	//
	// チラツキ対策: drawSlideToCanvas は画像ロード完了後の「完成 canvas」を返す。
	// それを可視 canvas へ 1 回の drawImage で同期転写するため、可視 canvas に
	// 「クリア → ロード待ち」の空白フレームが生じない (直接 in-place 描画していた頃の真っ白対策)。
	const canvasRef = useRef<HTMLCanvasElement>(null);
	useEffect(() => {
		const canvas = canvasRef.current;
		if (!canvas) return;
		let cancelled = false;
		const tid = window.setTimeout(() => {
			drawSlideToCanvas(slide, bgColor, imageMap, {
				targetWidth: canvasW,
				targetHeight: canvasH,
			})
				.then((off) => {
					if (cancelled) return;
					const ctx = canvas.getContext("2d");
					if (!ctx) return;
					ctx.clearRect(0, 0, canvas.width, canvas.height);
					ctx.drawImage(off, 0, 0);
				})
				.catch((e) => console.warn("[SlideThumbView] draw failed:", e));
		}, DEBOUNCE_MS);
		return () => {
			cancelled = true;
			window.clearTimeout(tid);
		};
		// 依存は「絵に効くもの」だけに絞る。slide 全体を依存にすると、有効/無効・結合・表示尺の
		// 切替 (どれも canvas の中身に関係しない) でも再描画が走る。とくに一括切替モードは
		// クリックのたびに disabled が変わるので、1 クリックごとに無駄な再描画が起きていた。
		// biome-ignore lint/correctness/useExhaustiveDependencies: 描画に効く要素だけを依存にする
	}, [slide.layers, slide.width, slide.height, bgColor, imageMap, canvasW, canvasH]);

	const itemStyle: CSSProperties = {
		position: "relative",
		flex: "0 0 auto",
		// 選択時は青枠、未選択は同じ太さの透明枠 (border でレイアウトずれないように)
		border: selected ? "2px solid #228be6" : "2px solid transparent",
		borderRadius: 4,
		cursor: "pointer",
		boxSizing: "content-box",
		// 透明ボーダーの下にも下地が回り込むため、この色が «白枠線» として見える。
		background: slide.disabled ? DISABLED_THUMB_BG : "#fff",
		boxShadow: selected ? "0 0 0 1px rgba(34,139,230,0.3)" : "0 0 1px rgba(0,0,0,0.2)",
		// wrapper の見かけ寸法 (durationCorrection で横伸縮)。
		// minWidth: 尺を縮めてもコントロール群が重ならない下限を保証 (片道トラップ防止)。
		width: wrapperW,
		minWidth: DURATION_MIN_THUMB_W,
		height: thumbHeight,
		overflow: "hidden",
	};
	// canvas は native aspect で描画、CSS で wrapper に fit (width:100% で stretch される)。
	// disabled のグレーアウトは **絵柄 (この canvas) だけ** に掛ける。
	// wrapper 全体に掛けると、有効/無効チェックや編集ボタンまで薄くなって狙いにくくなる
	// (disable/enable は頻繁に切り替える操作なので、無効時ほど的が見えないと困る)。
	//
	// 半透明ではなく filter で落とす。opacity だと背後の白地が透けて色が抜けるだけで、
	// 明るい絵柄だと «無効» に見えない。不透明のまま彩度と明度を落とす方が判別しやすい。
	const canvasStyle: CSSProperties = {
		width: "100%",
		height: "100%",
		display: "block",
		filter: slide.disabled ? DISABLED_THUMB_FILTER : undefined,
	};
	// 有効/無効チェックは左下 (legacy 準拠、25x25)。
	const enableCheckStyle: CSSProperties = {
		position: "absolute",
		bottom: 2,
		left: 2,
		width: 25,
		height: 25,
		margin: 0,
		cursor: "pointer",
		zIndex: 3,
	};
	const joinArrowStyle: CSSProperties = {
		position: "absolute",
		top: "50%",
		// 右端のリサイズハンドル (幅 10px) に重ならないよう内側へ寄せ、重なり順も上にする。
		right: 14,
		transform: "translateY(-50%)",
		zIndex: 3,
		width: 16,
		height: 16,
		display: "flex",
		alignItems: "center",
		justifyContent: "center",
		fontSize: 12,
		color: slide.joining ? "#228be6" : "#adb5bd",
		background: "rgba(255,255,255,0.85)",
		border: "1px solid #dee2e6",
		borderRadius: 8,
		cursor: "pointer",
		userSelect: "none",
		lineHeight: 1,
	};
	// 尺ラベル (x1.5 等)。通常は下辺の小バッジ。ドラッグ中は中央へ大きく表示して視認性を上げる。
	const dragging = dragRatio !== null;
	const durationBadgeStyle: CSSProperties = {
		position: "absolute",
		background: "rgba(0,0,0,0.55)",
		color: "#fff",
		lineHeight: 1,
		borderRadius: dragging ? 6 : 3,
		fontFamily: "monospace",
		fontWeight: "bold",
		pointerEvents: "none",
		...(dragging
			? {
					top: "50%",
					left: "50%",
					transform: "translate(-50%, -50%)",
					fontSize: Math.round(thumbHeight * 0.34),
					padding: "4px 12px",
					zIndex: 4,
					whiteSpace: "nowrap",
				}
			: {
					bottom: 2,
					left: "50%",
					transform: "translateX(-50%)",
					fontSize: 12,
					padding: "3px 6px",
				}),
	};
	// 表示するラベル文字列。ドラッグ中は尺 1 でも表示 ("x1")、通常は 1 のとき非表示。
	const badgeText = dragging ? `x${effectiveRatio.toString().substr(0, 3)}` : durationLabel;
	// 右端リサイズハンドル (幅=尺のドラッグ)。選択時のみ reveal。結合矢印/複製ボタン (zIndex:3) より下 (zIndex:2)。
	const resizeHandleStyle: CSSProperties = {
		position: "absolute",
		top: 0,
		right: 0,
		height: "100%",
		width: 10,
		cursor: "ew-resize",
		zIndex: 2,
		background:
			"linear-gradient(to right, rgba(0,0,0,0) 0%, rgba(34,139,230,0.15) 60%, rgba(34,139,230,0.45) 100%)",
		touchAction: "none",
	};
	// スライド内アクション。legacy 配置: 編集=左上 / 削除=右上 / 複製=右下。
	// サイズも legacy 準拠 (30x30 / font 20)。
	const actionBtnStyle = (corner: CSSProperties, bg: string, color: string): CSSProperties => ({
		position: "absolute",
		...corner,
		zIndex: 3,
		width: 30,
		height: 30,
		display: "flex",
		alignItems: "center",
		justifyContent: "center",
		fontSize: 20,
		lineHeight: 1,
		padding: 0,
		border: "none",
		borderRadius: 3,
		background: bg,
		color,
		cursor: "pointer",
	});
	const editBtnStyle = actionBtnStyle({ top: 2, left: 2 }, "rgba(0,0,0,0.55)", "#fff");
	const deleteBtnStyle = actionBtnStyle({ top: 2, right: 2 }, "#e03131", "#fff");
	const cloneBtnStyle = actionBtnStyle({ bottom: 2, right: 2 }, "rgba(0,0,0,0.55)", "#fff");

	return (
		<div
			style={itemStyle}
			data-slide-index={index}
			data-selected={selected ? "true" : "false"}
			data-disabled={slide.disabled ? "true" : "false"}
			data-joining={slide.joining ? "true" : "false"}
			data-duration-ratio={slide.durationRatio}
			onClick={onClick}
			onDoubleClick={onDoubleClick}>
			<canvas
				ref={canvasRef}
				width={canvasW}
				height={canvasH}
				style={canvasStyle}
				data-thumb-canvas
			/>

			{/* 尺ラベル (x1.5 等)。通常は下辺の小バッジ、ドラッグ中は中央に拡大。尺 1 は通常時のみ非表示。
			    mobileMode でも出す: スマホモードでも SlidePlaybackPanel から尺を変えられるので、
			    現在値が読めないと操作結果が分からない (サムネ幅の伸縮だけでは判別しづらい)。 */}
			{badgeText && (
				<span style={durationBadgeStyle} data-thumb-control="duration-label">
					{badgeText}
				</span>
			)}

			{/* 有効/無効チェックボックス。
			    スマホでは的が小さすぎるので出さない (暗転だけで判別させ、操作はタップで行う)。
			    一括切替モードでも出さない: サムネ本体のクリックがトグルなので操作口としては要らず、
			    状態は暗転で読める (PC とスマホで見た目も揃う)。 */}
			{!mobileMode && !bulkToggleMode && (
				<input
					type="checkbox"
					checked={!slide.disabled}
					onChange={onToggleDisabled}
					onClick={(e) => e.stopPropagation()}
					style={enableCheckStyle}
					data-thumb-control="enable-check"
					aria-label="有効/無効切替"
				/>
			)}

			{/* 編集コントロール (結合・duration ドラッグ・各アクション) は mobileMode で非表示。
			    スマホモードでの値変更は SlidePlaybackPanel が担う (サムネ上の的はタッチには小さすぎる)。
			    一括切替モードでも隠す (モード中は有効/無効以外を変更させない)。 */}
			{!mobileMode && !bulkToggleMode && (
				<>
					{/* スライド内アクション (legacy 配置: 編集=左上 / 削除=右上 / 複製=右下)。選択不要。 */}
					{onEdit && (
						<button
							type="button"
							onClick={stopClick(onEdit)}
							style={editBtnStyle}
							data-thumb-control="edit"
							data-thumb-reveal
							aria-label="編集"
							title="編集">
							✎
						</button>
					)}
					{onDelete && (
						<button
							type="button"
							onClick={stopClick(onDelete)}
							style={deleteBtnStyle}
							data-thumb-control="delete"
							data-thumb-reveal
							aria-label="削除"
							title="削除">
							✕
						</button>
					)}
					{onDuplicate && (
						<button
							type="button"
							onClick={stopClick(onDuplicate)}
							style={cloneBtnStyle}
							data-thumb-control="duplicate"
							data-thumb-reveal
							aria-label="複製"
							title="複製">
							＋
						</button>
					)}

					<button
						type="button"
						onClick={stopClick(onToggleJoining)}
						style={joinArrowStyle}
						data-thumb-control="join-arrow"
						aria-label={slide.joining ? "結合解除" : "結合"}
						title={slide.joining ? "結合解除" : "結合"}>
						{slide.joining ? "▶" : "▷"}
					</button>

					{/* 右端ドラッグで幅=尺をリサイズ。選択時のみ reveal。 */}
					<div
						style={resizeHandleStyle}
						data-thumb-control="duration-resize"
						data-thumb-reveal
						onPointerDown={handleResizeDown}
						onPointerMove={handleResizeMove}
						onPointerUp={handleResizeUp}
						onPointerCancel={handleResizeUp}
						onClick={(e) => e.stopPropagation()}
						role="slider"
						aria-label="表示尺をドラッグで調整"
						aria-valuenow={effectiveRatio}
						aria-valuemin={MIN_DURATION}
						aria-valuemax={MAX_DURATION}
					/>
				</>
			)}
		</div>
	);
};
