import type { CSSProperties, FC } from "react";
import type { Layer } from "../../types/Layer";
import { LayerType } from "../../types/Layer";
import type { Slide } from "../../types/Slide";
import { LayerContent } from "../layer/LayerContent";

// スライドショー 1 フレーム描画 (§9、legacy DOMSlideView 相当)。
// SlideView と異なり:
//   - 可視レイヤーを **配列 index でキー付け** (join keep 時に DOM を維持し transform を tween するため)
//   - tween=true で wrapper に CSS transition を付与 (join 連動でなめらかに移動)
//   - mirrorH/mirrorV で container を反転 (Shell ではなく本体側で適用) しつつ、
//     text / isText レイヤーは avoidMirror で逆反転して可読性を保つ (legacy avoidMirror)
//
// 座標系は slide native 寸法。拡大/中央寄せは呼び出し側 (SlideshowShell) が CSS transform で行う。

interface SlideshowStageProps {
	slide: Slide;
	bgColor?: string;
	/** join 連動 tween (前フレームからの transform 補間)。 */
	tween: boolean;
	/** tween 時間 (ms)。 */
	tweenMs: number;
	mirrorH: boolean;
	mirrorV: boolean;
}

// avoidMirror: container 反転下でも text/isText が読めるよう、当該レイヤーの mirror を逆に振る。
// 回転 ±90° 付近では縦横の反転軸を入れ替える (legacy SlideShowViewController.avoidMirror)。
const isQuarterRotated = (deg: number): boolean =>
	(deg > 45 && deg < 135) || (deg < -45 && deg > -135);

const effectiveMirror = (
	layer: Layer,
	mirrorH: boolean,
	mirrorV: boolean
): { mh: boolean; mv: boolean } => {
	let mh = layer.mirrorH;
	let mv = layer.mirrorV;
	const isTextLike =
		layer.type === LayerType.TEXT || (layer.type === LayerType.IMAGE && layer.isText);
	if (!isTextLike) return { mh, mv };
	const quarter = isQuarterRotated(layer.rotation);
	if (mirrorH) {
		if (quarter) mv = !mv;
		else mh = !mh;
	}
	if (mirrorV) {
		if (quarter) mh = !mh;
		else mv = !mv;
	}
	return { mh, mv };
};

const transformCss = (layer: Layer, mh: boolean, mv: boolean): string => {
	const sx = layer.scaleX * (mh ? -1 : 1);
	const sy = layer.scaleY * (mv ? -1 : 1);
	return `translate(${layer.transX}px, ${layer.transY}px) rotate(${layer.rotation}deg) scale(${sx}, ${sy})`;
};

export const SlideshowStage: FC<SlideshowStageProps> = ({
	slide,
	bgColor,
	tween,
	tweenMs,
	mirrorH,
	mirrorV,
}) => {
	const rootStyle: CSSProperties = {
		position: "relative",
		width: slide.width,
		height: slide.height,
		overflow: "hidden",
		background: bgColor ?? "#ffffff",
		// container 反転 (text は avoidMirror で個別逆反転して可読維持)
		transform: `scale(${mirrorH ? -1 : 1}, ${mirrorV ? -1 : 1})`,
		transformOrigin: "50% 50%",
	};

	// 可視レイヤーのみ、配列 index でキー付け (keep tween 時の DOM 維持に必須)。
	const visible = slide.layers.filter((l) => l.visible);

	return (
		<div style={rootStyle} data-slideshow-stage data-slide-id={slide.id}>
			{visible.map((layer, i) => {
				const { mh, mv } = effectiveMirror(layer, mirrorH, mirrorV);
				const wrapperStyle: CSSProperties = {
					position: "absolute",
					left: 0,
					top: 0,
					lineHeight: 0,
					fontSize: 0,
					whiteSpace: "nowrap",
					opacity: layer.opacity,
					transform: transformCss(layer, mh, mv),
					transition: tween
						? `transform ${tweenMs}ms cubic-bezier(.4,0,.7,1), opacity ${tweenMs}ms linear`
						: undefined,
				};
				return (
					// key は可視レイヤー内の index (uuid ではない) → join 同構造なら DOM 維持で tween。
					// biome-ignore lint/suspicious/noArrayIndexKey: keep tween のため index キーが必須
					<div key={i} style={wrapperStyle} data-layer-id={layer.id} data-layer-type={layer.type}>
						{/* スライドショーでは常に clip-path inset を出し (forceInset)、keep tween 時は
						    clip-path にも transition を付けて clipRect を補間する (legacy ImageView 互換)。 */}
						<LayerContent
							layer={layer}
							clip={{ forceInset: true, transitionMs: tween ? tweenMs : undefined }}
						/>
					</div>
				);
			})}
		</div>
	);
};
