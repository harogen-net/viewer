import type { Slide } from "./Slide";

/**
 * ViewerDocument の純粋 type 定義 (data only)。
 * src/model/ViewerDocument.ts class に対応する serializable な形。
 * bgColor / duration / interval / isSensitive は optional (HVD で省略可能)。
 */
export interface ViewerDocument {
	title: string;
	width: number;
	height: number;
	createTime: number;
	editTime: number;
	slides: Slide[];
	bgColor?: string;
	duration?: number;
	interval?: number;
	isSensitive?: boolean;
}
