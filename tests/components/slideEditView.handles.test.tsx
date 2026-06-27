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

// v4 Group D D-3c: resize (4 角 anchor、aspect 固定) + rotate (Shift 15° snap) のテスト。
// jsdom 環境 (getBoundingClientRect は 0,0 オリジン) で stageScale=0.45 (fit×0.9) を前提に slide-coord を計算。

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
	// layer wrapper のみ 100x50 を返す stub
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
};

const renderHost = (): void => {
	act(() => {
		root.render(<RenderHost />);
	});
};

const selectByPointerOnLayer = (id: number): void => {
	const wrapper = container.querySelector<HTMLElement>(`[data-layer-id="${id}"]`);
	if (!wrapper) throw new Error(`layer ${id} not found`);
	dispatchPointer(wrapper, "pointerdown", { clientX: 0, clientY: 0 });
	const stage = container.querySelector<HTMLElement>("[data-slide-edit-scaled]");
	// 即 pointerup で drag をキャンセル (= 純粋な選択クリック扱い)
	dispatchPointer(stage!, "pointerup", { clientX: 0, clientY: 0 });
};

const dispatchPointer = (
	el: HTMLElement,
	type: "pointerdown" | "pointermove" | "pointerup" | "pointercancel",
	props: {
		clientX: number;
		clientY: number;
		pointerId?: number;
		button?: number;
		shiftKey?: boolean;
	}
): void => {
	const ev = new Event(type, { bubbles: true, cancelable: true });
	Object.defineProperty(ev, "clientX", { value: props.clientX });
	Object.defineProperty(ev, "clientY", { value: props.clientY });
	Object.defineProperty(ev, "pointerId", { value: props.pointerId ?? 1 });
	Object.defineProperty(ev, "button", { value: props.button ?? 0 });
	Object.defineProperty(ev, "shiftKey", { value: props.shiftKey ?? false });
	act(() => {
		el.dispatchEvent(ev);
	});
};

