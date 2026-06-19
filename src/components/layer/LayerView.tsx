import type { CSSProperties, FC } from "react";
import type { Layer } from "../../types/Layer";
import { LayerContent } from "./LayerContent";

// レイヤー 1 枚の wrapper FC (v3 Group A build 3、§0-10 新側内製)。
// レガシー src/view/LayerView.ts (jQuery + Matrix4) を import せず新規実装。
//
// レガシー DOM 構造に合わせる: `<div class="layerWrapper">` が transform を持ち、
// 内側のコンテンツ (img / div.text) は通常の block レイアウトでサイズ確定する。
// inline-block + position:absolute により wrapper サイズ = コンテンツの shrink-to-fit。
// transform-origin はレガシーと同様 CSS default (50% 50% = コンテンツ中心)。
// これにより text のサイズ確定が browser layout 経由で正しく行われる
// (legacy の `originWidth = textObj.find("span").width()` 相当を browser layout が担保)。
//
// 編集モード固有の責務 (selected 表示, locked, クリック等) は Group D で追加する。

function transformCss(layer: Layer): string {
	const sx = layer.scaleX * (layer.mirrorH ? -1 : 1);
	const sy = layer.scaleY * (layer.mirrorV ? -1 : 1);
	// 順序は translate → rotate → scale (レガシー Layer.matrix と等価)。
	return `translate(${layer.transX}px, ${layer.transY}px) rotate(${layer.rotation}deg) scale(${sx}, ${sy})`;
}

export const LayerView: FC<{ layer: Layer }> = ({ layer }) => {
	if (!layer.visible) return null;

	const wrapperStyle: CSSProperties = {
		// レガシー .slide .layerWrapper (css/index.css L267-273) と同等
		display: "inline-block",
		position: "absolute",
		left: 0,
		top: 0,
		lineHeight: 0,
		fontSize: 0,
		whiteSpace: "nowrap",
		opacity: layer.opacity,
		transform: transformCss(layer),
		// transform-origin は CSS default (50% 50%) のまま = コンテンツ中心基準。
		// 内側のコンテンツは natural size でレイアウトされ wrapper がそれを包む。
	};

	return (
		<div style={wrapperStyle} data-layer-id={layer.id} data-layer-type={layer.type}>
			<LayerContent layer={layer} />
		</div>
	);
};
