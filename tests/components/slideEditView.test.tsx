import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { SlideEditView } from "../../src/components/slide/SlideEditView";
import { useLayerStore } from "../../src/state/layerStore";
import type { ImageLayer } from "../../src/types/Layer";
import type { Slide } from "../../src/types/Slide";

// v4 Group D D-1: SlideEditView の smoke + fit-to-area scale 計算検証。
// layer click hit-test / 編集ハンドルは D-3 以降で実装するため本テストでは扱わない。

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

beforeEach(() => {
	container = document.createElement("div");
	document.body.appendChild(container);
	root = createRoot(container);
});

afterEach(() => {
	act(() => root.unmount());
	container.remove();
});

const render = (slide: Slide, fitAreaWidth: number, fitAreaHeight: number): void => {
	act(() => {
		root.render(
			<SlideEditView slide={slide} fitAreaWidth={fitAreaWidth} fitAreaHeight={fitAreaHeight} />
		);
	});
};

describe("SlideEditView (v4 Group D D-1)", () => {
	it("data-slide-edit-area / data-slide-edit-stage が描画される", () => {
		render(makeSlide(), 800, 600);
		expect(container.querySelector("[data-slide-edit-area]")).not.toBeNull();
		expect(container.querySelector("[data-slide-edit-stage]")).not.toBeNull();
	});

	// fit-to-area には FIT_MARGIN_RATIO=0.9 が掛かる (全体表示で一回り小さく余白を残す = legacy SCALE_DEFAULT)。
	it("fit area が横長 (800x600) で slide 1600x800 → 横幅律 (scale=0.5×0.9=0.45)、stage=720x360", () => {
		// scaleX = 800/1600 = 0.5, scaleY = 600/800 = 0.75 → min = 0.5 ×0.9 = 0.45
		// displayW = 1600*0.45 = 720, displayH = 800*0.45 = 360
		render(makeSlide(), 800, 600);
		const stage = container.querySelector<HTMLElement>("[data-slide-edit-stage]");
		expect(stage?.style.width).toBe("720px");
		expect(stage?.style.height).toBe("360px");
	});

	it("fit area が縦長 (400x600) で slide 1600x800 → 横幅律 (scale=0.25×0.9=0.225)、stage=360x180", () => {
		// scaleX = 400/1600 = 0.25, scaleY = 600/800 = 0.75 → min = 0.25 ×0.9 = 0.225
		// displayW = 1600*0.225 = 360, displayH = 800*0.225 = 180
		render(makeSlide(), 400, 600);
		const stage = container.querySelector<HTMLElement>("[data-slide-edit-stage]");
		expect(stage?.style.width).toBe("360px");
		expect(stage?.style.height).toBe("180px");
	});

	it("fit area が小さく縦律 (800x100) で slide 1600x800 → 縦律 (scale=0.125×0.9=0.1125)、stage=180x90", () => {
		// scaleX = 800/1600 = 0.5, scaleY = 100/800 = 0.125 → min = 0.125 ×0.9 = 0.1125
		// displayW = 1600*0.1125 = 180, displayH = 800*0.1125 = 90
		render(makeSlide(), 800, 100);
		const stage = container.querySelector<HTMLElement>("[data-slide-edit-stage]");
		expect(stage?.style.width).toBe("180px");
		expect(stage?.style.height).toBe("90px");
	});

	it("内側 transform は scale(scale) で transformOrigin top left", () => {
		render(makeSlide(), 800, 600);
		const stage = container.querySelector<HTMLElement>("[data-slide-edit-stage]");
		const scaledInner = stage?.firstElementChild as HTMLElement | null;
		expect(scaledInner?.style.transform).toBe("scale(0.45)"); // 0.5 ×0.9
		expect(scaledInner?.style.transformOrigin).toBe("top left");
		// scaled inner の width/height は native slide 寸法
		expect(scaledInner?.style.width).toBe("1600px");
		expect(scaledInner?.style.height).toBe("800px");
	});

	it("SlideView が内側に存在 (slide content 描画)", () => {
		render(makeSlide({ id: 42 }), 800, 600);
		// SlideView は data-slide-id を持つ
		expect(container.querySelector("[data-slide-id='42']")).not.toBeNull();
	});

	it("stage は absolute + translate(-50%,-50%) で中央寄せ (高倍率 overflow でも中央維持)", () => {
		render(makeSlide(), 800, 600);
		const stage = container.querySelector<HTMLElement>("[data-slide-edit-stage]");
		// flex の unsafe-center ではなく明示 translate 中央寄せ
		expect(stage?.style.position).toBe("absolute");
		expect(stage?.style.left).toBe("50%");
		expect(stage?.style.top).toBe("50%");
		expect(stage?.style.transform).toBe("translate(-50%, -50%)");
	});
});

describe("SlideEditView ドラッグ&ドロップ (v4 Group D D-11)", () => {
	it("drop overlay は既定で hidden、edit area への dragover で表示される", () => {
		render(makeSlide(), 800, 600);
		const overlay = container.querySelector<HTMLElement>("[data-slide-drop-overlay]");
		expect(overlay).not.toBeNull();
		// 既定 (ドラッグ無し) は display:none
		expect(overlay?.style.display).toBe("none");
		// edit area へ dragover → isOver=true → overlay 表示
		const area = container.querySelector<HTMLElement>("[data-slide-edit-area]");
		act(() => {
			area?.dispatchEvent(new Event("dragover", { bubbles: true, cancelable: true }));
		});
		expect(overlay?.style.display).toBe("flex");
	});
});

