/**
 * R4.7.2: カーソル自動非表示の独立ヘルパ。
 *
 * `target` への mousemove リスナー登録／解除と、`playingClass` の付与タイマーを
 * 内側で完結させる。`isActive()` が false の間は再アームしないので、停止／一時停止
 * 状態でも mousemove で `playing` クラスが復活することはない。
 */

export type CursorAutoHide = {
	start: () => void;
	stop: () => void;
};

export type CursorAutoHideOptions = {
	target: HTMLElement;
	/** 再生中かどうか。再アームの可否を判定する。 */
	isActive: () => boolean;
	/** 自動非表示までの待機時間 (ms)。既定 1000。 */
	delay?: number;
	/** 付与するクラス名。既定 "playing"。 */
	playingClass?: string;
};

export function createCursorAutoHide(options: CursorAutoHideOptions): CursorAutoHide {
	const { target, isActive } = options;
	const delay = options.delay ?? 1000;
	const cls = options.playingClass ?? "playing";

	let timer: ReturnType<typeof setTimeout> | null = null;
	let listener: ((event: MouseEvent) => void) | null = null;

	const clearTimer = (): void => {
		if (timer !== null) {
			clearTimeout(timer);
			timer = null;
		}
	};

	const armTimer = (): void => {
		clearTimer();
		timer = setTimeout(() => {
			target.classList.add(cls);
			timer = null;
		}, delay);
	};

	const onMove = (): void => {
		target.classList.remove(cls);
		clearTimer();
		if (!isActive()) return;
		armTimer();
	};

	return {
		start() {
			if (listener) return;
			listener = onMove;
			target.addEventListener("mousemove", listener);
			armTimer();
		},
		stop() {
			if (listener) {
				target.removeEventListener("mousemove", listener);
				listener = null;
			}
			clearTimer();
			target.classList.remove(cls);
		},
	};
}
