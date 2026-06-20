import type { ImageLayer } from "../types/Layer";
import { LayerType } from "../types/Layer";
import type { Slide } from "../types/Slide";
import type { ViewerDocument } from "../types/ViewerDocument";

// スライド canvas 描画 (v3 Group B、§0-10 新側内製、v4 Group C C-10 で thumb 表示にも転用)。
// レガシー src/utils/SlideToPNGConverter.ts (model class + ImageManager.shared 依存) を
// pure types で再実装したもの。画像レイヤーのみを canvas に描画する
// (text はスキップ、レガシー drawSlide2Canvas と同挙動)。
//
// 用途:
//   - PNG export 時の hvDc 埋め込みベース PNG (generateSlideThumbnailDataURL)
//   - SlideListPanel の thumb 描画 (drawSlideToCanvas を直接呼ぶ、in-place 描画で
//     DOM 要素の量を 1 canvas に抑えてメモリ負荷を下げる)
//
// 非対応環境 (jsdom 等で canvas 出力が空になる場合) は呼び出し側が transparent
// fallback を選択する想定。

const loadImageElement = (dataURL: string): Promise<HTMLImageElement> =>
	new Promise((resolve, reject) => {
		const img = new Image();
		img.onload = () => resolve(img);
		img.onerror = () => reject(new Error("image load failed"));
		img.src = dataURL;
	});

/**
 * thumbnail 化する slide を doc.slides から 1 枚選ぶ。
 * レガシー SlideToPNGConverter と同じく durationRatio 降順の先頭、
 * pages 指定があればその先頭 index を優先。
 */
const pickThumbnailSlide = (doc: ViewerDocument, pages?: number[]): Slide | null => {
	if (doc.slides.length === 0) return null;
	if (pages && pages.length > 0) return doc.slides[pages[0]] ?? null;
	const sorted = [...doc.slides].sort((a, b) => b.durationRatio - a.durationRatio);
	return sorted[0];
};

export interface DrawSlideToCanvasOptions {
	/** 既存 canvas に in-place 描画 (新規 alloc を避ける、thumb 用)。 */
	targetCanvas?: HTMLCanvasElement;
	/** 出力寸法。指定時は ctx に scale を掛けて縮小描画 (default = slide 寸法)。 */
	targetWidth?: number;
	targetHeight?: number;
}

/**
 * 1 スライドを HTMLCanvasElement に描画する (画像レイヤーのみ)。
 * アフィン変換は translate(transX,transY) → rotate(rotation) → scale(s, mirror)
 * → translate(-imgW/2, -imgH/2) の順 (レガシー drawSlide2Canvas 互換)。
 *
 * options.targetCanvas を渡すとそれに in-place 描画 (size は targetWidth/Height 値で
 * 上書き)。渡さない場合は新規 canvas を作成。
 * options.targetWidth/Height を渡すと ctx に scale を掛けて縮小 (slide 寸法を 100% として)。
 */
export const drawSlideToCanvas = async (
	slide: Slide,
	bgColor: string | undefined,
	imageDataMap: Record<string, string>,
	options?: DrawSlideToCanvasOptions,
): Promise<HTMLCanvasElement> => {
	const targetWidth = options?.targetWidth ?? slide.width;
	const targetHeight = options?.targetHeight ?? slide.height;
	const canvas = options?.targetCanvas ?? document.createElement("canvas");
	canvas.width = targetWidth;
	canvas.height = targetHeight;
	const ctx = canvas.getContext("2d");
	if (!ctx) throw new Error("canvas 2d context が取得できません");

	if (bgColor) {
		ctx.fillStyle = bgColor;
		ctx.fillRect(0, 0, canvas.width, canvas.height);
	} else {
		ctx.clearRect(0, 0, canvas.width, canvas.height);
	}

	// targetWidth/Height が slide 寸法と異なる場合、以降の描画を縮小するため ctx に base scale を掛ける。
	const baseScaleX = targetWidth / slide.width;
	const baseScaleY = targetHeight / slide.height;

	// 必要な画像を事前ロード (imageId 重複は dedupe)。
	const imageCache = new Map<string, HTMLImageElement>();
	for (const layer of slide.layers) {
		if (layer.type !== LayerType.IMAGE) continue;
		const imgLayer = layer as ImageLayer;
		if (imageCache.has(imgLayer.imageId)) continue;
		const dataURL = imageDataMap[imgLayer.imageId];
		if (!dataURL) continue;
		try {
			imageCache.set(imgLayer.imageId, await loadImageElement(dataURL));
		} catch (e) {
			console.warn("[slideThumbnail] image load failed:", imgLayer.imageId, e);
		}
	}

	for (const layer of slide.layers) {
		if (layer.type !== LayerType.IMAGE) continue;
		const imgLayer = layer as ImageLayer;
		if (!imgLayer.visible) continue;
		const img = imageCache.get(imgLayer.imageId);
		if (!img) continue;

		ctx.resetTransform();
		// base scale (slide → target 縮小) を一律先頭で適用
		ctx.scale(baseScaleX, baseScaleY);
		ctx.translate(imgLayer.transX, imgLayer.transY);
		ctx.rotate((imgLayer.rotation * Math.PI) / 180);
		ctx.scale(
			imgLayer.scaleX * (imgLayer.mirrorH ? -1 : 1),
			imgLayer.scaleY * (imgLayer.mirrorV ? -1 : 1),
		);
		ctx.translate(-img.naturalWidth / 2, -img.naturalHeight / 2);
		ctx.globalAlpha = imgLayer.opacity;

		const [top, right, bottom, left] = imgLayer.clipRect;
		const isClipped = top !== 0 || right !== 0 || bottom !== 0 || left !== 0;
		if (isClipped) {
			const clippedW = img.naturalWidth - left - right;
			const clippedH = img.naturalHeight - top - bottom;
			ctx.drawImage(img, left, top, clippedW, clippedH, left, top, clippedW, clippedH);
		} else {
			ctx.drawImage(img, 0, 0);
		}
	}

	ctx.resetTransform();
	ctx.globalAlpha = 1;
	return canvas;
};

/**
 * ViewerDocument から代表スライドを 1 枚選んで PNG dataURL を返す。
 * 対象 slide が無い (空 doc) なら null。
 */
export const generateSlideThumbnailDataURL = async (
	doc: ViewerDocument,
	imageDataMap: Record<string, string>,
	options?: { pages?: number[] },
): Promise<string | null> => {
	const slide = pickThumbnailSlide(doc, options?.pages);
	if (!slide) return null;
	const canvas = await drawSlideToCanvas(slide, doc.bgColor, imageDataMap);
	return canvas.toDataURL("image/png");
};
