import type { Slide } from "../types/Slide";
import type { SlideState } from "../types/SlideState";
import type { NewLayer } from "./layerOps";
import { cloneSlide, createEmptySlide, createImageSlide, nextSlideId } from "./slideFactory";

// Slide 階層 mutation の純関数群 (v4 Group C 設計コア)。
// (state, args) => state | null の形に統一:
//   - 戻り値 null = no-op (範囲外 / 変化なし)。primitive 側で history 記録もスキップ
//   - 戻り値 SlideState = 変化後 state。primitive が store cascade + history push に使う
//
// すべて純関数 (副作用なし、入力 state を mutate しない)。store / hook / DOM を一切知らない。
// undo/redo 実装時は同関数を逆引数で呼ぶことで対称性を確保 (例: move(s, to, from) で undo)。
//
// 選択 slide 追従ロジック:
//   - move / delete / deleteAllDisabled: 選択 slide の uuid で再検索 (見失えば -1)
//   - add / duplicate: 挿入位置 ≤ selectedIndex なら +1 シフト
//   - 値更新系 (setSlideJoining / setSlideDisabled / setAll系): selectedIndex 不変

const reselectByUuid = (next: Slide[], prevUuid: string | null): number => {
	if (!prevUuid) return -1;
	return next.findIndex((s) => s.uuid === prevUuid);
};

const getSelectedUuid = (state: SlideState): string | null =>
	state.selectedIndex >= 0 ? (state.slides[state.selectedIndex]?.uuid ?? null) : null;

/** from を to 位置に移動。範囲外 / 同 index は null。 */
export const moveSlide = (state: SlideState, from: number, to: number): SlideState | null => {
	const { slides } = state;
	if (from === to || from < 0 || from >= slides.length || to < 0 || to >= slides.length) {
		return null;
	}
	const selectedUuid = getSelectedUuid(state);
	const next = [...slides];
	const [moved] = next.splice(from, 1);
	next.splice(to, 0, moved);
	return { slides: next, selectedIndex: reselectByUuid(next, selectedUuid) };
};

/** 空 slide を生成して挿入 (atIndex 未指定なら末尾)。 */
export const addSlide = (
	state: SlideState,
	width: number,
	height: number,
	atIndex?: number
): SlideState => {
	const { slides, selectedIndex } = state;
	const newSlide = createEmptySlide(width, height, nextSlideId(slides));
	const insertAt =
		atIndex === undefined || atIndex < 0 || atIndex > slides.length ? slides.length : atIndex;
	const next = [...slides];
	next.splice(insertAt, 0, newSlide);
	const newSelected =
		selectedIndex >= 0 && insertAt <= selectedIndex ? selectedIndex + 1 : selectedIndex;
	return { slides: next, selectedIndex: newSelected };
};

/**
 * 画像 1 枚を持つ新規 slide を末尾に追加し、それを選択する (D-12、legacy ListViewController drop 相当)。
 * 常に変化するので null は返さない。
 */
export const addImageSlide = (
	state: SlideState,
	width: number,
	height: number,
	layer: NewLayer
): SlideState => {
	const newSlide = createImageSlide(width, height, nextSlideId(state.slides), layer);
	const next = [...state.slides, newSlide];
	return { slides: next, selectedIndex: next.length - 1 };
};

/**
 * 全 slide の width/height を doc キャンバスサイズへ揃える (SSOT 再注入、D 補間)。
 * レイヤーの transX/transY 等は変更しない (キャンバス枠のみリサイズ)。
 * 変化なし (全 slide が既に同寸 / slide 0 枚) は null。
 */
export const resizeAllSlides = (
	state: SlideState,
	width: number,
	height: number
): SlideState | null => {
	if (state.slides.length === 0) return null;
	if (state.slides.every((s) => s.width === width && s.height === height)) return null;
	const slides = state.slides.map((s) => ({ ...s, width, height }));
	return { ...state, slides };
};

/** index の slide を削除。範囲外は null。選択中 slide 消失時は同 index の次 (無ければ前)。 */
export const deleteSlide = (state: SlideState, index: number): SlideState | null => {
	const { slides, selectedIndex } = state;
	if (index < 0 || index >= slides.length) return null;
	const next = slides.filter((_, i) => i !== index);
	let newSelected = selectedIndex;
	if (selectedIndex === index) {
		newSelected = index < next.length ? index : next.length - 1;
	} else if (selectedIndex > index) {
		newSelected = selectedIndex - 1;
	}
	return { slides: next, selectedIndex: newSelected };
};

/** index の slide を複製して直後に挿入。範囲外は null。 */
export const duplicateSlide = (state: SlideState, index: number): SlideState | null => {
	const { slides, selectedIndex } = state;
	if (index < 0 || index >= slides.length) return null;
	const duped = cloneSlide(slides[index], nextSlideId(slides));
	const next = [...slides];
	next.splice(index + 1, 0, duped);
	const newSelected =
		selectedIndex >= 0 && index + 1 <= selectedIndex ? selectedIndex + 1 : selectedIndex;
	return { slides: next, selectedIndex: newSelected };
};

