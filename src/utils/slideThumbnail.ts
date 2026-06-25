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
//   - SlideListPanel の thumb 描画 (完成した canvas を受け取り、呼び出し側が可視 canvas へ
//     同期 drawImage で転写する。DOM 要素の量を 1 canvas に抑えてメモリ負荷を下げる)
//
// 本関数は「画像を全てロードしてから canvas を生成・同期描画して返す」純粋処理。
// 可視 canvas を直接受け取って in-place 描画すると、画像ロードの await 中に空白フレームが
// 見えてチラつくため、その責務は持たず完成済み canvas を返すだけにしている。
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
	/** 出力寸法。指定時は ctx に scale を掛けて縮小描画 (default = slide 寸法)。 */
	targetWidth?: number;
	targetHeight?: number;
}

/**
 * 1 スライドを新規 HTMLCanvasElement に描画して返す (画像レイヤーのみ)。
 * アフィン変換は translate(transX,transY) → rotate(rotation) → scale(s, mirror)
 * → translate(-imgW/2, -imgH/2) の順 (レガシー drawSlide2Canvas 互換)。
 *
 * 画像を全てロードしてから canvas 生成・描画を同期実行する (チラツキ防止: ヘッダ参照)。
 * options.targetWidth/Height を渡すと ctx に scale を掛けて縮小 (slide 寸法を 100% として)。
 */
export const drawSlideToCanvas = async (
	slide: Slide,
	bgColor: string | undefined,
	imageDataMap: Record<string, string>,
	options?: DrawSlideToCanvasOptions
): Promise<HTMLCanvasElement> => {
	const targetWidth = options?.targetWidth ?? slide.width;
	const targetHeight = options?.targetHeight ?? slide.height;

	// targetWidth/Height が slide 寸法と異なる場合、以降の描画を縮小するため ctx に base scale を掛ける。
	const baseScaleX = targetWidth / slide.width;
	const baseScaleY = targetHeight / slide.height;

	// 必要な画像を「canvas 生成より前に」全てロードする (imageId 重複は dedupe)。
	// 先にロードを済ませることで、後段の canvas 生成〜描画を await を挟まず同期実行でき、
	// 完成した canvas を受け取った呼び出し側も空白フレームなしで同期転写できる。
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

	// ここから下は同期 (await なし): canvas 生成 → 背景 → 全レイヤー描画。
	const canvas = document.createElement("canvas");
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

	for (const layer of slide.layers) {
		if (layer.type !== LayerType.IMAGE) continue;
		const imgLayer = layer as ImageLayer;
		if (!imgLayer.visible) continue;
		const img = imageCache.get(imgLayer.imageId);
		if (!img) continue;

		ctx.resetTransform();
		// base scale (slide → target 縮小) を一律先頭で適用
		ctx.scale(baseScaleX, baseScaleY);
		// transX/transY は content 中心 (= layer.x/y in legacy) の位置ではなく、
		// transform-origin: 50% 50% を仮定した CSS matrix() と同じ「中心からのオフセット」。
		// content 中心を正しい位置に持ってくるためには transX + w/2, transY + h/2 へ移動する必要がある
		// (legacy SlideToPNGConverter は image.x = transX + originWidth/2 を使っているため同等)。
		ctx.translate(imgLayer.transX + img.naturalWidth / 2, imgLayer.transY + img.naturalHeight / 2);
		ctx.rotate((imgLayer.rotation * Math.PI) / 180);
		ctx.scale(
			imgLayer.scaleX * (imgLayer.mirrorH ? -1 : 1),
			imgLayer.scaleY * (imgLayer.mirrorV ? -1 : 1)
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
	options?: { pages?: number[] }
): Promise<string | null> => {
	const slide = pickThumbnailSlide(doc, options?.pages);
	if (!slide) return null;
	const canvas = await drawSlideToCanvas(slide, doc.bgColor, imageDataMap);
	return canvas.toDataURL("image/png");
};
