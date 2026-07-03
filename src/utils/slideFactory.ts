import type { Layer } from "@/types/Layer";
import type { Slide } from "@/types/Slide";
import type { NewLayer } from "./layerOps";
import { newUuid } from "./uuid";

// Slide 生成 / 複製 / id 採番のための pure helpers (v4 Group C build C-1)。
// レガシー `src/model/Slide.ts` (EventDispatcher 派生 class、jQuery 連動) は
// import せず、純粋 type ベースで再実装する (§0-10)。
//
// 用途:
//   - SlideListPanel の addSlide ボタン → createEmptySlide
//   - SlideListPanel の duplicate コマンド → cloneSlide
//   - slideStore の id 採番 → nextSlideId
// HVD round-trip 維持のため id は数値、uuid は React key 用 (HVD 非保存)。

/** slides 配列内の最大 id + 1 を返す (空配列なら 1)。 */
export const nextSlideId = (slides: Slide[]): number => {
	let max = 0;
	for (const s of slides) {
		if (s.id > max) max = s.id;
	}
	return max + 1;
};

/**
 * 新規空 slide を生成。layers は空、durationRatio=1、joining=true、disabled=false。
 * legacy `new Slide(width, height)` (引数 2 つ) と同等。
 */
export const createEmptySlide = (width: number, height: number, id: number): Slide => ({
	id,
	uuid: newUuid(),
	width,
	height,
	durationRatio: 1,
	joining: true,
	disabled: false,
	layers: [],
});

/**
 * 画像 1 枚を持つ新規 slide を生成 (D-12、legacy ListViewController drop 相当)。
 * layer は id/uuid 未採番の NewLayer を受け取り、slide 内 layer id=1 + 新規 uuid を採番する。
 */
export const createImageSlide = (
	width: number,
	height: number,
	id: number,
	layer: NewLayer
): Slide => ({
	id,
	uuid: newUuid(),
	width,
	height,
	durationRatio: 1,
	joining: true,
	disabled: false,
	layers: [{ ...layer, id: 1, uuid: newUuid() } as Layer],
});

/**
 * 既存 slide を複製。新規 id + uuid、layers は浅コピーで新規 uuid 振り直し
 * (HVD 識別子 layer.id は元のまま、React key 用 uuid だけ振り直す)。
 */
export const cloneSlide = (source: Slide, id: number): Slide => ({
	...source,
	id,
	uuid: newUuid(),
	layers: source.layers.map((layer) => ({ ...layer, uuid: newUuid() })),
});
