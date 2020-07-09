import { Layer, LayerType } from "../model/Layer";
import { LayerView } from "../view/LayerView";
import { ImageView } from "../view/layer/ImageView";
import { TextView } from "../view/layer/TextView";
import { ImageLayer } from "../model/layer/ImageLayer";
import { TextLayer } from "../model/layer/TextLayer";

declare var $:any;

export class LayerViewFactory {
	public static ViewFromLayer(layer:Layer):LayerView {
		switch(layer.type){
			case LayerType.IMAGE:
				return new ImageView(layer as ImageLayer, $('<div class="layerWrapper" />'));
			case LayerType.TEXT:
				return new TextView(layer as TextLayer, $('<div class="layerWrapper"  />'));
			default:
				return new LayerView(layer, $('<div class="layerWrapper"  />'));
//				return null;
		}
	}
}