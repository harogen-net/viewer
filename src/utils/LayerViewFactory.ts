import { Layer, LayerType } from "../model/Layer";
import { ImageViewComponent } from "../view/layer/ImageView";
import { TextViewComponent } from "../view/layer/TextView";
import { LayerViewComponent, type LayerViewProps } from "../view/LayerView";

export type LayerViewFC = (props: LayerViewProps) => React.ReactNode;

/**
 * レイヤー種別に応じた React FC を選択する。
 *
 * 旧 `LayerViewFactory.mountInto` (ネスト createRoot + flushSync) はネスト root への
 * flushSync が React のライフサイクル内で禁止されるため廃止し、
 * 呼び出し側 (`LayerHost` など) で直接 JSX 子要素として描画する方式へ移行した。
 */
export function pickLayerViewComponent(layer: Layer): LayerViewFC {
	switch (layer.type) {
		case LayerType.IMAGE:
			return ImageViewComponent;
		case LayerType.TEXT:
			return TextViewComponent;
		default:
			return LayerViewComponent;
	}
}
