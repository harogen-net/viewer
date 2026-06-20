import type { Slide } from "../types/Slide";

// Slide 生成 / 複製 / id 採番のための pure helpers (v4 Group C build C-1)。
// レガシー `src/model/Slide.ts` (EventDispatcher 派生 class、jQuery 連動) は
// import せず、純粋 type ベースで再実装する (§0-10)。
//
// 用途:
//   - SlideListPanel の addSlide ボタン → createEmptySlide
//   - SlideListPanel の duplicate コマンド → cloneSlide
//   - slideStore の id 採番 → nextSlideId
// HVD round-trip 維持のため id は数値、uuid は React key 用 (HVD 非保存)。

/** uuid 生成 (crypto.randomUUID 優先、fallback 乱数)。storageCodec と同等。 */
const newUuid = (): string => {
	const c = (typeof crypto !== "undefined" ? crypto : null) as Crypto | null;
	if (c && typeof c.randomUUID === "function") return c.randomUUID();
	return `r-${Math.random().toString(36).slice(2)}-${Date.now().toString(36)}`;
};

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
 * 既存 slide を複製。新規 id + uuid、layers は浅コピーで新規 uuid 振り直し
 * (HVD 識別子 layer.id は元のまま、React key 用 uuid だけ振り直す)。
 */
export const cloneSlide = (source: Slide, id: number): Slide => ({
	...source,
	id,
	uuid: newUuid(),
	layers: source.layers.map((layer) => ({ ...layer, uuid: newUuid() })),
});
