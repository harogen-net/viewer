import type { ImageLayer } from "@/types/Layer";
import { LayerType } from "@/types/Layer";
import type { Slide } from "@/types/Slide";
import type { ViewerDocument } from "@/types/ViewerDocument";

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
	/**
	 * 画像レイヤーを強くぼかして描く (センシティブ文書のサムネ用、§sensitive-mode-spec)。
	 * 出力寸法に比例した半径で「内容が判別できない程度」に暈す。暗号ではなくカジュアル秘匿。
	 */
	blur?: boolean;
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
	// 縮小描画 (サムネ) の品質を上げる。既定 (low) だと細線がジャギる。
	ctx.imageSmoothingEnabled = true;
	ctx.imageSmoothingQuality = "high";

	if (bgColor) {
		ctx.fillStyle = bgColor;
		ctx.fillRect(0, 0, canvas.width, canvas.height);
	} else {
		ctx.clearRect(0, 0, canvas.width, canvas.height);
	}

	// センシティブ: 背景描画後、画像レイヤーだけを強くぼかす。半径は出力の短辺比例で
	// 内容が判別できない程度にする (ctx.filter 非対応環境では単に無視される)。
	if (options?.blur) {
		const BLUR_STRENGTH_DIVISOR = 16; // 大きいほど弱い
		const blurPx = Math.max(
			4,
			Math.round(Math.min(targetWidth, targetHeight) / BLUR_STRENGTH_DIVISOR)
		);

		ctx.filter = `blur(${blurPx}px)`;
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
	ctx.filter = "none";
	return canvas;
};

// サムネ生成共通オプション。
//   - maxPx:    長辺をこの px に収める縮小 (軽量サムネ用)。未指定は原寸
//   - mimeType: 出力形式 (既定 "image/png"。サムネは "image/jpeg" 推奨で軽量)
//   - quality:  jpeg/webp の品質 0..1
export interface ThumbnailRenderOptions {
	maxPx?: number;
	mimeType?: string;
	quality?: number;
	/** センシティブ文書用: 画像を判別不可までぼかす。 */
	blur?: boolean;
}

// 1 slide を縮小サムネ dataURL に焼く (共通レンダラ)。
const renderThumbDataURL = async (
	slide: Slide,
	bgColor: string | undefined,
	imageDataMap: Record<string, string>,
	opts?: ThumbnailRenderOptions
): Promise<string> => {
	let targetWidth: number | undefined;
	let targetHeight: number | undefined;
	if (opts?.maxPx && opts.maxPx > 0) {
		const scale = Math.min(1, opts.maxPx / Math.max(slide.width, slide.height));
		targetWidth = Math.max(1, Math.round(slide.width * scale));
		targetHeight = Math.max(1, Math.round(slide.height * scale));
	}
	const canvas = await drawSlideToCanvas(slide, bgColor, imageDataMap, {
		targetWidth,
		targetHeight,
		blur: opts?.blur,
	});
	return canvas.toDataURL(opts?.mimeType ?? "image/png", opts?.quality);
};

/**
 * total 個の要素から n 個を「両端含めて均等」に選んだ index 配列を返す (純関数)。
 * - total/n が 0 以下なら []
 * - n >= total なら全 index [0..total-1]
 * - n == 1 なら [0]
 * 例: pickEvenIndices(10, 5) → [0, 2, 5, 7, 9]
 */
export const pickEvenIndices = (total: number, n: number): number[] => {
	if (total <= 0 || n <= 0) return [];
	const k = Math.min(n, total);
	if (k === 1) return [0];
	return Array.from({ length: k }, (_, i) => Math.round((i * (total - 1)) / (k - 1)));
};

/** ドキュメントサムネのデフォルト最大枚数 (1..この値の範囲で均等ピック)。 */
export const DEFAULT_MAX_THUMBNAILS = 8;

/**
 * 選択スライド (allSlides 全体の index) が active (非 disabled) 配列の何番目かを返す (純関数)。
 * selectedIndex が範囲外、または選択スライドが disabled (active に無い) なら 0 (先頭起点)。
 */
export const resolveStripStartPos = (
	allSlides: Slide[],
	active: Slide[],
	selectedIndex?: number
): number => {
	if (selectedIndex == null || selectedIndex < 0 || selectedIndex >= allSlides.length) return 0;
	const idx = active.indexOf(allSlides[selectedIndex]);
	return idx >= 0 ? idx : 0;
};

