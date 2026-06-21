import { MantineProvider } from "@mantine/core";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { LayerListPanel } from "../../src/components/panels/LayerListPanel";
import { useLayerStore } from "../../src/state/layerStore";
import { useSlideStore } from "../../src/state/slideStore";
import type { ImageLayer, Layer, TextLayer } from "../../src/types/Layer";
import type { Slide } from "../../src/types/Slide";

// v4 Group D D-5: LayerListPanel の表示 + 選択テスト。
// mutation (visible/locked toggle, 削除, 順序変更) は D-2 以降で実装するため本テストでは扱わない。

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

const makeSlide = (layers: Layer[]): Slide => ({
	id: 1,
	uuid: "s-1",
	width: 800,
	height: 600,
	durationRatio: 1,
	joining: true,
	disabled: false,
	layers,
});

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
	useSlideStore.getState().setSlides([]);
	useLayerStore.getState().setLayers([]);
	container = document.createElement("div");
	document.body.appendChild(container);
	root = createRoot(container);
});

afterEach(() => {
	act(() => root.unmount());
	container.remove();
});

const render = (): void => {
	act(() => {
		root.render(
			<MantineProvider>
				<LayerListPanel />
			</MantineProvider>,
		);
	});
};

const seedSlide = (layers: Layer[]): void => {
	useSlideStore.getState().setSlides([makeSlide(layers)]);
	useSlideStore.getState().setSelectedIndex(0);
};

describe("LayerListPanel (v4 Group D D-5)", () => {
	it("slide 未選択時は案内テキストを表示", () => {
		render();
		expect(container.textContent).toContain("スライドを選択してください");
	});

	it("選択 slide が layers 空のとき 'レイヤーがありません' 表示", () => {
		seedSlide([]);
		render();
		expect(container.textContent).toContain("レイヤーがありません");
	});

	it("layers 3 件で 3 行が data-layer-uuid 付きで描画される", () => {
		seedSlide([
			makeImageLayer(1, "a", "img-aaaa"),
			makeTextLayer(2, "b", "hello"),
			makeImageLayer(3, "c", "img-cccc"),
		]);
		render();
		const rows = container.querySelectorAll<HTMLElement>("[data-layer-uuid]");
		expect(rows.length).toBe(3);
	});

	it("表示順は配列の **反転** (上=前面=末尾、下=背面=先頭)", () => {
		seedSlide([
			makeImageLayer(1, "first", "img-1"), // 配列先頭 = 背面 → リスト下
			makeImageLayer(2, "mid", "img-2"),
			makeImageLayer(3, "last", "img-3"), // 配列末尾 = 前面 → リスト上
		]);
		render();
		const rows = container.querySelectorAll<HTMLElement>("[data-layer-uuid]");
		// 上から: last → mid → first
		expect(rows[0].getAttribute("data-layer-uuid")).toBe("last");
		expect(rows[1].getAttribute("data-layer-uuid")).toBe("mid");
		expect(rows[2].getAttribute("data-layer-uuid")).toBe("first");
	});

	it("text layer は内容スニペットを表示 (20 char 超は …)", () => {
		seedSlide([
			makeTextLayer(1, "short", "hi"),
			makeTextLayer(2, "long", "this is a long text more than twenty characters"),
		]);
		render();
		expect(container.textContent).toContain('"hi"');
		// 20 char + ellipsis
		expect(container.textContent).toContain('"this is a long text …"');
	});

	it("non-visible / locked / shared インジケータを行内に表示", () => {
		seedSlide([
			makeImageLayer(1, "a", "img-1", { visible: false }),
			makeImageLayer(2, "b", "img-2", { locked: true }),
			makeImageLayer(3, "c", "img-3", { shared: true }),
		]);
		render();
		expect(container.querySelector("[data-indicator='hidden']")).not.toBeNull();
		expect(container.querySelector("[data-indicator='locked']")).not.toBeNull();
		expect(container.querySelector("[data-indicator='shared']")).not.toBeNull();
	});

	it("行クリックで setSelectedLayer が呼ばれる", () => {
		const target = makeImageLayer(2, "b", "img-2");
		seedSlide([makeImageLayer(1, "a", "img-1"), target]);
		render();

		const row = container.querySelector<HTMLElement>("[data-layer-uuid='b']");
		act(() => {
			row?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
		});

		expect(useLayerStore.getState().selectedLayer?.uuid).toBe("b");
	});

	it("選択 layer の行に data-selected='true' + ハイライト", () => {
		const target = makeImageLayer(2, "b", "img-2");
		seedSlide([makeImageLayer(1, "a", "img-1"), target]);
		useLayerStore.getState().setSelectedLayer(target);
		render();

		const rowB = container.querySelector<HTMLElement>("[data-layer-uuid='b']");
		const rowA = container.querySelector<HTMLElement>("[data-layer-uuid='a']");
		expect(rowB?.getAttribute("data-selected")).toBe("true");
		expect(rowA?.getAttribute("data-selected")).toBe("false");
	});

	it("status text に layers 件数 + 選択中ラベル", () => {
		const target = makeImageLayer(2, "b", "img-bbbb");
		seedSlide([makeImageLayer(1, "a", "img-aaaa"), target]);
		useLayerStore.getState().setSelectedLayer(target);
		render();
		expect(container.textContent).toContain("2 layers");
		expect(container.textContent).toContain("selected:");
		expect(container.textContent).toContain("#2");
	});
});
