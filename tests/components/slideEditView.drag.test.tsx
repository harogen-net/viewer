import { act, useSyncExternalStore } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { SlideEditView } from "../../src/components/slide/SlideEditView";
import { useHistoryStore } from "../../src/state/historyStore";
import { useLayerStore } from "../../src/state/layerStore";
import { useSlideStore } from "../../src/state/slideStore";
import { useViewerDocumentStore } from "../../src/state/viewerDocumentStore";
import type { ImageLayer, Layer } from "../../src/types/Layer";
import type { Slide } from "../../src/types/Slide";

// v4 Group D D-3b: useLayerDrag (pointerdown で hit-test + drag を 1 gesture に統合) のテスト。
// pointerdown は layer wrapper に対して dispatch する (新仕様)。
// pointermove/up は scaled stage に dispatch (pointer capture が stage 側にあるため)。

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
let __origOffsetW: PropertyDescriptor | undefined;
let __origOffsetH: PropertyDescriptor | undefined;

beforeEach(() => {
	useSlideStore.getState().setSlides([]);
	useLayerStore.getState().setLayers([]);
	useLayerStore.getState().setSelectedLayer(null);
	useHistoryStore.getState().clear();
	useViewerDocumentStore.setState({ meta: null, modified: false });
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
	if (__origOffsetW) Object.defineProperty(HTMLElement.prototype, "offsetWidth", __origOffsetW);
	if (__origOffsetH) Object.defineProperty(HTMLElement.prototype, "offsetHeight", __origOffsetH);
});

// slideStore から現 slide を読んで SlideEditView に渡すラッパ
// (useLayerMutation 経由の updateLayer が slideStore を書き換えるので、render を slideStore に追従させる)
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

const seed = (layers: Layer[]): Slide => {
	const slide = makeSlide(layers);
	useSlideStore.getState().setSlides([slide]);
	useSlideStore.getState().setSelectedIndex(0);
	return slide;
};

const renderHost = (): void => {
	act(() => {
		root.render(<RenderHost />);
	});
};

