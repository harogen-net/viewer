import type { FC } from "react";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
	sameJoinStructure,
	useSlideshowPlayer,
	type UseSlideshowPlayer,
} from "../../src/hooks/useSlideshowPlayer";
import type { ImageLayer, Layer, TextLayer } from "../../src/types/Layer";
import type { Slide } from "../../src/types/Slide";

// §9 スライドショー タイムラインエンジンのテスト。

const baseTransform = {
	transX: 0,
	transY: 0,
	scaleX: 1,
	scaleY: 1,
	rotation: 0,
	mirrorH: false,
	mirrorV: false,
};
const img = (id: number, imageId: string, overrides: Partial<ImageLayer> = {}): ImageLayer => ({
	id,
	uuid: `l-${id}`,
	name: "",
	opacity: 1,
	locked: false,
	visible: true,
	shared: false,
	...baseTransform,
	type: "image",
	imageId,
	clipRect: [0, 0, 0, 0],
	isText: false,
	...overrides,
});
const txt = (id: number, text: string, overrides: Partial<TextLayer> = {}): TextLayer => ({
	id,
	uuid: `l-${id}`,
	name: "",
	opacity: 1,
	locked: false,
	visible: true,
	shared: false,
	...baseTransform,
	type: "text",
	text,
	...overrides,
});
const slide = (id: number, layers: Layer[], overrides: Partial<Slide> = {}): Slide => ({
	id,
	uuid: `s-${id}`,
	width: 800,
	height: 600,
	durationRatio: 1,
	joining: false,
	disabled: false,
	layers,
	...overrides,
});

describe("sameJoinStructure (join 連動判定)", () => {
	it("prev が joining + 同 imageId 単一 image → true", () => {
		const a = slide(1, [img(1, "A")], { joining: true });
		const b = slide(2, [img(2, "A")]);
		expect(sameJoinStructure(b, a)).toBe(true);
	});
	it("prev が joining でない → false", () => {
		const a = slide(1, [img(1, "A")], { joining: false });
		const b = slide(2, [img(2, "A")]);
		expect(sameJoinStructure(b, a)).toBe(false);
	});
	it("imageId が違う → false", () => {
		const a = slide(1, [img(1, "A")], { joining: true });
		const b = slide(2, [img(2, "B")]);
		expect(sameJoinStructure(b, a)).toBe(false);
	});
	it("可視レイヤー数が違う → false", () => {
		const a = slide(1, [img(1, "A")], { joining: true });
		const b = slide(2, [img(2, "A"), img(3, "B")]);
		expect(sameJoinStructure(b, a)).toBe(false);
	});
	it("text は text 内容一致で判定", () => {
		const a = slide(1, [txt(1, "hi")], { joining: true });
		expect(sameJoinStructure(slide(2, [txt(2, "hi")]), a)).toBe(true);
		expect(sameJoinStructure(slide(2, [txt(2, "yo")]), a)).toBe(false);
	});
	it("prev undefined → false", () => {
		expect(sameJoinStructure(slide(1, [img(1, "A")]), undefined)).toBe(false);
	});
});

let api: UseSlideshowPlayer;
let root: Root | null = null;
let div: HTMLDivElement | null = null;

const Probe: FC<{ slides: Slide[]; startIndex: number; intervalMs: number; open: boolean }> = (
	p
) => {
	api = useSlideshowPlayer(p);
	return null;
};

const mount = (slides: Slide[], startIndex = -1, intervalMs = 0, open = true): void => {
	div = document.createElement("div");
	document.body.appendChild(div);
	root = createRoot(div);
	act(() => {
		root.render(
			<Probe slides={slides} startIndex={startIndex} intervalMs={intervalMs} open={open} />
		);
	});
};

afterEach(() => {
	if (root) act(() => root?.unmount());
	div?.remove();
	root = null;
	div = null;
	vi.useRealTimers();
});

describe("useSlideshowPlayer (手動操作・選択開始・disabled 除外)", () => {
	it("disabled スライドを除外し有効のみ enabledCount、開始は有効先頭", () => {
		mount([
			slide(1, [img(1, "A")]),
			slide(2, [img(2, "B")], { disabled: true }),
			slide(3, [img(3, "C")]),
		]);
		expect(api.enabledCount).toBe(2);
		expect(api.position).toBe(1);
		expect(api.frame?.slide.id).toBe(1);
	});

	it("選択位置 (startIndex) から開始", () => {
		mount(
			[slide(1, [img(1, "A")]), slide(2, [img(2, "B")]), slide(3, [img(3, "C")])],
			2 // slide id=3
		);
		expect(api.position).toBe(3);
		expect(api.frame?.slide.id).toBe(3);
	});

	it("選択が disabled なら直近の有効スライドへフォールバック", () => {
		mount(
			[
				slide(1, [img(1, "A")]),
				slide(2, [img(2, "B")], { disabled: true }),
				slide(3, [img(3, "C")]),
			],
			1 // disabled な slide 2 → 直近有効 = slide 1
		);
		expect(api.frame?.slide.id).toBe(1);
	});

	it("next / prev でループ移動 (末尾→先頭)", () => {
		mount([slide(1, [img(1, "A")]), slide(2, [img(2, "B")])]);
		expect(api.position).toBe(1);
		act(() => api.next());
		expect(api.position).toBe(2);
		act(() => api.next()); // 末尾の次 → 先頭へループ
		expect(api.position).toBe(1);
		act(() => api.prev()); // 先頭の前 → 末尾へループ
		expect(api.position).toBe(2);
	});

	it("手動移動はクロスフェード (frame.key が増加、tween=false)", () => {
		mount([slide(1, [img(1, "A")]), slide(2, [img(2, "B")])]);
		const k0 = api.frame?.key ?? -1;
		act(() => api.next());
		expect(api.frame?.tween).toBe(false);
		expect(api.frame?.key).toBe(k0 + 1);
	});
});

describe("useSlideshowPlayer (自動進行・durationRatio・ループ・pause)", () => {
	it("interval × durationRatio 経過で次へ進み、末尾でループ", () => {
		vi.useFakeTimers();
		// slide1 ratio1 (1000ms), slide2 ratio2 (2000ms)
		mount([slide(1, [img(1, "A")]), slide(2, [img(2, "B")], { durationRatio: 2 })], -1, 1000);
		expect(api.position).toBe(1);
		act(() => vi.advanceTimersByTime(1000)); // slide1 表示時間経過
		expect(api.position).toBe(2);
		act(() => vi.advanceTimersByTime(1000)); // slide2 は 2000ms 必要、まだ進まない
		expect(api.position).toBe(2);
		act(() => vi.advanceTimersByTime(1000)); // 計 2000ms → ループで先頭へ
		expect(api.position).toBe(1);
	});

	it("pause で自動進行停止、resume で再開", () => {
		vi.useFakeTimers();
		mount([slide(1, [img(1, "A")]), slide(2, [img(2, "B")])], -1, 1000);
		act(() => api.togglePause()); // pause
		expect(api.paused).toBe(true);
		act(() => vi.advanceTimersByTime(5000));
		expect(api.position).toBe(1); // 進まない
		act(() => api.togglePause()); // resume
		expect(api.paused).toBe(false);
		act(() => vi.advanceTimersByTime(1000));
		expect(api.position).toBe(2);
	});

	it("interval=0 では自動進行しない", () => {
		vi.useFakeTimers();
		mount([slide(1, [img(1, "A")]), slide(2, [img(2, "B")])], -1, 0);
		act(() => vi.advanceTimersByTime(10000));
		expect(api.position).toBe(1);
	});
});