describe("SlideEditView (v4 Group D D-3c) - resize", () => {
	it("anchor[se] への pointerdown + pointermove で aspect 固定 resize live が反映", () => {
		// layer: 0,0 scale=1, content 100x50
		// pivot (nw) at slide (0,0). 'se' anchor at slide (100, 50).
		// stageScale=0.45 (fit×0.9) → slide(200,100) は client (200*0.45, 100*0.45)=(90,45)
		// → V=(200,100), V·d=200*100+100*50=25000, |d|^2=12500, t=2
		// → newScaleX=2, newScaleY=2, newCenter=(0,0)+(100,50)=(100,50), newTransX=50, newTransY=25
		seed([makeImageLayer(1, "u-1")]);
		renderHost();
		selectByPointerOnLayer(1);
		const anchorSe = container.querySelector<HTMLElement>('[data-resize-anchor="se"]');
		const stage = container.querySelector<HTMLElement>("[data-slide-edit-scaled]");
		expect(anchorSe).not.toBeNull();

		dispatchPointer(anchorSe!, "pointerdown", { clientX: 45, clientY: 22.5 });
		dispatchPointer(stage!, "pointermove", { clientX: 90, clientY: 45 });

		const frame = container.querySelector<HTMLElement>("[data-edit-selection-frame]");
		// live: scaleX=2, scaleY=2, transX=50, transY=25 → visW = 100*2 = 200, visH = 50*2 = 100
		// offX = (100 - 200) / 2 = -50, offY = (50 - 100) / 2 = -25
		// translate(50 + -50, 25 + -25) = translate(0px, 0px)
		expect(frame!.style.width).toBe("200px");
		expect(frame!.style.height).toBe("100px");
		expect(frame!.style.transform).toBe("translate(0px, 0px) rotate(0deg)");
		expect(frame!.dataset.gesturing).toBe("true");
	});

	it("pointerup で resize 結果 (scale + trans) が commit され、履歴 1 件", () => {
		seed([makeImageLayer(1, "u-1")]);
		renderHost();
		selectByPointerOnLayer(1);
		const anchorSe = container.querySelector<HTMLElement>('[data-resize-anchor="se"]');
		const stage = container.querySelector<HTMLElement>("[data-slide-edit-scaled]");

		dispatchPointer(anchorSe!, "pointerdown", { clientX: 45, clientY: 22.5 });
		dispatchPointer(stage!, "pointermove", { clientX: 90, clientY: 45 });
		dispatchPointer(stage!, "pointerup", { clientX: 90, clientY: 45 });

		const stored = useSlideStore.getState().slides[0].layers[0];
		expect(stored.scaleX).toBe(2);
		expect(stored.scaleY).toBe(2);
		expect(stored.transX).toBe(50);
		expect(stored.transY).toBe(25);
		expect(useHistoryStore.getState().past.length).toBe(1);
	});

	it("anchor[nw] resize は se 側 (100,50) が pivot として固定", () => {
		// pivot (se) at slide (100, 50). 'nw' anchor at slide (0, 0).
		// stageScale=0.45 → slide(-100,-50) は client (-45,-22.5)
		// signX=-1, signY=-1, baseVisW=100, baseVisH=50
		// V = (-100,-50) - (100,50) = (-200, -100)
		// dot = -200 * -1 * 100 + -100 * -1 * 50 = 20000 + 5000 = 25000
		// t = 25000 / 12500 = 2
		// new center = pivot (100,50) + R * (-1*100, -1*50) = (0, 0)
		// newTransX = 0 - 50 = -50, newTransY = 0 - 25 = -25
		seed([makeImageLayer(1, "u-1")]);
		renderHost();
		selectByPointerOnLayer(1);
		const anchorNw = container.querySelector<HTMLElement>('[data-resize-anchor="nw"]');
		const stage = container.querySelector<HTMLElement>("[data-slide-edit-scaled]");

		dispatchPointer(anchorNw!, "pointerdown", { clientX: 0, clientY: 0 });
		dispatchPointer(stage!, "pointermove", { clientX: -45, clientY: -22.5 });
		dispatchPointer(stage!, "pointerup", { clientX: -45, clientY: -22.5 });

		const stored = useSlideStore.getState().slides[0].layers[0];
		expect(stored.scaleX).toBe(2);
		expect(stored.scaleY).toBe(2);
		expect(stored.transX).toBe(-50);
		expect(stored.transY).toBe(-25);
	});

	it("locked layer は anchor 自体が描画されない", () => {
		seed([makeImageLayer(1, "u-1", { locked: true })]);
		renderHost();
		// pointerdown で選択
		const wrapper = container.querySelector<HTMLElement>('[data-layer-id="1"]');
		dispatchPointer(wrapper!, "pointerdown", { clientX: 0, clientY: 0 });
		expect(useLayerStore.getState().selectedLayer?.uuid).toBe("u-1");
		// locked なので anchor / rotate handle なし
		expect(container.querySelector('[data-resize-anchor="se"]')).toBeNull();
		expect(container.querySelector("[data-rotate-handle]")).toBeNull();
	});

	it("移動なし (t=1) では commit されない", () => {
		seed([makeImageLayer(1, "u-1")]);
		renderHost();
		selectByPointerOnLayer(1);
		const anchorSe = container.querySelector<HTMLElement>('[data-resize-anchor="se"]');
		const stage = container.querySelector<HTMLElement>("[data-slide-edit-scaled]");
		dispatchPointer(anchorSe!, "pointerdown", { clientX: 50, clientY: 25 });
		dispatchPointer(stage!, "pointerup", { clientX: 50, clientY: 25 });
		expect(useHistoryStore.getState().past.length).toBe(0);
	});
});

