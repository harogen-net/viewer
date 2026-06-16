import type { Slide } from "./Slide";

export type ViewerDocumentOptions = {
	title?: string;
	createTime?: number;
	editTime?: number;
	isSensitive?: boolean;
	duration?: number;
	interval?: number;
	width?: number;
	height?: number;
	bgColor?: string;
};

export type ViewerDocument = {
	slides: Slide[];
	title: string;
	createTime: number;
	editTime: number;
	isSensitive: boolean;
	duration: number | undefined;
	interval: number | undefined;
	width: number;
	height: number;
	bgColor: string;
};

export function createViewerDocument(
	slides: Slide[] = [],
	options: ViewerDocumentOptions = {}
): ViewerDocument {
	const createTime = options.createTime ?? 0;
	return {
		slides,
		title: options.title ?? "",
		createTime,
		editTime: options.editTime ?? createTime,
		isSensitive: options.isSensitive ?? false,
		duration: options.duration,
		interval: options.interval,
		width: options.width ?? 0,
		height: options.height ?? 0,
		bgColor: options.bgColor ?? "#000000",
	};
}
