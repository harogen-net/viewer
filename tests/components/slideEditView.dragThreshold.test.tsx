import { act, useSyncExternalStore } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SlideEditView } from "../../src/components/slide/SlideEditView";
import {
	DRAG_START_THRESHOLD_PX,
	DRAG_THRESHOLD_RELEASE_MS,
} from "../../src/hooks/useLayerGesture";
import { useHistoryStore } from "../../src/state/historyStore";
import { useLayerStore } from "../../src/state/layerStore";
import { useSlideStore } from "../../src/state/slideStore";
import { useViewerDocumentStore } from "../../src/state/viewerDocumentStore";
import type { ImageLayer, Layer } from "../../src/types/Layer";
import type { Slide } from "../../src/types/Slide";

// ドラッグ成立しきい値 (useLayerGesture) のテスト。
//
// 押しただけ / わずかに動いただけでレイヤーが移動してしまう誤操作を防ぐ仕組み。
//   - 距離: 画面上で DRAG_START_THRESHOLD_PX を超えるまで移動を成立させない
//   - 時間: pointerdown から DRAG_THRESHOLD_RELEASE_MS 経つと距離しきい値を解除する
// 期待値は定数から導出する (値を調整してもテストが追従するように)。
//
// 時間判定は Date.now() なのでスパイで固定する。

// SlideEditView が算出する stage 倍率。slide 1600x800 を fitArea 800x600 に収める際の
// 実効値で、既存の drag テスト (36px → 80 slide 単位) と同じ前提。
const STAGE_SCALE = 0.45;
const toSlide = (clientPx: number): number => clientPx / STAGE_SCALE;

const baseTransform = {
	transX: 0,
	transY: 0,
	scaleX: 1,
	scaleY: 1,
	rotation: 0,
	mirrorH: false,
	mirrorV: false,
};
const makeImageLayer = (
	id: number,
	uuid: string,
	overrides: Partial<ImageLayer> = {}
): ImageLayer => ({
	id,
	uuid,
	name: "",
	opacity: 1,
	locked: false,
	visible: true,
	shared: false,
	...baseTransform,
	type: "image",
	imageId: "img-a",
	clipRect: [0, 0, 0, 0],
	isText: false,
	...overrides,
});
const makeSlide = (layers: Layer[]): Slide => ({
	id: 1,
	uuid: "s-1",
	width: 1600,
	height: 800,
	durationRatio: 1,
	joining: true,
	disabled: false,
	layers,
});

let container: HTMLDivElement;
let root: Root;
let nowMs: number;
let __origOffsetW: PropertyDescriptor | undefined;
let __origOffsetH: PropertyDescriptor | undefined;

beforeEach(() => {
	useSlideStore.getState().setSlides([]);
	useLayerStore.getState().setLayers([]);
	useLayerStore.getState().setSelectedLayer(null);
	useHistoryStore.getState().clear();
	useViewerDocumentStore.setState({ meta: null, modified: false });
	nowMs = 0;
	vi.spyOn(Date, "now").mockImplementation(() => nowMs);
	container = document.createElement("div");
	document.body.appendChild(container);
	root = createRoot(container);

	__origOffsetW = Object.getOwnPropertyDescriptor(HTMLElement.prototype, "offsetWidth");
	__origOffsetH = Object.getOwnPropertyDescriptor(HTMLElement.prototype, "offsetHeight");
	Object.defineProperty(HTMLElement.prototype, "offsetWidth", {
		configurable: true,
		get() {
			return this.dataset?.layerId ? 100 : 0;
		},
	});
	Object.defineProperty(HTMLElement.prototype, "offsetHeight", {
		configurable: true,
		get() {
			return this.dataset?.layerId ? 50 : 0;
		},
	});
});

afterEach(() => {
	act(() => root.unmount());
	container.remove();
	vi.restoreAllMocks();
	if (__origOffsetW) Object.defineProperty(HTMLElement.prototype, "offsetWidth", __origOffsetW);
	if (__origOffsetH) Object.defineProperty(HTMLElement.prototype, "offsetHeight", __origOffsetH);
});

const RenderHost = () => {
	const slide = useSyncExternalStore(
		(cb) => useSlideStore.subscribe(cb),
		() => {
			const s = useSlideStore.getState();
			return s.slides[s.selectedIndex] ?? null;
		}
	);
	if (!slide) return null;
	return <SlideEditView slide={slide} fitAreaWidth={800} fitAreaHeight={600} />;
};

const seed = (layers: Layer[]): void => {
	useSlideStore.getState().setSlides([makeSlide(layers)]);
	useSlideStore.getState().setSelectedIndex(0);
	act(() => {
		root.render(<RenderHost />);
	});
};