const dummyImageLayer = (uuid: string): ImageLayer => ({
	id: 1,
	uuid,
	name: "",
	opacity: 1,
	locked: false,
	visible: true,
	shared: false,
	transX: 0,
	transY: 0,
	scaleX: 1,
	scaleY: 1,
	rotation: 0,
	mirrorH: false,
	mirrorV: false,
	type: "image",
	imageId: "img-a",
	clipRect: [0, 0, 0, 0],
	isText: false,
});

describe("SlideEditView レイヤードロップシャドウ (legacy .slide.editable img)", () => {
	it("edit scaled 配下の image layer に drop-shadow を適用する style を注入", () => {
		render(makeSlide(), 800, 600);
		const style = container.querySelector("[data-slide-edit-style]");
		expect(style).not.toBeNull();
		expect(style?.textContent).toContain("drop-shadow");
		// slideshow/thumb に漏れないよう edit scaled にスコープされている
		expect(style?.textContent).toContain("[data-slide-edit-scaled]");
		expect(style?.textContent).toContain('[data-layer-type="image"]');
	});
});

describe("SlideEditView 領域外クリックで選択解除", () => {
	afterEach(() => {
		useLayerStore.getState().setSelectedLayer(null);
	});

	it("キャンバスエリア素地 (outer) の pointerdown で選択解除", () => {
		useLayerStore.getState().setSelectedLayer(dummyImageLayer("sel"));
		render(makeSlide(), 800, 600);
		const area = container.querySelector<HTMLElement>("[data-slide-edit-area]");
		expect(useLayerStore.getState().selectedLayer).not.toBeNull();
		act(() => {
			area?.dispatchEvent(new MouseEvent("pointerdown", { bubbles: true, button: 0 }));
		});
		expect(useLayerStore.getState().selectedLayer).toBeNull();
	});

	it("子要素 (stage) クリックでは outer ハンドラで解除しない (target≠currentTarget)", () => {
		useLayerStore.getState().setSelectedLayer(dummyImageLayer("sel"));
		render(makeSlide(), 800, 600);
		const stage = container.querySelector<HTMLElement>("[data-slide-edit-stage]");
		act(() => {
			stage?.dispatchEvent(new MouseEvent("pointerdown", { bubbles: true, button: 0 }));
		});
		// outer の素地ではないので解除されない (stage 内の空白解除は useLayerGesture の担当)
		expect(useLayerStore.getState().selectedLayer?.uuid).toBe("sel");
	});
});

// 領域の赤ボーダー + 領域外レイヤーの半透明プレビュー (legacy .slide.editable parity)。
describe("SlideEditView 領域ボーダー / 領域外プレビュー", () => {
	it("赤い半透明ボーダー (rgba(200,0,0,0.5)) を領域に描画し、太さは scale 補正される", () => {
		// fit area 800x600 / slide 1600x800 → scale 0.45。border 見かけ 6px → 6/0.45 = 13.33px
		render(makeSlide({ layers: [dummyImageLayer("u-1")] }), 800, 600);
		const border = container.querySelector<HTMLElement>("[data-slide-edit-area-border]");
		expect(border).not.toBeNull();
		expect(border?.style.border).toContain("rgba(200, 0, 0, 0.5)");
		expect(border?.style.border).toContain("13.33"); // 6 / 0.45
		expect(border?.style.pointerEvents).toBe("none");
	});

	it("領域外プレビュー (装飾コピー) は薄く・非操作で、data-slide-id / data-layer-id を持たない", () => {
		render(makeSlide({ layers: [dummyImageLayer("u-1")] }), 800, 600);
		const dim = container.querySelector<HTMLElement>("[data-slide-edit-out-of-area]");
		expect(dim).not.toBeNull();
		expect(dim?.style.opacity).toBe("0.4");
		expect(dim?.style.pointerEvents).toBe("none");
		// 装飾コピーは data-* を出さない (ヒットテスト・overlay 計測の対象外)
		expect(dim?.querySelector("[data-slide-id]")).toBeNull();
		expect(dim?.querySelector("[data-layer-id]")).toBeNull();
	});

	it("data-layer-id は前面 (操作対象) の 1 個のみ (装飾コピーは重複しない)", () => {
		render(makeSlide({ layers: [dummyImageLayer("u-1")] }), 800, 600);
		// 装飾コピー + 前面の 2 枚描画でも、ヒットテスト対象の data-layer-id は前面のみ
		expect(container.querySelectorAll("[data-layer-id]").length).toBe(1);
	});

	it("領域内フルコピーは clip=true (overflow hidden)、装飾コピーは clip=false (visible)", () => {
		render(makeSlide({ layers: [dummyImageLayer("u-1")] }), 800, 600);
		const dim = container.querySelector<HTMLElement>("[data-slide-edit-out-of-area]");
		// 装飾コピーの SlideView ルートは overflow:visible (領域外も描画)
		const dimSlideRoot = dim?.firstElementChild as HTMLElement | null;
		expect(dimSlideRoot?.style.overflow).toBe("visible");
		// 前面 (data-slide-id を持つ SlideView ルート) は overflow:hidden
		const frontSlideRoot = container.querySelector<HTMLElement>("[data-slide-id]");
		expect(frontSlideRoot?.style.overflow).toBe("hidden");
	});
});
