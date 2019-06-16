import { Layer, LayerType } from "../layerModel/Layer";
import { LayerView } from "./LayerView";
import { ImageView } from "./ImageView";
import { TextView } from "./TextView";
import { Image } from "../layerModel/Image";
import { TextLayer } from "../layerModel/TextLayer";

declare var $:any;

export class LayerViewFactory {
	public static layerViewFromData(data:Layer):LayerView {
		switch(data.type){
			case LayerType.IMAGE:
				return new ImageView(data as Image, $('<div class="layerWrapper" />'));
			case LayerType.TEXT:
				return new TextView(data as TextLayer, $('<div />'));
			default:
				return new LayerView(data, $('<div />'));
//				return null;
		}
	}
}