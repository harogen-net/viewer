import type { ImageLayer } from "../types/Layer";
import { LayerType } from "../types/Layer";
import type { Slide } from "../types/Slide";
import type { ViewerDocument } from "../types/ViewerDocument";

// スライドサムネイル生成 (v3 Group B、§0-10 新側内製)。
// レガシー src/utils/SlideToPNGConverter.ts (model class + ImageManager.shared
// 依存) を pure types で再実装したもの。画像レイヤーのみを canvas に描画する
// (text はスキップ、レガシー thumbnail と同挙動)。
//
// 用途: PNG export 時の hvDc 埋め込みベース PNG。将来 SlideList の slide 別
// サムネ等にも再利用可能 (DOM canvas が使える環境前提)。
//
// 非対応環境 (jsdom 等で canvas 出力が空になる場合) は呼び出し側が transparent
// fallback を選択する想定。

function loadImageElement(dataURL: string): Promise<HTMLImageElement> {
	return new Promise((resolve, reject) => {
		const img = new Image();
		img.onload = () => resolve(img);
		img.onerror = () => reject(new Error("image load failed"));
		img.src = dataURL;
	});
}

/**
 * thumbnail 化する slide を doc.slides から 1 枚選ぶ。
 * レガシー SlideToPNGConverter と同じく durationRatio 降順の先頭、
 * pages 指定があればその先頭 index を優先。
 */
function pickThumbnailSlide(doc: ViewerDocument, pages?: number[]): Slide | null {
	if (doc.slides.length === 0) return null;
	if (pages && pages.length > 0) return doc.slides[pages[0]] ?? null;
	const sorted = [...doc.slides].sort((a, b) => b.durationRatio - a.durationRatio);
	return sorted[0];
}

/**
 * 1 スライドを HTMLCanvasElement に描画する (画像レイヤーのみ)。
 * アフィン変換は translate(transX,transY) → rotate(rotation) → scale(s, mirror)
 * → translate(-imgW/2, -imgH/2) の順 (レガシー drawSlide2Canvas 互換)。
 */
async function drawSlideToCanvas(
	slide: Slide,
	bgColor: string | undefined,
	imageDataMap: Record<string, string>,
): Promise<HTMLCanvasElement> {
	const canvas = document.createElement("canvas");
	canvas.width = slide.width;
	canvas.height = slide.height;
	const ctx = canvas.getContext("2d");
	if (!ctx) throw new Error("canvas 2d context が取得できません");

	if (bgColor) {
		ctx.fillStyle = bgColor;
		ctx.fillRect(0, 0, canvas.width, canvas.height);
	} else {
		ctx.clearRect(0, 0, canvas.width, canvas.height);
	}

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

	ctx.globalAlpha = 1;
	return canvas;
}

/**
 * ViewerDocument から代表スライドを 1 枚選んで PNG dataURL を返す。
 * 対象 slide が無い (空 doc) なら null。
 */
export async function generateSlideThumbnailDataURL(
	doc: ViewerDocument,
	imageDataMap: Record<string, string>,
	options?: { pages?: number[] },
): Promise<string | null> {
	const slide = pickThumbnailSlide(doc, options?.pages);
	if (!slide) return null;
	const canvas = await drawSlideToCanvas(slide, doc.bgColor, imageDataMap);
	return canvas.toDataURL("image/png");
}
