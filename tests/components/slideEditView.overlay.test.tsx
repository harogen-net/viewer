import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { SlideEditView } from "../../src/components/slide/SlideEditView";
import { useLayerStore } from "../../src/state/layerStore";
import { useSlideStore } from "../../src/state/slideStore";
import type { ImageLayer, Layer, TextLayer } from "../../src/types/Layer";
import type { Slide } from "../../src/types/Slide";

// v4 Group D D-3a: LayerEditOverlay (選択枠 + bbox 計測 + hit-test) のテスト。
// hit-test は D-3b refactor で click → pointerdown に移行済み。
// drag/resize/rotate は D-3b/D-3c で追加するためここでは扱わない。

const baseTransform = {
	transX: 0,
	transY: 0,
	scaleX: 1,
	scaleY: 1,
	rotation: 0,
	mirrorH: false,
	mirrorV: false,
};
const baseLayerProps = (id: number, uuid: string, overrides: Partial<Layer> = {}) => ({
	id,
	uuid,
	name: "",
	opacity: 1,
	locked: false,
	visible: true,
	shared: false,
	...baseTransform,
	...overrides,
});
const makeImageLayer = (id: number, uuid: string, imageId: string, overrides: Partial<ImageLayer> = {}): ImageLayer => ({
	...baseLayerProps(id, uuid, overrides),
	type: "image",
	imageId,
	clipRect: [0, 0, 0, 0],
	isText: false,
	...overrides,
});
const makeTextLayer = (id: number, uuid: string, text: string, overrides: Partial<TextLayer> = {}): TextLayer => ({
	...baseLayerProps(id, uuid, overrides),
	type: "text",
	text,
	...overrides,
});
const makeSlide = (layers: Layer[], overrides: Partial<Slide> = {}): Slide => ({
	id: 1,
	uuid: "s-1",
	width: 1600,
	height: 800,
	durationRatio: 1,
	joining: true,
	disabled: false,
	layers,
	...overrides,
});

let container: HTMLDivElement;
let root: Root;

// offsetWidth/offsetHeight は jsdom で 0 を返すため stub する (LayerEditOverlay の bbox 計測用)。
let __origOffsetW: PropertyDescriptor | undefined;
let __origOffsetH: PropertyDescriptor | undefined;

beforeEach(() => {
	useSlideStore.getState().setSlides([]);
	useLayerStore.getState().setLayers([]);
	useLayerStore.getState().setSelectedLayer(null);
	container = document.createElement("div");
	document.body.appendChild(container);
	root = createRoot(container);

	__origOffsetW = Object.getOwnPropertyDescriptor(HTMLElement.prototype, "offsetWidth");
	__origOffsetH = Object.getOwnPropertyDescriptor(HTMLElement.prototype, "offsetHeight");
	// data-layer-id が付いている要素 (LayerView wrapper) のみ固定サイズを返す。
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
	if (__origOffsetW) Object.defineProperty(HTMLElement.prototype, "offsetWidth", __origOffsetW);
	if (__origOffsetH) Object.defineProperty(HTMLElement.prototype, "offsetHeight", __origOffsetH);
});

const render = (slide: Slide, fitAreaWidth = 800, fitAreaHeight = 600): void => {
	act(() => {
		root.render(
			<SlideEditView slide={slide} fitAreaWidth={fitAreaWidth} fitAreaHeight={fitAreaHeight} />,
		);
	});
};

