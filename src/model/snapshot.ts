import type { Layer, LayerType } from "./Layer";
import type { ImageLayer } from "./layer/ImageLayer";
import type { TextLayer } from "./layer/TextLayer";
import type { Slide } from "./Slide";
import type { ViewerDocument } from "./ViewerDocument";

/**
 * Plain-data snapshots of the model classes.
 *
 * These are the target "single source of truth" shapes for the React side.
 * Mappers are pure functions: they only read model getters and never mutate.
 * No EventDispatcher / PropertyEvent / jQuery involvement.
 *
 * Imports are type-only so this module stays free of the model class runtime
 * dependencies (matrixgl etc.), which keeps it unit-testable in isolation.
 */

/**
 * Computes the CSS 2D affine matrix [a, b, c, d, e, f] from a layer's
 * transform. Equivalent to `Layer.matrix` (T · Rz · S) but without pulling in
 * the matrixgl runtime dependency.
 */
const computeLayerMatrix = (
	transX: number,
	transY: number,
	scaleX: number,
	scaleY: number,
	rotation: number,
	mirrorH: boolean,
	mirrorV: boolean
): [number, number, number, number, number, number] => {
	const radian = (rotation * Math.PI) / 180;
	const cos = Math.cos(radian);
	const sin = Math.sin(radian);
	const sx = scaleX * (mirrorH ? -1 : 1);
	const sy = scaleY * (mirrorV ? -1 : 1);
	return [sx * cos, sx * sin, -sy * sin, sy * cos, transX, transY];
};

export type LayerSnapshotBase = {
	id: number;
	uuid: string;
	name: string;
	visible: boolean;
	locked: boolean;
	shared: boolean;
	opacity: number;
	x: number;
	y: number;
	transX: number;
	transY: number;
	scaleX: number;
	scaleY: number;
	scale: number;
	rotation: number;
	mirrorH: boolean;
	mirrorV: boolean;
	originWidth: number;
	originHeight: number;
	width: number;
	height: number;
	/** CSS 2D affine matrix [a, b, c, d, e, f] (matches Layer.matrix). */
	matrix: [number, number, number, number, number, number];
};

export type GenericLayerSnapshot = LayerSnapshotBase & {
	type: "layer" | "shape";
};

export type ImageLayerSnapshot = LayerSnapshotBase & {
	type: "image";
	imageId: string;
	clipTop: number;
	clipRight: number;
	clipBottom: number;
	clipLeft: number;
	isText: boolean;
};

export type TextLayerSnapshot = LayerSnapshotBase & {
	type: "text";
	text: string;
};

export type LayerSnapshot = GenericLayerSnapshot | ImageLayerSnapshot | TextLayerSnapshot;

export type SlideSnapshot = {
	id: number;
	uuid: string;
	width: number;
	height: number;
	centerX: number;
	centerY: number;
	durationRatio: number;
	joining: boolean;
	disabled: boolean;
	layers: LayerSnapshot[];
};

export type DocumentSnapshot = {
	title: string;
	createTime: number;
	editTime: number;
	isSensitive: boolean;
	duration: number | undefined;
	interval: number | undefined;
	width: number;
	height: number;
	bgColor: string;
	slides: SlideSnapshot[];
};

const toLayerSnapshotBase = (layer: Layer): LayerSnapshotBase => ({
	id: layer.id,
	uuid: layer.uuid,
	name: layer.name,
	visible: layer.visible,
	locked: layer.locked,
	shared: layer.shared,
	opacity: layer.opacity,
	x: layer.x,
	y: layer.y,
	transX: layer.transX,
	transY: layer.transY,
	scaleX: layer.scaleX,
	scaleY: layer.scaleY,
	scale: layer.scale,
	rotation: layer.rotation,
	mirrorH: layer.mirrorH,
	mirrorV: layer.mirrorV,
	originWidth: layer.originWidth,
	originHeight: layer.originHeight,
	width: layer.width,
	height: layer.height,
	matrix: computeLayerMatrix(
		layer.transX,
		layer.transY,
		layer.scaleX,
		layer.scaleY,
		layer.rotation,
		layer.mirrorH,
		layer.mirrorV
	),
});

export const toLayerSnapshot = (layer: Layer): LayerSnapshot => {
	const base = toLayerSnapshotBase(layer);
	const type = layer.type as LayerType;

	if (type === "image") {
		const image = layer as ImageLayer;
		return {
			...base,
			type: "image",
			imageId: image.imageId,
			clipTop: image.clipT,
			clipRight: image.clipR,
			clipBottom: image.clipB,
			clipLeft: image.clipL,
			isText: image.isText,
		};
	}

	if (type === "text") {
		const text = layer as TextLayer;
		return {
			...base,
			type: "text",
			text: text.text,
		};
	}

	return {
		...base,
		type: type === "shape" ? "shape" : "layer",
	};
};

export const toSlideSnapshot = (slide: Slide): SlideSnapshot => ({
	id: slide.id,
	uuid: slide.uuid,
	width: slide.width,
	height: slide.height,
	centerX: slide.centerX,
	centerY: slide.centerY,
	durationRatio: slide.durationRatio,
	joining: slide.joining,
	disabled: slide.disabled,
	layers: slide.layers.map(toLayerSnapshot),
});

export const toDocumentSnapshot = (doc: ViewerDocument): DocumentSnapshot => ({
	title: doc.title,
	createTime: doc.createTime,
	editTime: doc.editTime,
	isSensitive: doc.isSensitive,
	duration: doc.duration,
	interval: doc.interval,
	width: doc.width,
	height: doc.height,
	bgColor: doc.bgColor,
	slides: doc.slides.map(toSlideSnapshot),
});