/**
 * active 配列を startPos 起点に回転し、maxCount 枚を均等ピックした順序を返す (純関数)。
 * 枚数・均等ピックの順序は pickEvenIndices に委ねる (= 起点だけ回転で変える)。
 * 例: pickStripOrder([1,2,3,4,5], 8, 2) → [3,4,5,1,2]。
 */
export const pickStripOrder = <T>(active: T[], maxCount: number, startPos: number): T[] => {
	if (active.length === 0) return [];
	const s = startPos > 0 && startPos < active.length ? startPos : 0;
	const rotated = s === 0 ? active : [...active.slice(s), ...active.slice(0, s)];
	return pickEvenIndices(rotated.length, maxCount).map((i) => rotated[i]);
};

/**
 * ViewerDocument から代表スライドを 1 枚選んで dataURL を返す。対象 slide が無ければ null。
 * options.pages で代表 slide を指定 (既定は durationRatio 降順先頭)。
 */
export const generateSlideThumbnailDataURL = async (
	doc: ViewerDocument,
	imageDataMap: Record<string, string>,
	options?: ThumbnailRenderOptions & { pages?: number[] }
): Promise<string | null> => {
	const slide = pickThumbnailSlide(doc, options?.pages);
	if (!slide) return null;
	return renderThumbDataURL(slide, doc.bgColor, imageDataMap, options);
};

/** 連結サムネ (フィルムストリップ) 1 枚 + コマ数。 */
export interface DocThumbnailStrip {
	/** 横方向に frames コマを等幅連結した 1 枚画像 dataURL。 */
	thumb: string;
	/** 連結コマ数 (1..maxCount)。表示側はこれで 1 コマ幅を割り出してクロップ/切替する。 */
	frames: number;
}

/**
 * active (非 disabled) な slide から均等に最大 maxCount 枚ピックし、
 * **横方向に連結した 1 枚のフィルムストリップ画像** + コマ数を返す。
 * 各コマは frameMaxPx に収めた等寸。active が 0 枚なら null。
 * (表示側は frames で 1 コマ幅を割り出し、通常 1 コマ目・ホバーで順次切替する)
 *
 * selectedIndex (doc.slides 全体の index) を渡すと、その選択スライドを **起点** に active を
 * 回転してからピックする (枚数・均等ピックの順序ロジックは不変、開始位置だけ選択スライドにする)。
 * 例: 有効 5 枚で slide3 (index 2) 選択 → 3,4,5,1,2 の順。選択が無効/disabled なら先頭起点。
 */
export const generateDocThumbnailStrip = async (
	doc: ViewerDocument,
	imageDataMap: Record<string, string>,
	options?: {
		maxCount?: number;
		frameMaxPx?: number;
		mimeType?: string;
		quality?: number;
		selectedIndex?: number;
		/** センシティブ文書用: 各コマを判別不可までぼかす。 */
		blur?: boolean;
	}
): Promise<DocThumbnailStrip | null> => {
	const active = doc.slides.filter((s) => !s.disabled);
	if (active.length === 0) return null;
	// 選択スライドを起点に active を回転 → 均等ピック (選択が範囲外/disabled なら先頭起点 = 従来動作)。
	const startPos = resolveStripStartPos(doc.slides, active, options?.selectedIndex);
	const picked = pickStripOrder(active, options?.maxCount ?? DEFAULT_MAX_THUMBNAILS, startPos);
	// コマ寸法は先頭コマのアスペクトを frameMaxPx に収めて決定 (全コマ等寸でクロップを単純化)。
	const base = picked[0];
	const maxPx = options?.frameMaxPx ?? 240;
	const scale = Math.min(1, maxPx / Math.max(base.width, base.height));
	const frameW = Math.max(1, Math.round(base.width * scale));
	const frameH = Math.max(1, Math.round(base.height * scale));

	const strip = document.createElement("canvas");
	strip.width = frameW * picked.length;
	strip.height = frameH;
	const ctx = strip.getContext("2d");
	if (!ctx) throw new Error("canvas 2d context が取得できません");
	for (let i = 0; i < picked.length; i++) {
		const frame = await drawSlideToCanvas(picked[i], doc.bgColor, imageDataMap, {
			targetWidth: frameW,
			targetHeight: frameH,
			blur: options?.blur,
		});
		ctx.drawImage(frame, i * frameW, 0);
	}
	return {
		thumb: strip.toDataURL(options?.mimeType ?? "image/jpeg", options?.quality),
		frames: picked.length,
	};
};
