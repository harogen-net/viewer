import { Layer, LayerType } from "../model/Layer";
import { LayerView } from "./LayerView";
import { ImageView } from "./ImageView";
import { TextView } from "./TextView";
import { ImageLayer } from "../model/ImageLayer";
import { TextLayer } from "../model/TextLayer";

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