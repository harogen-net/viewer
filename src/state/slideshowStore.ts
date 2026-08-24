import { create } from "zustand";

// スライドショーの起動状態 + 再生設定 (§9)。
// legacy はツールバーの #interval / #duration / #cb_fullscreen / #cb_mirrorH/V から
// 取得していた。新側はこれらを SlideShowOpsPanel で編集し本 store に集約する
// (HVD には保存しない = セッション設定。legacy も doc には持たなかった)。

export const INTERVAL_DEFAULT_MS = 6000; // legacy #interval 既定
export const DURATION_DEFAULT_MS = 2000; // legacy #duration 既定 (クロスフェード時間)

// 結合スライド (joining + 同一構造) の tween は、既定ではスライドの表示時間いっぱいを
// 使って動き続ける。前後にオフセット (静止時間) を挟むと「少し止まってから動き、動き
// 終わってからまた止まる」という間を作れる。値は表示時間に対する百分率。
//   前オフセット = transition-delay、実アニメ = 表示時間 - 前 - 後
//   後オフセット は「アニメ終了後に次のスライドへ進むまでの余り」なので明示指定は不要
export const TWEEN_PRE_PERCENT_DEFAULT = 0;
export const TWEEN_POST_PERCENT_DEFAULT = 0;
// 前 + 後 の上限。残りが実アニメ時間になるので、最低限これだけは動く時間を残す。
export const TWEEN_OFFSET_TOTAL_MAX_PERCENT = 90;

const clampPercent = (v: number, otherSide: number): number =>
	Math.min(TWEEN_OFFSET_TOTAL_MAX_PERCENT - otherSide, Math.max(0, Math.round(v)));

// 結合 tween のイージング (CSS cubic-bezier の制御点)。
// 既定は従来ハードコードしていた cubic-bezier(.4,0,.7,1)。
export interface TweenEase {
	x1: number;
	y1: number;
	x2: number;
	y2: number;
}
export const TWEEN_EASE_DEFAULT: TweenEase = { x1: 0.4, y1: 0, x2: 0.7, y2: 1 };
// 制御点の y は始点 (0) / 終点 (1) に固定し、UI では左右にしか動かせない。
// CSS 上は y を 0..1 の外へ出せて行き過ぎ (overshoot) や巻き戻しも作れるが、
// そうすると進捗が単調でなくなりカーブが折れ曲がった見た目になる。ここでは
// 「必ず 0 から 1 へ単調に進む」形だけを扱う (= 左右移動のみで表現できる範囲)。
export const TWEEN_EASE_Y1 = 0;
export const TWEEN_EASE_Y2 = 1;

const clamp = (v: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, v));
// 小数は 2 桁に丸める (CSS に出す値と UI 表示を一致させる)。
const round2 = (v: number): number => Math.round(v * 100) / 100;

// x は CSS の仕様上 0..1 でなければならない。y は上記の理由で固定値に落とす。
export const normalizeTweenEase = (e: TweenEase): TweenEase => ({
	x1: round2(clamp(e.x1, 0, 1)),
	y1: TWEEN_EASE_Y1,
	x2: round2(clamp(e.x2, 0, 1)),
	y2: TWEEN_EASE_Y2,
});

export const tweenEaseCss = (e: TweenEase): string =>
	`cubic-bezier(${e.x1}, ${e.y1}, ${e.x2}, ${e.y2})`;

/** 表示時間 (ms) と前後オフセット (%) から、実際の delay / アニメ時間 (ms) を求める。 */
export const resolveTweenTiming = (
	totalMs: number,
	prePercent: number,
	postPercent: number
): { delayMs: number; animMs: number } => {
	const total = Math.max(0, totalMs);
	const pre = Math.max(0, prePercent);
	const post = Math.max(0, postPercent);
	// 合計が上限を超える値が渡っても破綻しないよう、ここでも動く時間を最低 1ms 残す。
	const delayMs = Math.min(total, (total * pre) / 100);
	const animMs = Math.max(1, total - delayMs - (total * post) / 100);
	return { delayMs, animMs };
};

// 設定モーダルで編集する値のまとまり。モーダルは下書きとしてこの形を持ち、
// OK 押下でのみ store 反映 + localStorage 保存する (バックドロップで閉じたら破棄)。
export interface SlideshowSettings {
	intervalMs: number;
	durationMs: number;
	flipX: boolean;
	flipY: boolean;
	startFullscreen: boolean;
	tweenPrePercent: number;
	tweenPostPercent: number;
	tweenEase: TweenEase;
}

export const SLIDESHOW_SETTINGS_DEFAULT: SlideshowSettings = {
	intervalMs: INTERVAL_DEFAULT_MS,
	durationMs: DURATION_DEFAULT_MS,
	flipX: false,
	flipY: false,
	startFullscreen: false,
	tweenPrePercent: TWEEN_PRE_PERCENT_DEFAULT,
	tweenPostPercent: TWEEN_POST_PERCENT_DEFAULT,
	tweenEase: TWEEN_EASE_DEFAULT,
};

const asNum = (v: unknown, fallback: number): number =>
	typeof v === "number" && Number.isFinite(v) ? v : fallback;
const asBool = (v: unknown, fallback: boolean): boolean =>
	typeof v === "boolean" ? v : fallback;

/**
 * 外から来た値 (localStorage / 古い版) を安全な設定へ正す。
 * 欠損・型違い・範囲外はすべて既定値へ倒す。前後オフセットは合計上限があるので組で見る。
 */
