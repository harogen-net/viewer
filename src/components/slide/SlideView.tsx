import type { CSSProperties, FC } from "react";
import type { Slide } from "../../types/Slide";
import { SlideDisplayMode } from "../../types/Slide";
import { LayerView } from "../layer/LayerView";

// スライド 1 枚の描画 FC (v3 Group A build 4 起点、v4 Group C C-2 で thumb 拡張)。
// レガシー src/view/SlideView.ts / src/view/slide/DOMSlideView.ts / CanvasSlideView.ts /
// ThumbSlideView.ts / EditableSlideView.ts は import せず新規実装 (§0-10)。
//
// mode = DISPLAY (default): slide 寸法そのままの描画。Slideshow で使用。
// mode = THUMB: CSS transform: scale で thumbHeight に縮小。SlideList で使用。
// (Group D で mode = "edit" 拡張予定、SlideDisplayMode に追加する予定)。

interface SlideViewProps {
	slide: Slide;
	/** ViewerDocument.bgColor を渡す。未指定なら白。 */
	bgColor?: string;
	/** 描画モード (default = DISPLAY)。 */
	mode?: SlideDisplayMode;
	/** THUMB モード時の固定高さ (px)。デフォルト 110 (legacy THUMB_HEIGHT 互換)。 */
	thumbHeight?: number;
}

export const SlideView: FC<SlideViewProps> = ({
	slide,
	bgColor,
	mode = SlideDisplayMode.DISPLAY,
	thumbHeight = 110,
}) => {
	// position:relative + 固定サイズ + overflow:hidden で
	// 子の LayerView (position:absolute) の原点と clipping を確立する。
	const baseStyle: CSSProperties = {
		position: "relative",
		width: slide.width,
		height: slide.height,
		overflow: "hidden",
		background: bgColor ?? "#ffffff",
	};

	// 配列順 = 描画順 (先頭が下、末尾が上)。レガシー DOM 挿入順と同等。
	// key は uuid (HVD 非保存の React 識別子、types/Layer.ts 規約)。
	const layersNode = slide.layers.map((layer) => <LayerView key={layer.uuid} layer={layer} />);

	if (mode === SlideDisplayMode.THUMB) {
		const scale = thumbHeight / slide.height;
		const wrapperStyle: CSSProperties = {
			position: "relative",
			// 浮動小数点誤差で 220.00000000000003px 等になるのを避けるため整数化
			width: Math.round(slide.width * scale),
			height: thumbHeight,
			overflow: "hidden",
		};
		const scaledStyle: CSSProperties = {
			...baseStyle,
			transform: `scale(${scale})`,
			transformOrigin: "top left",
		};
		return (
			<div style={wrapperStyle} data-slide-id={slide.id} data-mode="thumb">
				<div style={scaledStyle}>{layersNode}</div>
			</div>
		);
	}

	return (
		<div style={baseStyle} data-slide-id={slide.id} data-mode="display">
			{layersNode}
		</div>
	);
};

