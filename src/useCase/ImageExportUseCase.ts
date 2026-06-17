import JSZip from "jszip";
import { Slide } from "../model/Slide";
import { DataUtil } from "../utils/DataUtil";
import { SlideToPNGConverter } from "../utils/SlideToPNGConverter";

export type ImageExportContext = {
	title: string;
	width: number;
	height: number;
	bgColor: string;
};

/** Render a single slide as a PNG and trigger a browser download. */
export function downloadSlideAsPNG(
	slide: Slide,
	indexInDocument: number,
	context: ImageExportContext
): void {
	const { title, width, height, bgColor } = context;
	const converter = new SlideToPNGConverter();
	const canvas = converter.slide2canvas(slide, width, height, 1, bgColor);
	DataUtil.downloadBlob(
		DataUtil.dataURItoBlob(canvas.toDataURL()),
		title + "_" + (indexInDocument + 1) + ".png"
	);
}

/** Render all enabled slides into a single ZIP and trigger a browser download. */
export function downloadAllSlidesAsZip(
	slides: readonly Slide[],
	context: ImageExportContext
): void {
	const { title, width, height, bgColor } = context;
	const converter = new SlideToPNGConverter();
	const zip = new JSZip();
	slides.forEach((slide, index) => {
		if (slide.disabled) return;
		const canvas = converter.slide2canvas(slide, width, height, 1, bgColor);
		zip.file(title + "_" + (index + 1) + ".png", DataUtil.dataURItoBlob(canvas.toDataURL()));
	});
	zip.generateAsync({ type: "blob", compression: "DEFLATE" }).then((blob) => {
		DataUtil.downloadBlob(blob, title + ".zip");
	});
}
