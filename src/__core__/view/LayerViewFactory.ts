import { Layer, LayerType } from "../model/Layer";
import { LayerView } from "./LayerView";
import { ImageView } from "./ImageView";
import { TextView } from "./TextView";
import { ImageLayer } from "../model/ImageLayer";
import { TextLayer } from "../model/TextLayer";

declare var $:any;

export class LayerViewFactory {
	public static layerViewFromData(data:Layer):LayerView {
		switch(data.type){
			case LayerType.IMAGE:
				return new ImageView(data as ImageLayer, $('<div class="layerWrapper" />'));
			case LayerType.TEXT:
				return new TextView(data as TextLayer, $('<div class="layerWrapper"  />'));
			default:
				return new LayerView(data, $('<div class="layerWrapper"  />'));
//				return null;
		}
	}
}