import type { CSSProperties, FC } from "react";
import type { Slide } from "../../types/Slide";
import { LayerView } from "../layer/LayerView";

// スライド 1 枚の描画 FC (v3 Group A build 4、§0-10 新側内製)。
// レガシー src/view/SlideView.ts / src/view/slide/DOMSlideView.ts / CanvasSlideView.ts /
// ThumbSlideView.ts / EditableSlideView.ts は import せず新規実装。
//
// Group A 時点では display モードのみ (読み取り専用)。
// Group C で mode="thumb" 拡張、Group D で mode="edit" 拡張する予定。
// 現状は mode prop なし、display 専用の素朴な描画。

interface SlideViewProps {
	slide: Slide;
	/** ViewerDocument.bgColor を渡す。未指定なら白。 */
	bgColor?: string;
}

export const SlideView: FC<SlideViewProps> = ({ slide, bgColor }) => {
	// position:relative + 固定サイズ + overflow:hidden で
	// 子の LayerView (position:absolute) の原点と clipping を確立する。
	const style: CSSProperties = {
		position: "relative",
		width: slide.width,
		height: slide.height,
		overflow: "hidden",
		background: bgColor ?? "#ffffff",
	};

	return (
		<div style={style} data-slide-id={slide.id}>
			{slide.layers.map((layer) => (
				// 配列順 = 描画順 (先頭が下、末尾が上)。レガシー DOM 挿入順と同等。
				// key は uuid (HVD 非保存の React 識別子、types/Layer.ts 規約)。
				<LayerView key={layer.uuid} layer={layer} />
			))}
		</div>
	);
};
