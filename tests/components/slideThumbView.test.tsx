import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
	computeDurationCorrection,
	SlideThumbView,
	wrapperWidthToRatio,
} from "../../src/components/slide/SlideThumbView";
import type { Slide } from "../../src/types/Slide";

// v4 Group C C-9: SlideThumbView の thumb 内 UI (duration ラベル / リサイズハンドル / joining 矢印 /
// 有効 checkbox) + width 補正を検証。SlideListPanel との統合は slideListPanel.test.tsx 側。
// 表示尺の調整は右端ドラッグ (幅=尺) に変更 (±ボタン撤去)。

const makeSlide = (overrides: Partial<Slide> = {}): Slide => ({
	id: 1,
	uuid: "s-1",
	width: 1600,
	height: 800,
	durationRatio: 1,
	joining: true,
	disabled: false,
	layers: [],
	...overrides,
});

let container: HTMLDivElement;
let root: Root;

const baseHandlers = {
	onClick: () => {},
	onSetDuration: () => {},
	onToggleJoining: () => {},
	onToggleDisabled: () => {},
};

const renderThumb = (
	slide: Slide,
	overrides: Partial<typeof baseHandlers> & {
		selected?: boolean;
		index?: number;
		mobileMode?: boolean;
		bulkToggleMode?: boolean;
	} = {},
): void => {
	const {
		selected = false,
		index = 0,
		mobileMode = false,
		bulkToggleMode = false,
		...handlers
	} = overrides;
	act(() => {
		root.render(
			<SlideThumbView
				slide={slide}
				index={index}
				selected={selected}
				mobileMode={mobileMode}
				bulkToggleMode={bulkToggleMode}
				{...baseHandlers}
				{...handlers}
			/>,
		);
	});
};

beforeEach(() => {
	container = document.createElement("div");
	document.body.appendChild(container);
	root = createRoot(container);
});

afterEach(() => {
	act(() => root.unmount());
	container.remove();
});

const getControl = (name: string): HTMLElement | null =>
	container.querySelector<HTMLElement>(`[data-thumb-control='${name}']`);

