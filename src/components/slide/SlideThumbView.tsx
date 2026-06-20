import type { CSSProperties, FC } from "react";
import { SlideView, type SlideViewProps } from "./SlideView";

// SlideListPanel の 1 要素 (v4 Group C C-3R で slide/ 配下に切り出し)。
//
// 役割: 「リストの 1 サムネとしての装飾と相互作用」をすべて担う。
//   - 縮小 (CSS transform: scale で thumbHeight に揃える)
//   - 選択枠 (selected で青ボーダー)
//   - disabled opacity
//   - クリック → 親 onClick
//   - 1-indexed 番号バッジ
//   - test 用 data-* 属性
//
// SlideView は描画コアのみを担当。本 FC は SlideView をラップし「リストアイテムとして
// 提示する」装飾レイヤー。Group D の Edit canvas は別 wrapper FC (EditSlideArea 等) を
// 用意し、同じく SlideView を内包する。

interface SlideThumbViewProps extends SlideViewProps {
	index: number;
	selected: boolean;
	onClick: () => void;
	/** thumb の固定高さ (px)。デフォルト 110 (legacy THUMB_HEIGHT 互換)。 */
	thumbHeight?: number;
}

export const SlideThumbView: FC<SlideThumbViewProps> = ({
	slide,
	index,
	selected,
	bgColor,
	onClick,
	thumbHeight = 110,
}) => {
	const scale = thumbHeight / slide.height;
	// 浮動小数点誤差で 220.00000000000003px 等になるのを避けるため整数化
	const scaledWidth = Math.round(slide.width * scale);

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
		// 縮小された見かけ寸法を border の内側として確保
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

	return (
		<div
			style={itemStyle}
			data-slide-index={index}
			data-selected={selected ? "true" : "false"}
			data-disabled={slide.disabled ? "true" : "false"}
			onClick={onClick}
		>
			<div style={scaledInnerStyle}>
				<SlideView slide={slide} bgColor={bgColor} />
			</div>
			<span style={indexLabelStyle}>{index + 1}</span>
		</div>
	);
};
