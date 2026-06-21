/**
 * Layer の純粋 type 定義 (data only)。
 * src/model/Layer.ts 等の class に対応する serializable な形。
 * id は HVD で保存される識別子、uuid は React key 等 runtime identity 用 (HVD 非保存)。
 */

/** Layer.type の値カタログ (HVD で保存される文字列定数)。 */
export const LayerType = {
	IMAGE: "image",
	TEXT: "text",
	SHAPE: "shape",
	LAYER: "layer",
} as const;
export type LayerType = (typeof LayerType)[keyof typeof LayerType];

export interface LayerTransform {
	transX: number;
	transY: number;
	scaleX: number;
	scaleY: number;
	rotation: number;
	mirrorH: boolean;
	mirrorV: boolean;
}

export interface LayerBase extends LayerTransform {
	id: number;
	uuid: string;
	name: string;
	opacity: number;
	locked: boolean;
	visible: boolean;
	shared: boolean;
}

export interface ImageLayer extends LayerBase {
	type: "image";
	imageId: string;
	/** [top, right, bottom, left] */
	clipRect: [number, number, number, number];
	isText: boolean;
}

export interface TextLayer extends LayerBase {
	type: "text";
	text: string;
}

export type Layer = ImageLayer | TextLayer;
