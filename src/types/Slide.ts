import type { Layer } from "./Layer";

/**
 * Slide の描画モード (LayerType と同じ const types パターン)。
 * SlideView の mode prop / SlideListPanel 等で使用。
 */
export const SlideDisplayMode = {
	DISPLAY: "display",
	THUMB: "thumb",
} as const;
export type SlideDisplayMode = (typeof SlideDisplayMode)[keyof typeof SlideDisplayMode];

/**
 * Slide の純粋 type 定義 (data only)。
 * src/model/Slide.ts class に対応する serializable な形。
 */
export interface Slide {
	id: number;
	uuid: string;
	width: number;
	height: number;
	durationRatio: number;
	joining: boolean;
	disabled: boolean;
	layers: Layer[];
}