describe("SlideEditView (v4 Group D D-3c) - rotate", () => {
	it("rotate handle への pointerdown + pointermove で rotation live が反映", () => {
		// center = (50, 25) in slide-coord.
		// startPointer at angle 0 from center → clientX large, clientY = 25 (= center.y in client)
		// → atan2(0, +) = 0
		// move to angle PI/2 (= 90°) → clientX = center.x, clientY > center.y
		seed([makeImageLayer(1, "u-1")]);
		renderHost();
		selectByPointerOnLayer(1);
		const rotateHandle = container.querySelector<HTMLElement>("[data-rotate-handle]");
		const stage = container.querySelector<HTMLElement>("[data-slide-edit-scaled]");
		expect(rotateHandle).not.toBeNull();

		// stageScale = 0.45 (fit×0.9), center at slide (50,25) = client (22.5, 11.25)
		// start client (180, 11.25) = slide (400, 25) → angle 0 (delta x = 350, dy = 0)
		dispatchPointer(rotateHandle!, "pointerdown", { clientX: 180, clientY: 11.25 });
		// move client (22.5, 180) = slide (50, 400) → angle = atan2(375, 0) = PI/2
		dispatchPointer(stage!, "pointermove", { clientX: 22.5, clientY: 180 });

		const frame = container.querySelector<HTMLElement>("[data-edit-selection-frame]");
		expect(frame!.dataset.gesturing).toBe("true");
		// rotation new = base 0 + 90deg
		expect(frame!.style.transform).toContain("rotate(90deg)");
	});

	it("pointerup で rotation commit、履歴 1 件", () => {
		seed([makeImageLayer(1, "u-1")]);
		renderHost();
		selectByPointerOnLayer(1);
		const rotateHandle = container.querySelector<HTMLElement>("[data-rotate-handle]");
		const stage = container.querySelector<HTMLElement>("[data-slide-edit-scaled]");

		dispatchPointer(rotateHandle!, "pointerdown", { clientX: 180, clientY: 11.25 });
		dispatchPointer(stage!, "pointermove", { clientX: 22.5, clientY: 180 });
		dispatchPointer(stage!, "pointerup", { clientX: 22.5, clientY: 180 });

		const stored = useSlideStore.getState().slides[0].layers[0];
		expect(stored.rotation).toBeCloseTo(90, 5);
		expect(useHistoryStore.getState().past.length).toBe(1);
	});

	it("Shift 押下中の pointermove は 15° に snap", () => {
		seed([makeImageLayer(1, "u-1")]);
		renderHost();
		selectByPointerOnLayer(1);
		const rotateHandle = container.querySelector<HTMLElement>("[data-rotate-handle]");
		const stage = container.querySelector<HTMLElement>("[data-slide-edit-scaled]");

		// start client (180, 11.25) = slide (400, 25), angle 0 (stageScale=0.45)
		dispatchPointer(rotateHandle!, "pointerdown", { clientX: 180, clientY: 11.25, shiftKey: true });
		// 移動先: 約 22° (15 と 30 の間に近い) → slide 中心 (50,25) からの角度
		// 想定: 50+100*cos(22°), 25+100*sin(22°) ≈ (50+92.7, 25+37.5) = slide (142.7, 62.5)
		// → client = slide ×0.45 = (64.215, 28.125)
		dispatchPointer(stage!, "pointermove", {
			clientX: 64.215,
			clientY: 28.125,
			shiftKey: true,
		});
		dispatchPointer(stage!, "pointerup", { clientX: 64.215, clientY: 28.125, shiftKey: true });

		const stored = useSlideStore.getState().slides[0].layers[0];
		// 22° は 15° に snap される
		expect(stored.rotation).toBe(15);
	});

	it("rotation 変更なしでは commit されない", () => {
		seed([makeImageLayer(1, "u-1")]);
		renderHost();
		selectByPointerOnLayer(1);
		const rotateHandle = container.querySelector<HTMLElement>("[data-rotate-handle]");
		const stage = container.querySelector<HTMLElement>("[data-slide-edit-scaled]");
		dispatchPointer(rotateHandle!, "pointerdown", { clientX: 180, clientY: 11.25 });
		dispatchPointer(stage!, "pointerup", { clientX: 180, clientY: 11.25 });
		expect(useHistoryStore.getState().past.length).toBe(0);
	});
});
