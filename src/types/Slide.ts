import type { Layer } from "./Layer";

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
