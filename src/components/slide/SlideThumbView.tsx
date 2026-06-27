import type { CSSProperties, FC, MouseEvent as ReactMouseEvent } from "react";
import { useEffect, useMemo, useRef } from "react";
import { useImageLibraryStore } from "../../state/imageLibraryStore";
import { drawSlideToCanvas } from "../../utils/slideThumbnail";
import type { SlideViewProps } from "./SlideView";

// SlideListPanel の 1 要素 (v4 Group C C-3R で slide/ 配下に切り出し、C-9 で legacy thumb UI 同梱、
//                       C-10 で canvas 1 枚描画化、legacy CanvasSlideView/ThumbSlideView 互換)。
//
// 役割:
//   - thumb サムネ描画 (canvas 1 枚に焼付け、layer DOM を作らない = 大量画像でも軽量)
//   - 選択枠 (selected で青ボーダー)
//   - disabled opacity
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
	onIncrementDuration: () => void;
	onDecrementDuration: () => void;
	onToggleJoining: () => void;
	onToggleDisabled: () => void;
	/** thumb の固定高さ (px)。デフォルト 110 (legacy THUMB_HEIGHT 互換)。 */
	thumbHeight?: number;
	/** 閲覧モード: 有効/無効・結合・duration の編集コントロールを隠す (選択のみ可)。 */
	readOnly?: boolean;
}

// canvas 再描画 debounce ms (legacy CanvasSlideView.refresh の setTimeout 100ms 互換)。
const DEBOUNCE_MS = 100;

// legacy ThumbSlideView.fitToHeight() の幅補正式:
//   r == 1     → 1
//   r < 1      → pow(r, 0.4)
//   r > 1      → atan(r - 1) * 0.5 + 1
const computeDurationCorrection = (ratio: number): number => {
	if (ratio === 1) return 1;
	if (ratio < 1) return ratio ** 0.4;
	return Math.atan(ratio - 1) * 0.5 + 1;
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
	onIncrementDuration,
	onDecrementDuration,
	onToggleJoining,
	onToggleDisabled,
	thumbHeight = 110,
	readOnly = false,
}) => {
	const scale = thumbHeight / slide.height;
	const correction = computeDurationCorrection(slide.durationRatio);
	// canvas natural size (native aspect、durationCorrection なし)
	const canvasW = Math.round(slide.width * scale);
	const canvasH = thumbHeight;
	// wrapper の見かけ width (durationCorrection を CSS stretch として反映)
	const wrapperW = Math.round(canvasW * correction);
	const durationLabel =
		slide.durationRatio === 1 ? "" : `x${slide.durationRatio.toString().substr(0, 3)}`;

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
	}, [slide, bgColor, imageMap, canvasW, canvasH]);

	const itemStyle: CSSProperties = {
		position: "relative",
		flex: "0 0 auto",
		// 選択時は青枠、未選択は同じ太さの透明枠 (border でレイアウトずれないように)
		border: selected ? "2px solid #228be6" : "2px solid transparent",
		borderRadius: 4,
		// disabled は半透明
		opacity: slide.disabled ? 0.35 : 1,
		cursor: "pointer",
		boxSizing: "content-box",
		background: "#fff",
		boxShadow: selected ? "0 0 0 1px rgba(34,139,230,0.3)" : "0 0 1px rgba(0,0,0,0.2)",
		// wrapper の見かけ寸法 (durationCorrection で横伸縮)
		width: wrapperW,
		height: thumbHeight,
		overflow: "hidden",
	};
	// canvas は native aspect で描画、CSS で wrapper に fit (width:100% で stretch される)。
	const canvasStyle: CSSProperties = {
		width: "100%",
		height: "100%",
		display: "block",
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
		right: 2,
		transform: "translateY(-50%)",
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
	const durationControlStyle: CSSProperties = {
		position: "absolute",
		bottom: 2,
		left: "50%",
		transform: "translateX(-50%)",
		display: "flex",
		alignItems: "center",
		gap: 3,
		background: "rgba(0,0,0,0.55)",
		color: "#fff",
		fontSize: 14,
		lineHeight: 1,
		padding: "3px 5px",
		borderRadius: 3,
		fontFamily: "monospace",
		fontWeight: "bold",
	};
	const durationBtnStyle: CSSProperties = {
		background: "rgba(255,255,255,0.2)",
		color: "#fff",
		border: "1px solid rgba(255,255,255,0.4)",
		borderRadius: 3,
		fontSize: 13,
		lineHeight: 1,
		width: 20,
		height: 20,
		cursor: "pointer",
		padding: 0,
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

			{/* 編集コントロール (有効/無効・結合・duration) は readOnly で非表示 (選択のみ可)。 */}
			{!readOnly && (
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

					<input
						type="checkbox"
						checked={!slide.disabled}
						onChange={onToggleDisabled}
						onClick={(e) => e.stopPropagation()}
						style={enableCheckStyle}
						data-thumb-control="enable-check"
						aria-label="有効/無効切替"
					/>

					<button
						type="button"
						onClick={stopClick(onToggleJoining)}
						style={joinArrowStyle}
						data-thumb-control="join-arrow"
						aria-label={slide.joining ? "結合解除" : "結合"}
						title={slide.joining ? "結合解除" : "結合"}>
						{slide.joining ? "▶" : "▷"}
					</button>

					<div style={durationControlStyle} data-thumb-control="duration" data-thumb-reveal>
						<button
							type="button"
							onClick={stopClick(onDecrementDuration)}
							style={durationBtnStyle}
							data-thumb-control="duration-down"
							aria-label="durationRatio 減少">
							−
						</button>
						<span data-thumb-control="duration-label" style={{ minWidth: 24, textAlign: "center" }}>
							{durationLabel}
						</span>
						<button
							type="button"
							onClick={stopClick(onIncrementDuration)}
							style={durationBtnStyle}
							data-thumb-control="duration-up"
							aria-label="durationRatio 増加">
							+
						</button>
					</div>
				</>
			)}
		</div>
	);
};