describe("SlideThumbView thumb 内 UI (v4 Group C C-9)", () => {
	describe("durationRatio ラベル + リサイズハンドル", () => {
		it("durationRatio === 1 のとき label 非表示、!== 1 のとき 'xN' 表示", () => {
			renderThumb(makeSlide({ durationRatio: 1 }));
			expect(getControl("duration-label")).toBeNull();

			renderThumb(makeSlide({ durationRatio: 1.5 }));
			expect(getControl("duration-label")?.textContent).toBe("x1.5");

			renderThumb(makeSlide({ durationRatio: 0.6 }));
			expect(getControl("duration-label")?.textContent).toBe("x0.6");
		});

		it("!mobileMode で右端リサイズハンドルが出る / mobileMode では出ない", () => {
			renderThumb(makeSlide(), { mobileMode: false });
			expect(getControl("duration-resize")).not.toBeNull();

			renderThumb(makeSlide(), { mobileMode: true });
			expect(getControl("duration-resize")).toBeNull();
		});

		it("ハンドル click は親 onClick へ伝播しない (誤選択防止)", () => {
			const click = vi.fn();
			renderThumb(makeSlide(), { onClick: click });
			act(() => {
				getControl("duration-resize")?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
			});
			expect(click).not.toHaveBeenCalled();
		});
	});

	describe("wrapperWidthToRatio (幅→尺 逆変換)", () => {
		const canvasW = 220; // 1600x800 @ h110
		// legacy と同じ段階 (0.2/0.4/0.6/0.8/1/1.5/2/3…9) へ最近傍スナップする。
		// 上限付近は atan/tan の傾きが急で 1px 丸めの影響が大きいため、往復検証は精度の出る範囲に限る。
		it("各段階は correction 往復で同じ段階へ戻る", () => {
			for (const ratio of [0.2, 0.4, 0.6, 0.8, 1, 1.5, 2, 3, 5]) {
				const w = Math.round(canvasW * computeDurationCorrection(ratio));
				expect(wrapperWidthToRatio(w, canvasW)).toBe(ratio);
			}
		});
		it("段階外の幅は最近傍の段階へスナップ (0.5→0.4 or 0.6 等、中間値は出ない)", () => {
			const wHalf = Math.round(canvasW * computeDurationCorrection(0.5));
			expect([0.4, 0.6]).toContain(wrapperWidthToRatio(wHalf, canvasW));
		});
		it("下限 0.2 / 上限 9 にクランプされる", () => {
			expect(wrapperWidthToRatio(1, canvasW)).toBe(0.2); // 極小幅
			expect(wrapperWidthToRatio(canvasW * 5, canvasW)).toBe(9); // 極大幅
		});
	});

	describe("joining 矢印", () => {
		it("joining=true で ▶ + 色付き、false で ▷", () => {
			renderThumb(makeSlide({ joining: true }));
			expect(getControl("join-arrow")?.textContent).toBe("▶");

			renderThumb(makeSlide({ joining: false }));
			expect(getControl("join-arrow")?.textContent).toBe("▷");
		});

		it("click で onToggleJoining、親 onClick 不発", () => {
			const toggle = vi.fn();
			const click = vi.fn();
			renderThumb(makeSlide(), { onToggleJoining: toggle, onClick: click });

			act(() => {
				getControl("join-arrow")?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
			});

			expect(toggle).toHaveBeenCalledTimes(1);
			expect(click).not.toHaveBeenCalled();
		});
	});

	describe("有効 checkbox", () => {
		it("disabled=false なら checked、true なら unchecked", () => {
			renderThumb(makeSlide({ disabled: false }));
			const cb1 = getControl("enable-check") as HTMLInputElement;
			expect(cb1.checked).toBe(true);

			renderThumb(makeSlide({ disabled: true }));
			const cb2 = getControl("enable-check") as HTMLInputElement;
			expect(cb2.checked).toBe(false);
		});

		it("change で onToggleDisabled、親 onClick 不発", () => {
			const toggle = vi.fn();
			const click = vi.fn();
			renderThumb(makeSlide({ disabled: false }), { onToggleDisabled: toggle, onClick: click });

			// HTMLInputElement.click() で実 click simulate (toggle + change 発火)
			act(() => {
				(getControl("enable-check") as HTMLInputElement).click();
			});

			expect(toggle).toHaveBeenCalledTimes(1);
			expect(click).not.toHaveBeenCalled();
		});

		// 一括切替モードではサムネ本体のクリックがトグルなので、操作口としては要らない
		// (状態は暗転で読ませる)。スマホは元から非表示。
		it("mobileMode / bulkToggleMode では出さない", () => {
			renderThumb(makeSlide({ disabled: false }));
			expect(getControl("enable-check")).not.toBeNull();

			renderThumb(makeSlide({ disabled: false }), { mobileMode: true });
			expect(getControl("enable-check")).toBeNull();

			renderThumb(makeSlide({ disabled: false }), { bulkToggleMode: true });
			expect(getControl("enable-check")).toBeNull();
		});
	});

	describe("durationCorrection で width 伸縮", () => {
		const getOuter = (): HTMLElement => container.querySelector<HTMLElement>("[data-slide-index]")!;
		// thumbHeight 110、slide 1600x800 → scale = 0.1375
		// 補正:
		//   r=1   → 1.0       → width = 220
		//   r=2   → atan(1)*0.5+1 = 0.785*0.5+1 = 1.3927 → width ≈ 306
		//   r=0.5 → 0.5^0.4   ≈ 0.7579         → width ≈ 167

		it("ratio=1 のとき width=220px (補正なし)", () => {
			renderThumb(makeSlide({ durationRatio: 1 }));
			expect(getOuter().style.width).toBe("220px");
		});

		it("ratio>1 のとき wrapper width 伸長 (canvas natural aspect は不変)", () => {
			renderThumb(makeSlide({ durationRatio: 2 }));
			const w = parseInt(getOuter().style.width, 10);
			expect(w).toBeGreaterThan(220);
			expect(w).toBeLessThan(400);
			// canvas は durationCorrection なしの native aspect で固定
			const canvas = container.querySelector<HTMLCanvasElement>("[data-thumb-canvas]");
			expect(canvas?.width).toBe(220);
			expect(canvas?.height).toBe(110);
		});

		it("ratio<1 のとき wrapper width 短縮", () => {
			renderThumb(makeSlide({ durationRatio: 0.5 }));
			const w = parseInt(getOuter().style.width, 10);
			expect(w).toBeLessThan(220);
			expect(w).toBeGreaterThan(120);
		});
	});

	describe("canvas 描画 (C-10 legacy CanvasSlideView 互換)", () => {
		it("data-thumb-canvas な <canvas> が 1 つ存在し、native aspect で属性設定される", () => {
			renderThumb(makeSlide());
			const canvas = container.querySelector<HTMLCanvasElement>("[data-thumb-canvas]");
			expect(canvas).not.toBeNull();
			// slide 1600x800 + thumbHeight 110 → scale 0.1375、canvasW = 220
			expect(canvas?.width).toBe(220);
			expect(canvas?.height).toBe(110);
			// CSS は 100% で wrapper にフィット
			expect(canvas?.style.width).toBe("100%");
			expect(canvas?.style.height).toBe("100%");
		});

		it("従来の <SlideView> ベース DOM 要素は出ない (= layers DOM が積み上がらない)", () => {
			// SlideView 内側の data-slide-id (slide id 1 のもの) は描画されない
			renderThumb(makeSlide({ id: 1 }));
			expect(container.querySelector("[data-slide-id='1']")).toBeNull();
		});
	});

	describe("data 属性", () => {
		it("data-joining / data-duration-ratio が反映される", () => {
			renderThumb(makeSlide({ joining: false, durationRatio: 1.5 }));
			const outer = container.querySelector<HTMLElement>("[data-slide-index]");
			expect(outer?.getAttribute("data-joining")).toBe("false");
			expect(outer?.getAttribute("data-duration-ratio")).toBe("1.5");
		});
	});
});
