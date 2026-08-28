import type { DocId } from "./DocId";
import type { Slide } from "./Slide";

/**
 * ViewerDocument の純粋 type 定義 (data only)。
 * src/model/ViewerDocument.ts class に対応する serializable な形。
 * bgColor / duration / interval / isSensitive は optional (HVD で省略可能)。
 */
export interface ViewerDocument {
	/**
	 * 永続 ID (docs/document-id-plan.md)。**未保存の間は undefined**。
	 * 保存時に採番して確定する (読込時に採番すると、同じファイルを 2 回開くだけで
	 * 2 個の ID ができてしまう)。docId を持たないレガシー HVD もここが undefined。
	 */
	docId?: DocId;
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
