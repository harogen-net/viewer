import type { CSSProperties, FC, MouseEvent as ReactMouseEvent } from "react";
import { SlideView, type SlideViewProps } from "./SlideView";

// SlideListPanel の 1 要素 (v4 Group C C-3R で slide/ 配下に切り出し、C-9 で legacy thumb UI 同梱)。
//
// 役割: 「リストの 1 サムネとしての装飾と相互作用」をすべて担う。
//   - 縮小 (CSS transform: scale で thumbHeight に揃える)
//   - 選択枠 (selected で青ボーダー)
//   - disabled opacity
//   - クリック → 親 onClick
//   - 1-indexed 番号バッジ (左下)
//   - durationRatio コントローラ ( [-] xN [+]、N != 1 のみ label 表示)
//   - joining toggle ボタン (右辺中央)
//   - disabled checkbox (右上)
//   - durationRatio に応じた width 補正 (legacy ThumbSlideView 互換)
//
// SlideView は描画コアのみを担当。本 FC は SlideView をラップし「リストアイテムとして
// 提示する」装飾レイヤー。Group D の Edit canvas は別 wrapper FC (SlideEditView 等) を
// 用意し、同じく SlideView を内包する。

interface SlideThumbViewProps extends SlideViewProps {
	index: number;
	selected: boolean;
	onClick: () => void;
	/** durationRatio の +/- ボタン押下。 */
	onIncrementDuration: () => void;
	onDecrementDuration: () => void;
	/** joining checkbox / arrow クリックで反転。 */
	onToggleJoining: () => void;
	/** disabled checkbox クリックで反転。 */
	onToggleDisabled: () => void;
	/** thumb の固定高さ (px)。デフォルト 110 (legacy THUMB_HEIGHT 互換)。 */
	thumbHeight?: number;
}

// legacy ThumbSlideView.fitToHeight() の幅補正式。
//   r == 1     → 1
//   r < 1      → pow(r, 0.4)
//   r > 1      → atan(r - 1) * 0.5 + 1
const computeDurationCorrection = (ratio: number): number => {
	if (ratio === 1) return 1;
	if (ratio < 1) return ratio ** 0.4;
	return Math.atan(ratio - 1) * 0.5 + 1;
};

// 親要素への click 伝播を止めるラッパー (duration ボタン等で thumb 選択が走らないように)。
const stopClick = (handler: () => void) => (e: ReactMouseEvent): void => {
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
	onIncrementDuration,
	onDecrementDuration,
	onToggleJoining,
	onToggleDisabled,
	thumbHeight = 110,
}) => {
	const scale = thumbHeight / slide.height;
	const correction = computeDurationCorrection(slide.durationRatio);
	// 浮動小数点誤差で 220.00000000000003px 等になるのを避けるため整数化
	const scaledWidth = Math.round(slide.width * scale * correction);
	const durationLabel =
		slide.durationRatio === 1 ? "" : `x${slide.durationRatio.toString().substr(0, 3)}`;

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
		// 縮小された見かけ寸法を border の内側として確保 (durationCorrection で横伸縮)
		width: scaledWidth,
		height: thumbHeight,
		overflow: "hidden",
	};
	const scaledInnerStyle: CSSProperties = {
		// SlideView は native サイズで描画 → ここで scale をかけて thumbHeight に揃える
		transform: `scale(${scale})`,
		transformOrigin: "top left",
		width: slide.width,
		height: slide.height,
	};
	const indexLabelStyle: CSSProperties = {
		position: "absolute",
		bottom: 2,
		left: 4,
		color: "#fff",
		background: "rgba(0,0,0,0.55)",
		fontSize: 10,
		lineHeight: 1,
		padding: "2px 4px",
		borderRadius: 2,
		fontFamily: "monospace",
		pointerEvents: "none",
	};
	// 右上 disabled checkbox。pointer-events は ON (クリック有効)。
	const enableCheckStyle: CSSProperties = {
		position: "absolute",
		top: 2,
		right: 4,
		margin: 0,
		cursor: "pointer",
	};
	// 右辺中央 joining 矢印 (▶ で結合、▷ で非結合)。wrapper.overflow=hidden 内に収める。
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
	// 下端中央の duration コントローラ。
	const durationControlStyle: CSSProperties = {
		position: "absolute",
		bottom: 2,
		left: "50%",
		transform: "translateX(-50%)",
		display: "flex",
		alignItems: "center",
		gap: 2,
		background: "rgba(0,0,0,0.55)",
		color: "#fff",
		fontSize: 10,
		lineHeight: 1,
		padding: "2px 4px",
		borderRadius: 2,
		fontFamily: "monospace",
	};
	const durationBtnStyle: CSSProperties = {
		background: "transparent",
		color: "#fff",
		border: "1px solid rgba(255,255,255,0.4)",
		borderRadius: 2,
		fontSize: 10,
		lineHeight: 1,
		width: 14,
		height: 14,
		cursor: "pointer",
		padding: 0,
	};

	return (
		<div
			style={itemStyle}
			data-slide-index={index}
			data-selected={selected ? "true" : "false"}
			data-disabled={slide.disabled ? "true" : "false"}
			data-joining={slide.joining ? "true" : "false"}
			data-duration-ratio={slide.durationRatio}
			onClick={onClick}
		>
			<div style={scaledInnerStyle}>
				<SlideView slide={slide} bgColor={bgColor} />
			</div>
			<span style={indexLabelStyle}>{index + 1}</span>

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
				title={slide.joining ? "結合解除" : "結合"}
			>
				{slide.joining ? "▶" : "▷"}
			</button>

			<div style={durationControlStyle} data-thumb-control="duration">
				<button
					type="button"
					onClick={stopClick(onDecrementDuration)}
					style={durationBtnStyle}
					data-thumb-control="duration-down"
					aria-label="durationRatio 減少"
				>
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
					aria-label="durationRatio 増加"
				>
					+
				</button>
			</div>
		</div>
	);
};