const dispatchPointer = (
	el: HTMLElement,
	type: "pointerdown" | "pointermove" | "pointerup",
	props: { clientX: number; clientY: number; pointerId?: number; button?: number }
): void => {
	const ev = new Event(type, { bubbles: true, cancelable: true });
	Object.defineProperty(ev, "clientX", { value: props.clientX });
	Object.defineProperty(ev, "clientY", { value: props.clientY });
	Object.defineProperty(ev, "pointerId", { value: props.pointerId ?? 1 });
	Object.defineProperty(ev, "button", { value: props.button ?? 0 });
	act(() => {
		el.dispatchEvent(ev);
	});
};

const layerWrapper = (): HTMLElement => {
	const el = container.querySelector<HTMLElement>('[data-layer-id="1"]');
	if (!el) throw new Error("layer wrapper が見つからない");
	return el;
};
const stageEl = (): HTMLElement => {
	const el = container.querySelector<HTMLElement>("[data-slide-edit-scaled]");
	if (!el) throw new Error("stage が見つからない");
	return el;
};
const storedLayer = () => useSlideStore.getState().slides[0].layers[0];
const historyCount = (): number => useHistoryStore.getState().past.length;

// しきい値ちょうど未満 / 明確に超える移動量 (client px)。
const UNDER = DRAG_START_THRESHOLD_PX - 1;
const OVER = DRAG_START_THRESHOLD_PX + 10;

describe("ドラッグ成立しきい値 - 距離", () => {
	it("しきい値未満の移動では動かず commit もされない (選択だけ成立する)", () => {
		seed([makeImageLayer(1, "u-1", { transX: 10, transY: 20 })]);
		dispatchPointer(layerWrapper(), "pointerdown", { clientX: 0, clientY: 0 });
		dispatchPointer(stageEl(), "pointermove", { clientX: UNDER, clientY: 0 });
		dispatchPointer(stageEl(), "pointerup", { clientX: UNDER, clientY: 0 });

		expect(storedLayer().transX).toBe(10);
		expect(storedLayer().transY).toBe(20);
		expect(historyCount()).toBe(0);
		// 選択は pointerdown 時点で成立している (しきい値は移動だけを止める)
		expect(useLayerStore.getState().selectedLayer?.uuid).toBe("u-1");
	});

	it("しきい値未満の移動中はレイヤー本体も追従しない", () => {
		seed([makeImageLayer(1, "u-1", { transX: 10, transY: 20 })]);
		const before = layerWrapper().style.transform;
		dispatchPointer(layerWrapper(), "pointerdown", { clientX: 0, clientY: 0 });
		dispatchPointer(stageEl(), "pointermove", { clientX: UNDER, clientY: 0 });
		expect(layerWrapper().style.transform).toBe(before);
	});

	it("しきい値を超えたら移動が成立する", () => {
		seed([makeImageLayer(1, "u-1", { transX: 10, transY: 20 })]);
		dispatchPointer(layerWrapper(), "pointerdown", { clientX: 0, clientY: 0 });
		dispatchPointer(stageEl(), "pointermove", { clientX: OVER, clientY: 0 });
		dispatchPointer(stageEl(), "pointerup", { clientX: OVER, clientY: 0 });

		expect(storedLayer().transX).toBeCloseTo(10 + toSlide(OVER), 6);
		expect(storedLayer().transY).toBe(20);
		expect(historyCount()).toBe(1);
	});

	it("移動量は「しきい値を超えた地点」ではなく pointerdown 地点からの差分", () => {
		// 超えた地点を基準にすると、カーソルとレイヤーがしきい値ぶんずれたまま追従してしまう。
		seed([makeImageLayer(1, "u-1", { transX: 0, transY: 0 })]);
		dispatchPointer(layerWrapper(), "pointerdown", { clientX: 0, clientY: 0 });
		dispatchPointer(stageEl(), "pointermove", { clientX: OVER, clientY: 0 }); // ここで成立
		dispatchPointer(stageEl(), "pointermove", { clientX: OVER * 2, clientY: 0 });
		dispatchPointer(stageEl(), "pointerup", { clientX: OVER * 2, clientY: 0 });

		expect(storedLayer().transX).toBeCloseTo(toSlide(OVER * 2), 6);
	});

	it("一度成立したらしきい値未満まで戻しても追従し続ける", () => {
		seed([makeImageLayer(1, "u-1", { transX: 0, transY: 0 })]);
		dispatchPointer(layerWrapper(), "pointerdown", { clientX: 0, clientY: 0 });
		dispatchPointer(stageEl(), "pointermove", { clientX: OVER, clientY: 0 }); // 成立
		dispatchPointer(stageEl(), "pointermove", { clientX: UNDER, clientY: 0 }); // 戻す
		dispatchPointer(stageEl(), "pointerup", { clientX: UNDER, clientY: 0 });

		expect(storedLayer().transX).toBeCloseTo(toSlide(UNDER), 6);
	});

	it("選択枠経由の drag にもしきい値が効く", () => {
		seed([makeImageLayer(1, "u-1", { transX: 10, transY: 20 })]);
		// まず選択して枠を出す
		dispatchPointer(layerWrapper(), "pointerdown", { clientX: 0, clientY: 0 });
		dispatchPointer(stageEl(), "pointerup", { clientX: 0, clientY: 0 });
		const frame = container.querySelector<HTMLElement>("[data-edit-selection-frame]");
		expect(frame).not.toBeNull();

		dispatchPointer(frame!, "pointerdown", { clientX: 0, clientY: 0 });
		dispatchPointer(stageEl(), "pointermove", { clientX: UNDER, clientY: 0 });
		dispatchPointer(stageEl(), "pointerup", { clientX: UNDER, clientY: 0 });
		expect(storedLayer().transX).toBe(10);
		expect(historyCount()).toBe(0);
	});
});