export const normalizeSlideshowSettings = (
	raw: Partial<SlideshowSettings> | null | undefined
): SlideshowSettings => {
	const d = SLIDESHOW_SETTINGS_DEFAULT;
	const pre = clamp(
		Math.round(asNum(raw?.tweenPrePercent, d.tweenPrePercent)),
		0,
		TWEEN_OFFSET_TOTAL_MAX_PERCENT
	);
	const post = clamp(
		Math.round(asNum(raw?.tweenPostPercent, d.tweenPostPercent)),
		0,
		TWEEN_OFFSET_TOTAL_MAX_PERCENT - pre
	);
	const rawEase = raw?.tweenEase;
	return {
		intervalMs: Math.max(0, asNum(raw?.intervalMs, d.intervalMs)),
		durationMs: Math.max(0, asNum(raw?.durationMs, d.durationMs)),
		flipX: asBool(raw?.flipX, d.flipX),
		flipY: asBool(raw?.flipY, d.flipY),
		startFullscreen: asBool(raw?.startFullscreen, d.startFullscreen),
		tweenPrePercent: pre,
		tweenPostPercent: post,
		tweenEase: normalizeTweenEase({
			x1: asNum(rawEase?.x1, d.tweenEase.x1),
			y1: d.tweenEase.y1,
			x2: asNum(rawEase?.x2, d.tweenEase.x2),
			y2: d.tweenEase.y2,
		}),
	};
};

// localStorage 永続化。読めない / 壊れている場合は既定値で起動する (致命的にしない)。
const STORAGE_KEY = "slideshow.settings";
const readStoredSettings = (): SlideshowSettings => {
	try {
		const raw = localStorage.getItem(STORAGE_KEY);
		if (!raw) return SLIDESHOW_SETTINGS_DEFAULT;
		return normalizeSlideshowSettings(JSON.parse(raw) as Partial<SlideshowSettings>);
	} catch {
		return SLIDESHOW_SETTINGS_DEFAULT;
	}
};
const writeStoredSettings = (s: SlideshowSettings): void => {
	try {
		localStorage.setItem(STORAGE_KEY, JSON.stringify(s));
	} catch {
		/* localStorage 不可でも致命的でない */
	}
};

interface SlideshowState {
	/** スライドショー実行中か (SlideshowShell の open に対応)。 */
	running: boolean;
	/** 自動進行間隔 (ms)。 */
	intervalMs: number;
	/** クロスフェード時間 (ms)。 */
	durationMs: number;
	/** 水平反転 (mirrorH)。 */
	flipX: boolean;
	/** 垂直反転 (mirrorV)。 */
	flipY: boolean;
	/** 開始時に全画面化するか。 */
	startFullscreen: boolean;
	/** 結合 tween の前オフセット (表示時間に対する %)。動き出すまでの静止。 */
	tweenPrePercent: number;
	/** 結合 tween の後オフセット (表示時間に対する %)。動き終わった後の静止。 */
	tweenPostPercent: number;
	/** 結合 tween のイージング (cubic-bezier 制御点)。 */
	tweenEase: TweenEase;

	start: () => void;
	stop: () => void;
	setIntervalMs: (ms: number) => void;
	setDurationMs: (ms: number) => void;
	setTweenPrePercent: (v: number) => void;
	setTweenPostPercent: (v: number) => void;
	setTweenEase: (e: TweenEase) => void;
	/** 設定モーダルの確定 (OK)。正規化して反映し、localStorage へ保存する。 */
	applySettings: (next: SlideshowSettings) => void;
	setFlipX: (v: boolean) => void;
	setFlipY: (v: boolean) => void;
	toggleFlipX: () => void;
	toggleFlipY: () => void;
	setStartFullscreen: (v: boolean) => void;
}

export const useSlideshowStore = create<SlideshowState>()((set) => ({
	running: false,
	// 起動時に前回の設定を復元する (保存は設定モーダルの OK 押下時のみ)。
	...readStoredSettings(),

	start: () => set({ running: true }),
	stop: () => set({ running: false }),
	setIntervalMs: (ms) => set({ intervalMs: Math.max(0, ms) }),
	setDurationMs: (ms) => set({ durationMs: Math.max(0, ms) }),
	// 片側を動かしたときに合計が上限を超えないよう、もう片側を見てクランプする
	// (超えた値を許すと実アニメ時間が消える)。
	setTweenPrePercent: (v) => set((s) => ({ tweenPrePercent: clampPercent(v, s.tweenPostPercent) })),
	setTweenPostPercent: (v) =>
		set((s) => ({ tweenPostPercent: clampPercent(v, s.tweenPrePercent) })),
	setTweenEase: (e) => set({ tweenEase: normalizeTweenEase(e) }),
	applySettings: (next) => {
		const v = normalizeSlideshowSettings(next);
		writeStoredSettings(v);
		set(v);
	},
	setFlipX: (v) => set({ flipX: v }),
	setFlipY: (v) => set({ flipY: v }),
	toggleFlipX: () => set((s) => ({ flipX: !s.flipX })),
	toggleFlipY: () => set((s) => ({ flipY: !s.flipY })),
	setStartFullscreen: (v) => set({ startFullscreen: v }),
}));

/** store から設定値だけを取り出す (モーダルの下書き初期値)。 */
export const selectSlideshowSettings = (): SlideshowSettings => {
	const s = useSlideshowStore.getState();
	return {
		intervalMs: s.intervalMs,
		durationMs: s.durationMs,
		flipX: s.flipX,
		flipY: s.flipY,
		startFullscreen: s.startFullscreen,
		tweenPrePercent: s.tweenPrePercent,
		tweenPostPercent: s.tweenPostPercent,
		tweenEase: s.tweenEase,
	};
};