const dispatchPointer = (
	el: HTMLElement,
	type: "pointerdown" | "pointermove" | "pointerup" | "pointercancel",
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

describe("SlideEditView (v4 Group D D-3b) - pointerdown 即 drag", () => {
	it("layer wrapper への pointerdown で setSelectedLayer + drag 開始", () => {
		const layer = makeImageLayer(1, "u-1", { transX: 50, transY: 30 });
		seed([layer]);
		renderHost();
		const wrapper = container.querySelector<HTMLElement>('[data-layer-id="1"]');
		const stage = container.querySelector<HTMLElement>("[data-slide-edit-scaled]");
		expect(wrapper).not.toBeNull();

		dispatchPointer(wrapper!, "pointerdown", { clientX: 0, clientY: 0 });
		// 選択は即時確定
		expect(useLayerStore.getState().selectedLayer?.uuid).toBe("u-1");
		// 同 gesture で drag 開始済み: pointermove で frame transform が追従
		dispatchPointer(stage!, "pointermove", { clientX: 100, clientY: 50 });
		// stageScale = 0.5 → delta 200, 100
		// transX 50 + 200 = 250, transY 30 + 100 = 130
		const frame = container.querySelector<HTMLElement>("[data-edit-selection-frame]");
		expect(frame!.style.transform).toBe("translate(250px, 130px) rotate(0deg)");
		expect(frame!.dataset.gesturing).toBe("true");
	});

	it("pointerup で transX/transY が slideStore に commit、履歴 1 件", () => {
		const layer = makeImageLayer(1, "u-1", { transX: 10, transY: 20 });
		seed([layer]);
		renderHost();
		const wrapper = container.querySelector<HTMLElement>('[data-layer-id="1"]');
		const stage = container.querySelector<HTMLElement>("[data-slide-edit-scaled]");

		dispatchPointer(wrapper!, "pointerdown", { clientX: 0, clientY: 0 });
		dispatchPointer(stage!, "pointermove", { clientX: 40, clientY: 20 });
		dispatchPointer(stage!, "pointerup", { clientX: 40, clientY: 20 });

		// stageScale = 0.5 → delta 80, 40
		const stored = useSlideStore.getState().slides[0].layers[0];
		expect(stored.transX).toBe(10 + 80);
		expect(stored.transY).toBe(20 + 40);
		expect(useHistoryStore.getState().past.length).toBe(1);
		expect(useHistoryStore.getState().past[0].label).toBe("update layer");
		// gesture state 解除
		const frame = container.querySelector<HTMLElement>("[data-edit-selection-frame]");
		expect(frame?.dataset.gesturing).toBe("false");
	});

	it("pointer 移動なし (delta=0) で pointerup したら commit されない (= 純粋な選択クリック)", () => {
		const layer = makeImageLayer(1, "u-1", { transX: 10, transY: 20 });
		seed([layer]);
		renderHost();
		const wrapper = container.querySelector<HTMLElement>('[data-layer-id="1"]');
		const stage = container.querySelector<HTMLElement>("[data-slide-edit-scaled]");

		dispatchPointer(wrapper!, "pointerdown", { clientX: 0, clientY: 0 });
		dispatchPointer(stage!, "pointerup", { clientX: 0, clientY: 0 });

		const stored = useSlideStore.getState().slides[0].layers[0];
		expect(stored.transX).toBe(10);
		expect(stored.transY).toBe(20);
		expect(useHistoryStore.getState().past.length).toBe(0);
		// 選択は維持されている
		expect(useLayerStore.getState().selectedLayer?.uuid).toBe("u-1");
	});

	it("locked layer は pointerdown で選択のみ、drag は開始されない", () => {
		const layer = makeImageLayer(1, "u-1", { transX: 10, transY: 20, locked: true });
		seed([layer]);
		renderHost();
		const wrapper = container.querySelector<HTMLElement>('[data-layer-id="1"]');
		const stage = container.querySelector<HTMLElement>("[data-slide-edit-scaled]");

		dispatchPointer(wrapper!, "pointerdown", { clientX: 0, clientY: 0 });
		// 選択はされる
		expect(useLayerStore.getState().selectedLayer?.uuid).toBe("u-1");
		// pointermove しても drag 状態ではない
		dispatchPointer(stage!, "pointermove", { clientX: 100, clientY: 50 });
		const frame = container.querySelector<HTMLElement>("[data-edit-selection-frame]");
		expect(frame?.dataset.gesturing).toBe("false");
		dispatchPointer(stage!, "pointerup", { clientX: 100, clientY: 50 });
		const stored = useSlideStore.getState().slides[0].layers[0];
		expect(stored.transX).toBe(10);
		expect(stored.transY).toBe(20);
		expect(useHistoryStore.getState().past.length).toBe(0);
	});

	it("drag commit 後も selectedLayer は維持される (uuid 一致で復元)", () => {
		const layer = makeImageLayer(1, "u-1", { transX: 10, transY: 20 });
		seed([layer]);
		renderHost();
		const wrapper = container.querySelector<HTMLElement>('[data-layer-id="1"]');
		const stage = container.querySelector<HTMLElement>("[data-slide-edit-scaled]");

		dispatchPointer(wrapper!, "pointerdown", { clientX: 0, clientY: 0 });
		dispatchPointer(stage!, "pointermove", { clientX: 40, clientY: 20 });
		dispatchPointer(stage!, "pointerup", { clientX: 40, clientY: 20 });

		const sel = useLayerStore.getState().selectedLayer;
		expect(sel?.uuid).toBe("u-1");
		expect(sel?.transX).toBe(90);
		expect(container.querySelector("[data-edit-selection-frame]")).not.toBeNull();
	});

	it("右ボタン pointerdown は無視 (hit-test も drag も発火しない)", () => {
		const layer = makeImageLayer(1, "u-1", { transX: 10, transY: 20 });
		seed([layer]);
		renderHost();
		const wrapper = container.querySelector<HTMLElement>('[data-layer-id="1"]');
		const stage = container.querySelector<HTMLElement>("[data-slide-edit-scaled]");

		dispatchPointer(wrapper!, "pointerdown", { clientX: 0, clientY: 0, button: 2 });
		// 選択もされない
		expect(useLayerStore.getState().selectedLayer).toBeNull();
		dispatchPointer(stage!, "pointermove", { clientX: 100, clientY: 50 });
		dispatchPointer(stage!, "pointerup", { clientX: 100, clientY: 50 });
		expect(useHistoryStore.getState().past.length).toBe(0);
	});

	it("背景 pointerdown は選択解除", () => {
		const layer = makeImageLayer(1, "u-1");
		seed([layer]);
		renderHost();
		act(() => {
			useLayerStore.getState().setSelectedLayer(layer);
		});
		const stage = container.querySelector<HTMLElement>("[data-slide-edit-scaled]");
		dispatchPointer(stage!, "pointerdown", { clientX: 0, clientY: 0 });
		expect(useLayerStore.getState().selectedLayer).toBeNull();
	});
});

// 選択枠 (最上位 overlay) 経由の直接 drag。
// legacy: 操作用 AdjustView が常に最上位 → 選択 layer が上位レイヤーに覆われても操作可。
describe("SlideEditView 選択枠経由の直接 drag (覆われても操作可)", () => {
	it("上位レイヤーに覆われた選択 layer を、選択枠 pointerdown で直接 drag できる", () => {
		const lower = makeImageLayer(1, "u-1", { transX: 50, transY: 30 });
		const upper = makeImageLayer(2, "u-2"); // 配列末尾 = 前面 (u-1 を覆う)
		seed([lower, upper]);
		renderHost();
		// 下位の u-1 を選択
		act(() => useLayerStore.getState().setSelectedLayer(lower));
		const frame = container.querySelector<HTMLElement>("[data-edit-selection-frame]");
		expect(frame).not.toBeNull();
		const stage = container.querySelector<HTMLElement>("[data-slide-edit-scaled]");

		// 選択枠本体への pointerdown → ヒットテストせず u-1 を直接 drag (u-2 を選択しない)
		dispatchPointer(frame!, "pointerdown", { clientX: 0, clientY: 0 });
		expect(useLayerStore.getState().selectedLayer?.uuid).toBe("u-1");
		expect(frame!.dataset.gesturing).toBe("true");

		dispatchPointer(stage!, "pointermove", { clientX: 40, clientY: 20 });
		dispatchPointer(stage!, "pointerup", { clientX: 40, clientY: 20 });

		// stageScale 0.5 → delta 80,40。u-1 のみ移動 (u-2 不変)
		const u1 = useSlideStore.getState().slides[0].layers.find((l) => l.uuid === "u-1");
		const u2 = useSlideStore.getState().slides[0].layers.find((l) => l.uuid === "u-2");
		expect(u1?.transX).toBe(130);
		expect(u1?.transY).toBe(70);
		expect(u2?.transX).toBe(0);
		expect(useLayerStore.getState().selectedLayer?.uuid).toBe("u-1");
	});

	it("locked 選択 layer は選択枠 pointerdown でも drag せず、選択は維持 (解除しない)", () => {
		const lower = makeImageLayer(1, "u-1", { transX: 50, transY: 30, locked: true });
		seed([lower]);
		renderHost();
		act(() => useLayerStore.getState().setSelectedLayer(lower));
		const frame = container.querySelector<HTMLElement>("[data-edit-selection-frame]");
		const stage = container.querySelector<HTMLElement>("[data-slide-edit-scaled]");
		dispatchPointer(frame!, "pointerdown", { clientX: 0, clientY: 0 });
		dispatchPointer(stage!, "pointermove", { clientX: 40, clientY: 20 });
		dispatchPointer(stage!, "pointerup", { clientX: 40, clientY: 20 });
		// 移動なし・履歴なし・選択維持
		expect(useSlideStore.getState().slides[0].layers[0].transX).toBe(50);
		expect(useHistoryStore.getState().past.length).toBe(0);
		expect(useLayerStore.getState().selectedLayer?.uuid).toBe("u-1");
	});
});
