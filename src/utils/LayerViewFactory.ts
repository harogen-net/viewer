import $ from "jquery";
import { Layer, LayerType } from "../model/Layer";
import { ImageLayer } from "../model/layer/ImageLayer";
import { TextLayer } from "../model/layer/TextLayer";
import { LayerView } from "../view/LayerView";
import { ImageView } from "../view/layer/ImageView";
import { TextView } from "../view/layer/TextView";

function makeLayerWrapper(): JQuery {
	return $('<div class="layerWrapper" />');
}

export class LayerViewFactory {
	public static ViewFromLayer(layer: Layer): LayerView {
		switch (layer.type) {
			case LayerType.IMAGE:
				return new ImageView(layer as ImageLayer, makeLayerWrapper());
			case LayerType.TEXT:
				return new TextView(layer as TextLayer, makeLayerWrapper());
			default:
				return new LayerView(layer, makeLayerWrapper());
		}
	}
}