describe("ドラッグ成立しきい値 - 時間解除", () => {
	it("解除時間の直前まではしきい値未満で動かない", () => {
		seed([makeImageLayer(1, "u-1", { transX: 10, transY: 20 })]);
		dispatchPointer(layerWrapper(), "pointerdown", { clientX: 0, clientY: 0 });
		nowMs = DRAG_THRESHOLD_RELEASE_MS - 1;
		dispatchPointer(stageEl(), "pointermove", { clientX: UNDER, clientY: 0 });
		dispatchPointer(stageEl(), "pointerup", { clientX: UNDER, clientY: 0 });

		expect(storedLayer().transX).toBe(10);
		expect(historyCount()).toBe(0);
	});

	it("解除時間を過ぎればしきい値未満の移動でも成立する", () => {
		seed([makeImageLayer(1, "u-1", { transX: 10, transY: 20 })]);
		dispatchPointer(layerWrapper(), "pointerdown", { clientX: 0, clientY: 0 });
		nowMs = DRAG_THRESHOLD_RELEASE_MS;
		dispatchPointer(stageEl(), "pointermove", { clientX: UNDER, clientY: 0 });
		dispatchPointer(stageEl(), "pointerup", { clientX: UNDER, clientY: 0 });

		expect(storedLayer().transX).toBeCloseTo(10 + toSlide(UNDER), 6);
		expect(historyCount()).toBe(1);
	});

	it("時間が経っても pointermove が来なければ何も起きない (押しっぱなしだけでは動かない)", () => {
		seed([makeImageLayer(1, "u-1", { transX: 10, transY: 20 })]);
		dispatchPointer(layerWrapper(), "pointerdown", { clientX: 0, clientY: 0 });
		nowMs = DRAG_THRESHOLD_RELEASE_MS * 10;
		dispatchPointer(stageEl(), "pointerup", { clientX: 0, clientY: 0 });

		expect(storedLayer().transX).toBe(10);
		expect(historyCount()).toBe(0);
	});
});

describe("ドラッグ成立しきい値 - 適用範囲", () => {
	// resize / rotate は専用ハンドル発源で誤爆の余地がないため、しきい値の対象外。
	const selectLayer = (): void => {
		dispatchPointer(layerWrapper(), "pointerdown", { clientX: 0, clientY: 0 });
		dispatchPointer(stageEl(), "pointerup", { clientX: 0, clientY: 0 });
	};

	it("resize はしきい値未満の移動でも即座に効く", () => {
		seed([makeImageLayer(1, "u-1")]);
		selectLayer();
		const anchorSe = container.querySelector<HTMLElement>('[data-resize-anchor="se"]');
		expect(anchorSe).not.toBeNull();

		// se anchor = slide(100,50) = client(45, 22.5)。slide(110,55) = client(49.5, 24.75) へ。
		// 移動距離は hypot(4.5, 2.25) ≒ 5px でしきい値未満。t = 1.1 → visW = 110
		dispatchPointer(anchorSe!, "pointerdown", { clientX: 45, clientY: 22.5 });
		dispatchPointer(stageEl(), "pointermove", { clientX: 49.5, clientY: 24.75 });

		const frame = container.querySelector<HTMLElement>("[data-edit-selection-frame]");
		expect(Number.parseFloat(frame!.style.width)).toBeCloseTo(110, 6);
		expect(frame!.dataset.gesturing).toBe("true");
	});

	it("rotate はしきい値未満の移動でも即座に効く", () => {
		seed([makeImageLayer(1, "u-1")]);
		selectLayer();
		const rotateHandle = container.querySelector<HTMLElement>("[data-rotate-handle]");
		expect(rotateHandle).not.toBeNull();

		// center = slide(50,25) = client(22.5, 11.25)。真上 client(22.5, 0) から
		// client(24.5, 0.5) へ = 移動距離 hypot(2, 0.5) ≒ 2px でしきい値未満。
		dispatchPointer(rotateHandle!, "pointerdown", { clientX: 22.5, clientY: 0 });
		dispatchPointer(stageEl(), "pointermove", { clientX: 24.5, clientY: 0.5 });
		dispatchPointer(stageEl(), "pointerup", { clientX: 24.5, clientY: 0.5 });

		expect(Math.abs(storedLayer().rotation)).toBeGreaterThan(0);
		expect(historyCount()).toBe(1);
	});
});
