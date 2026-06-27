import type { CSSProperties, FC } from "react";
import type { LiveTransform } from "../../hooks/useLayerGesture";
import type { Slide } from "../../types/Slide";
import { LayerView } from "../layer/LayerView";

// スライド 1 枚の **native 寸法** 描画 FC (v4 Group C C-3R で role を最小化)。
// レガシー src/view/SlideView.ts / src/view/slide/*.ts は import せず新規実装 (§0-10)。
//
// 責務: slide.width × slide.height の領域に layers を描画するだけ。
//   - 装飾 (選択枠 / disabled opacity / 番号バッジ): 親 wrapper の責務 (SlideThumbView 等)
//   - サムネ縮小 (CSS scale): 同上 (SlideThumbView)
//   - 編集アフォーダンス (handle / drag): Group D で別 wrapper FC (EditSlideArea 等)
//
// この FC は consumer (Slideshow / SlideThumbView / Edit) すべてで同じ pure な
// 描画コアを共有するため、mode prop を持たない (mode で分岐するものは別 FC へ)。

export interface SlideViewProps {
	slide: Slide;
	/** ViewerDocument.bgColor を渡す。未指定なら白。 */
	bgColor?: string;
	/** 編集中ドラッグの暫定 transform (確定前)。一致 uuid のレイヤーをドラッグに即追従させる。 */
	live?: LiveTransform | null;
}

export const SlideView: FC<SlideViewProps> = ({ slide, bgColor, live }) => {
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
				<LayerView
					key={layer.uuid}
					layer={layer}
					live={live && live.uuid === layer.uuid ? live : null}
				/>
			))}
		</div>
	);
};