describe("SlideEditView (v4 Group D D-3a) - overlay + hit-test", () => {
	it("data-edit-overlay コンテナが常に存在 (選択なしでも)", () => {
		render(makeSlide([]));
		expect(container.querySelector("[data-edit-overlay]")).not.toBeNull();
		// 選択無しなので選択枠は出ない
		expect(container.querySelector("[data-edit-selection-frame]")).toBeNull();
	});

	it("selectedLayer 指定時に選択枠 (data-edit-selection-frame) が描画される", () => {
		const layer = makeImageLayer(1, "u-1", "img-a");
		render(makeSlide([layer]));
		act(() => {
			useLayerStore.getState().setSelectedLayer(layer);
		});
		const frame = container.querySelector<HTMLElement>("[data-edit-selection-frame]");
		expect(frame).not.toBeNull();
		expect(frame?.dataset.selectedLayerId).toBe("1");
		expect(frame?.dataset.selectedLayerUuid).toBe("u-1");
	});

	it("選択枠サイズは LayerView wrapper の offsetWidth/Height を反映 (layer scale=1 時)", () => {
		const layer = makeTextLayer(2, "u-2", "hello");
		render(makeSlide([layer]));
		act(() => {
			useLayerStore.getState().setSelectedLayer(layer);
		});
		const frame = container.querySelector<HTMLElement>("[data-edit-selection-frame]");
		// stub 上 wrapper は 100 x 50、scale=1 だからそのまま
		expect(frame?.style.width).toBe("100px");
		expect(frame?.style.height).toBe("50px");
	});

	it("選択枠 transform は translate + rotate のみ (layer scale は frame サイズへ展開)", () => {
		const layer = makeImageLayer(3, "u-3", "img-b", {
			transX: 200,
			transY: 100,
			scaleX: 2,
			scaleY: 1.5,
			rotation: 30,
			mirrorH: false,
			mirrorV: false,
		});
		render(makeSlide([layer]));
		act(() => {
			useLayerStore.getState().setSelectedLayer(layer);
		});
		const frame = container.querySelector<HTMLElement>("[data-edit-selection-frame]");
		// visW = 100*2 = 200, visH = 50*1.5 = 75
		// dx = (100 - 200)/2 = -50, dy = (50 - 75)/2 = -12.5
		// translate(200 + -50, 100 + -12.5) = translate(150px, 87.5px)
		expect(frame?.style.width).toBe("200px");
		expect(frame?.style.height).toBe("75px");
		expect(frame?.style.transform).toBe("translate(150px, 87.5px) rotate(30deg)");
		expect(frame?.style.transformOrigin).toBe("50% 50%");
	});

	it("mirrorH/V は visual size に |scale| として反映され、frame に符号は付かない", () => {
		const layer = makeImageLayer(4, "u-4", "img-c", {
			scaleX: 1.2,
			scaleY: 1.3,
			mirrorH: true,
			mirrorV: true,
		});
		render(makeSlide([layer]));
		act(() => {
			useLayerStore.getState().setSelectedLayer(layer);
		});
		const frame = container.querySelector<HTMLElement>("[data-edit-selection-frame]");
		// visW = 100 * |1.2| = 120, visH = 50 * |1.3| = 65
		expect(frame?.style.width).toBe("120px");
		expect(frame?.style.height).toBe("65px");
		// transform に scale は含まれず、translate + rotate のみ
		expect(frame?.style.transform).not.toContain("scale");
		expect(frame?.style.transform).toContain("rotate(0deg)");
	});

	it("選択 layer が現在の slide.layers に含まれない場合は枠を出さない", () => {
		const layer = makeImageLayer(1, "u-1", "img-a");
		const orphan = makeImageLayer(99, "u-99", "img-x");
		render(makeSlide([layer]));
		act(() => {
			useLayerStore.getState().setSelectedLayer(orphan);
		});
		expect(container.querySelector("[data-edit-selection-frame]")).toBeNull();
	});

	it("layer wrapper に pointerdown したら setSelectedLayer が呼ばれる (hit-test)", () => {
		const l1 = makeImageLayer(1, "u-1", "img-a");
		const l2 = makeTextLayer(2, "u-2", "hello");
		render(makeSlide([l1, l2]));
		const wrapper = container.querySelector<HTMLElement>('[data-layer-id="2"]');
		expect(wrapper).not.toBeNull();
		act(() => {
			const ev = new Event("pointerdown", { bubbles: true, cancelable: true });
			Object.defineProperty(ev, "clientX", { value: 0 });
			Object.defineProperty(ev, "clientY", { value: 0 });
			Object.defineProperty(ev, "pointerId", { value: 1 });
			Object.defineProperty(ev, "button", { value: 0 });
			wrapper?.dispatchEvent(ev);
		});
		const sel = useLayerStore.getState().selectedLayer;
		expect(sel?.id).toBe(2);
		expect(sel?.uuid).toBe("u-2");
	});

	it("layer 以外 (背景) に pointerdown したら selectedLayer が null に", () => {
		const layer = makeImageLayer(1, "u-1", "img-a");
		render(makeSlide([layer]));
		act(() => {
			useLayerStore.getState().setSelectedLayer(layer);
		});
		const stage = container.querySelector<HTMLElement>("[data-slide-edit-scaled]");
		expect(stage).not.toBeNull();
		act(() => {
			const ev = new Event("pointerdown", { bubbles: true, cancelable: true });
			Object.defineProperty(ev, "clientX", { value: 0 });
			Object.defineProperty(ev, "clientY", { value: 0 });
			Object.defineProperty(ev, "pointerId", { value: 1 });
			Object.defineProperty(ev, "button", { value: 0 });
			stage?.dispatchEvent(ev);
		});
		expect(useLayerStore.getState().selectedLayer).toBeNull();
	});

	it("選択枠の outline 太さは stageScale で補正される (2/scale)", () => {
		// fit area 800x600, slide 1600x800 → scale = min(0.5, 0.75) = 0.5
		// → outline 太さ = 2/0.5 = 4px (LayerEditOverlay の OUTLINE_THICKNESS_PX=2)
		const layer = makeImageLayer(1, "u-1", "img-a");
		render(makeSlide([layer]), 800, 600);
		act(() => {
			useLayerStore.getState().setSelectedLayer(layer);
		});
		const frame = container.querySelector<HTMLElement>("[data-edit-selection-frame]");
		expect(frame?.style.outline).toContain("4px");
		expect(frame?.style.outline).toContain("solid");
	});
});