/** index の slide の joining を更新。範囲外 / 値が同じなら null。 */
export const setSlideJoining = (
	state: SlideState,
	index: number,
	joining: boolean
): SlideState | null => {
	const { slides, selectedIndex } = state;
	if (index < 0 || index >= slides.length) return null;
	if (slides[index].joining === joining) return null;
	const next = slides.map((s, i) => (i === index ? { ...s, joining } : s));
	return { slides: next, selectedIndex };
};

/** index の slide の disabled を更新。範囲外 / 値が同じなら null。 */
export const setSlideDisabled = (
	state: SlideState,
	index: number,
	disabled: boolean
): SlideState | null => {
	const { slides, selectedIndex } = state;
	if (index < 0 || index >= slides.length) return null;
	if (slides[index].disabled === disabled) return null;
	const next = slides.map((s, i) => (i === index ? { ...s, disabled } : s));
	return { slides: next, selectedIndex };
};

/**
 * 全 slide の joining を一括設定。空配列 / 既に全一致なら null。
 * レガシー仕様: joining 切替時は durationRatio も 1 にリセット。
 */
export const setAllJoining = (state: SlideState, joining: boolean): SlideState | null => {
	const { slides, selectedIndex } = state;
	if (slides.length === 0) return null;
	const allMatch = slides.every((s) => s.joining === joining && s.durationRatio === 1);
	if (allMatch) return null;
	const next = slides.map((s) => ({ ...s, joining, durationRatio: 1 }));
	return { slides: next, selectedIndex };
};

/** 全 slide の disabled を一括設定。空配列 / 既に全一致なら null。 */
export const setAllDisabled = (state: SlideState, disabled: boolean): SlideState | null => {
	const { slides, selectedIndex } = state;
	if (slides.length === 0) return null;
	const allMatch = slides.every((s) => s.disabled === disabled);
	if (allMatch) return null;
	const next = slides.map((s) => ({ ...s, disabled }));
	return { slides: next, selectedIndex };
};

/** disabled な slide をすべて削除。該当なし / 空配列なら null。 */
export const deleteAllDisabled = (state: SlideState): SlideState | null => {
	const { slides } = state;
	if (slides.length === 0) return null;
	const selectedUuid = getSelectedUuid(state);
	const next = slides.filter((s) => !s.disabled);
	if (next.length === slides.length) return null;
	return { slides: next, selectedIndex: reselectByUuid(next, selectedUuid) };
};

// --- durationRatio ---
//
// レガシー src/view/slide/ThumbSlideView.ts の up/down 増減仕様を純関数化:
//   - 上限 9 / 下限 0.2 (clamp)
//   - 増減ステップは現在値で非線形:
//       v < 1         : ±0.2
//       1 ≤ v < 2     : ±0.5
//       v ≥ 2         : ±1
//     (down は ">" 比較で、up と境界の扱いがわずかに違うため step 関数を 2 つ用意)

const incrementStep = (v: number): number => {
	if (v >= 9) return 0;
	if (v >= 2) return 1;
	if (v >= 1) return 0.5;
	return 0.2;
};

const decrementStep = (v: number): number => {
	if (v <= 0.2) return 0;
	if (v > 2) return 1;
	if (v > 1) return 0.5;
	return 0.2;
};

const MIN_DURATION = 0.2;
const MAX_DURATION = 9;

/** durationRatio を任意の値に設定 (0.2..9 でクランプ)。値変化なし / 範囲外なら null。 */
export const setSlideDurationRatio = (
	state: SlideState,
	index: number,
	ratio: number
): SlideState | null => {
	const { slides, selectedIndex } = state;
	if (index < 0 || index >= slides.length) return null;
	const clamped = Math.max(MIN_DURATION, Math.min(MAX_DURATION, ratio));
	if (slides[index].durationRatio === clamped) return null;
	const next = slides.map((s, i) => (i === index ? { ...s, durationRatio: clamped } : s));
	return { slides: next, selectedIndex };
};

/** durationRatio を 1 ステップ増加 (legacy ThumbSlideView 互換ステップ)。 */
export const incrementSlideDurationRatio = (
	state: SlideState,
	index: number
): SlideState | null => {
	const { slides } = state;
	if (index < 0 || index >= slides.length) return null;
	const step = incrementStep(slides[index].durationRatio);
	if (step === 0) return null;
	return setSlideDurationRatio(state, index, slides[index].durationRatio + step);
};

/** durationRatio を 1 ステップ減少。 */
export const decrementSlideDurationRatio = (
	state: SlideState,
	index: number
): SlideState | null => {
	const { slides } = state;
	if (index < 0 || index >= slides.length) return null;
	const step = decrementStep(slides[index].durationRatio);
	if (step === 0) return null;
	return setSlideDurationRatio(state, index, slides[index].durationRatio - step);
};
