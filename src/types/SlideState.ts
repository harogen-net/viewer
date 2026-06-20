import type { Slide } from "./Slide";

/**
 * Slide 階層の operational state (v4 Group C 設計コア)。
 * 純関数 ops の入出力 / history snapshot / mutation primitive で共有する。
 *
 * - slides:        現在の slide 配列
 * - selectedIndex: 選択中 slide の index (-1 = 未選択)
 *
 * 構造共有で snapshot は安価 (slides 配列・slide オブジェクト共有可)。
 */
export interface SlideState {
	slides: Slide[];
	selectedIndex: number;
}
