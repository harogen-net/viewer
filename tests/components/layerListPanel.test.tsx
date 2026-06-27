import { MantineProvider } from "@mantine/core";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { LayerListPanel } from "../../src/components/panels/LayerListPanel";
import { useHistoryStore } from "../../src/state/historyStore";
import { useLayerStore } from "../../src/state/layerStore";
import { useSlideStore } from "../../src/state/slideStore";
import type { ImageLayer, Layer, TextLayer } from "../../src/types/Layer";
import type { Slide } from "../../src/types/Slide";

// v4 Group D D-5: LayerListPanel の表示 + 選択テスト。
// 順序変更 (bring-to-front / bring-forward / send-backward / send-to-back) は
// ui微修正で EditOpsPanel から本パネルへ移設されたため、当該 mutation テストも本ファイルに集約。
// visible/locked toggle / 削除 などの mutation は別パネル (EditOpsPanel) 側で扱う。

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
const makeImageLayer = (
	id: number,
	uuid: string,
	imageId: string,
	overrides: Partial<ImageLayer> = {}
): ImageLayer => ({
	...baseLayerProps(id, uuid, overrides),
	type: "image",
	imageId,
	clipRect: [0, 0, 0, 0],
	isText: false,
	...overrides,
});
const makeTextLayer = (
	id: number,
	uuid: string,
	text: string,
	overrides: Partial<TextLayer> = {}
): TextLayer => ({
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
	useHistoryStore.getState().clear();
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
			</MantineProvider>
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

	it("各行に visible/locked/shared トグルを描画し、状態を data-on に反映 (D-19)", () => {
		seedSlide([
			makeImageLayer(1, "a", "img-1", { visible: false, locked: true, shared: true }),
			makeImageLayer(2, "b", "img-2"), // すべて既定 (visible=true/locked=false/shared=false)
		]);
		render();
		const rowA = container.querySelector<HTMLElement>("[data-layer-uuid='a']");
		const rowB = container.querySelector<HTMLElement>("[data-layer-uuid='b']");
		// トグルは常に存在 (インジケータ表示のみではなく操作可能)
		expect(rowA?.querySelector("[data-toggle='visible']")?.getAttribute("data-on")).toBe("false");
		expect(rowA?.querySelector("[data-toggle='locked']")?.getAttribute("data-on")).toBe("true");
		expect(rowA?.querySelector("[data-toggle='shared']")?.getAttribute("data-on")).toBe("true");
		expect(rowB?.querySelector("[data-toggle='visible']")?.getAttribute("data-on")).toBe("true");
		expect(rowB?.querySelector("[data-toggle='locked']")?.getAttribute("data-on")).toBe("false");
		expect(rowB?.querySelector("[data-toggle='shared']")?.getAttribute("data-on")).toBe("false");
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

	it("ロック済みレイヤーの行クリックでは選択されない", () => {
		seedSlide([makeImageLayer(1, "a", "img-1"), makeImageLayer(2, "b", "img-2", { locked: true })]);
		render();
		const lockedRow = container.querySelector<HTMLElement>("[data-layer-uuid='b']");
		act(() => {
			lockedRow?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
		});
		// locked は選択対象外 → 選択は変わらない (null のまま)
		expect(useLayerStore.getState().selectedLayer).toBeNull();
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

	// (status text 表示は UI 調整で撤去されたためテスト削除)
});

// 順序変更 (ui微修正で EditOpsPanel → LayerListPanel に移設)。
// ボタンは選択 layer の slide 内 index に対して bring/send mutation を発火する。
describe("LayerListPanel 順序変更 (reorder ops)", () => {
	const selectLayer = (uuid: string): void => {
		const slide = useSlideStore.getState().slides[0];
		const layer = slide.layers.find((l) => l.uuid === uuid) ?? null;
		act(() => {
			useLayerStore.getState().setSelectedLayer(layer);
		});
	};

	const clickByOp = (op: string): void => {
		const btn = container.querySelector<HTMLButtonElement>(`[data-edit-op="${op}"]`);
		if (!btn) throw new Error(`button not found: ${op}`);
		act(() => {
			btn.click();
		});
	};

	const order = (): string[] => useSlideStore.getState().slides[0].layers.map((l) => l.uuid);

	it("選択 layer なしでは順序変更ボタンが disabled", () => {
		seedSlide([makeImageLayer(1, "u-1", "img-1"), makeImageLayer(2, "u-2", "img-2")]);
		render();
		for (const op of ["bring-to-front", "bring-forward", "send-backward", "send-to-back"]) {
			expect(container.querySelector<HTMLButtonElement>(`[data-edit-op="${op}"]`)?.disabled).toBe(
				true
			);
		}
	});

	it("選択 layer ありで順序変更ボタンが有効化される", () => {
		seedSlide([makeImageLayer(1, "u-1", "img-1"), makeImageLayer(2, "u-2", "img-2")]);
		render();
		selectLayer("u-1");
		for (const op of ["bring-to-front", "bring-forward", "send-backward", "send-to-back"]) {
			expect(container.querySelector<HTMLButtonElement>(`[data-edit-op="${op}"]`)?.disabled).toBe(
				false
			);
		}
	});

	it("locked layer は順序変更ボタンが disabled", () => {
		seedSlide([makeImageLayer(1, "u-1", "img-1", { locked: true })]);
		render();
		selectLayer("u-1");
		expect(
			container.querySelector<HTMLButtonElement>('[data-edit-op="bring-to-front"]')?.disabled
		).toBe(true);
	});

	it("bring-forward ボタンで layer 順序が 1 段上がり、履歴 1 件", () => {
		seedSlide([
			makeImageLayer(1, "u-1", "img-1"),
			makeImageLayer(2, "u-2", "img-2"),
			makeImageLayer(3, "u-3", "img-3"),
		]);
		render();
		selectLayer("u-1");
		clickByOp("bring-forward");
		expect(order()).toEqual(["u-2", "u-1", "u-3"]);
		expect(useHistoryStore.getState().past.length).toBe(1);
	});

	it("bring-to-front ボタンで layer が最後尾 (前面) に移動", () => {
		seedSlide([
			makeImageLayer(1, "u-1", "img-1"),
			makeImageLayer(2, "u-2", "img-2"),
			makeImageLayer(3, "u-3", "img-3"),
		]);
		render();
		selectLayer("u-1");
		clickByOp("bring-to-front");
		expect(order()).toEqual(["u-2", "u-3", "u-1"]);
	});

	it("send-backward ボタンで layer が 1 段下がる", () => {
		seedSlide([
			makeImageLayer(1, "u-1", "img-1"),
			makeImageLayer(2, "u-2", "img-2"),
			makeImageLayer(3, "u-3", "img-3"),
		]);
		render();
		selectLayer("u-3");
		clickByOp("send-backward");
		expect(order()).toEqual(["u-1", "u-3", "u-2"]);
	});

	it("send-to-back ボタンで layer が先頭 (背面) に移動", () => {
		seedSlide([
			makeImageLayer(1, "u-1", "img-1"),
			makeImageLayer(2, "u-2", "img-2"),
			makeImageLayer(3, "u-3", "img-3"),
		]);
		render();
		selectLayer("u-3");
		clickByOp("send-to-back");
		expect(order()).toEqual(["u-3", "u-1", "u-2"]);
	});
});

// visible / locked / shared 行内トグル (v4 Group D D-19、§7「レイヤー可視/ロック (UI 経由)」+ shared)。
describe("LayerListPanel 行内トグル (v4 Group D D-19)", () => {
	const clickToggle = (uuid: string, toggle: "visible" | "locked" | "shared"): void => {
		const btn = container.querySelector<HTMLButtonElement>(
			`[data-layer-uuid='${uuid}'] [data-toggle='${toggle}']`
		);
		if (!btn) throw new Error(`toggle not found: ${uuid}/${toggle}`);
		act(() => {
			btn.dispatchEvent(new MouseEvent("click", { bubbles: true }));
		});
	};

	it("visible トグルで slide の layer.visible が反転し履歴 1 件", () => {
		seedSlide([makeImageLayer(1, "a", "img-1")]);
		render();
		clickToggle("a", "visible");
		expect(useSlideStore.getState().slides[0].layers[0].visible).toBe(false);
		expect(useHistoryStore.getState().past.length).toBe(1);
	});

	it("locked トグルは locked 層でも操作でき、解除できる", () => {
		seedSlide([makeImageLayer(1, "a", "img-1", { locked: true })]);
		render();
		clickToggle("a", "locked");
		expect(useSlideStore.getState().slides[0].layers[0].locked).toBe(false);
	});

	it("選択中レイヤーをロックすると選択が解除される", () => {
		const target = makeImageLayer(1, "a", "img-1");
		seedSlide([target]);
		useLayerStore.getState().setSelectedLayer(target);
		render();
		clickToggle("a", "locked");
		expect(useSlideStore.getState().slides[0].layers[0].locked).toBe(true);
		expect(useLayerStore.getState().selectedLayer).toBeNull();
	});

	it("shared トグルで shared が反転 (兄弟連鎖は起きない = shared は同期対象外)", () => {
		seedSlide([makeImageLayer(1, "a", "img-1")]);
		render();
		clickToggle("a", "shared");
		expect(useSlideStore.getState().slides[0].layers[0].shared).toBe(true);
	});

	it("トグルクリックでは行選択 (setSelectedLayer) は起きない (stopPropagation)", () => {
		seedSlide([makeImageLayer(1, "a", "img-1"), makeImageLayer(2, "b", "img-2")]);
		render();
		clickToggle("b", "visible");
		// 選択は変わらない (toggle は stopPropagation)
		expect(useLayerStore.getState().selectedLayer).toBeNull();
	});

	it("shared 層の visible トグルは連続隣接スライドの兄弟へ伝播", () => {
		// 2 slide に同 imageId + shared=true。slide 0 を選択中。
		useSlideStore.getState().setSlides([
			{
				id: 1,
				uuid: "s0",
				width: 800,
				height: 600,
				durationRatio: 1,
				joining: true,
				disabled: false,
				layers: [makeImageLayer(1, "a", "S", { shared: true })],
			},
			{
				id: 2,
				uuid: "s1",
				width: 800,
				height: 600,
				durationRatio: 1,
				joining: true,
				disabled: false,
				layers: [makeImageLayer(2, "b", "S", { shared: true })],
			},
		]);
		useSlideStore.getState().setSelectedIndex(0);
		render();
		clickToggle("a", "visible");
		expect(useSlideStore.getState().slides[0].layers[0].visible).toBe(false);
		expect(useSlideStore.getState().slides[1].layers[0].visible).toBe(false); // 兄弟へ伝播
	});
});

describe("LayerListPanel D&D 並べ替え", () => {
	it("各行が data-sortable-layer 付きで反転表示順に描画される", () => {
		seedSlide([
			makeImageLayer(1, "first", "img-1"), // 背面 → 下
			makeImageLayer(2, "mid", "img-2"),
			makeImageLayer(3, "last", "img-3"), // 前面 → 上
		]);
		render();
		const sortables = container.querySelectorAll<HTMLElement>("[data-sortable-layer]");
		expect(sortables.length).toBe(3);
		// 表示は反転: last → mid → first
		expect(sortables[0].getAttribute("data-sortable-layer")).toBe("last");
		expect(sortables[1].getAttribute("data-sortable-layer")).toBe("mid");
		expect(sortables[2].getAttribute("data-sortable-layer")).toBe("first");
	});
});

describe("LayerListPanel 行削除ボタン (レガシ寄せ)", () => {
	it("行の削除ボタンで該当レイヤーが slide から削除される", () => {
		seedSlide([makeImageLayer(1, "a", "img-1"), makeImageLayer(2, "b", "img-2")]);
		render();
		const delBtn = container.querySelector<HTMLButtonElement>(
			"[data-layer-uuid='a'] [data-toggle='delete']"
		);
		expect(delBtn).not.toBeNull();
		act(() => {
			delBtn?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
		});
		const layers = useSlideStore.getState().slides[0].layers;
		expect(layers.map((l) => l.uuid)).toEqual(["b"]);
	});

	it("削除ボタンクリックでは行選択 (setSelectedLayer) は起きない (stopPropagation)", () => {
		seedSlide([makeImageLayer(1, "a", "img-1"), makeImageLayer(2, "b", "img-2")]);
		useLayerStore.getState().setSelectedLayer(null);
		render();
		const delBtn = container.querySelector<HTMLButtonElement>(
			"[data-layer-uuid='b'] [data-toggle='delete']"
		);
		act(() => {
			delBtn?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
		});
		// b が消え、選択は変わらず (null のまま)
		expect(useSlideStore.getState().slides[0].layers.map((l) => l.uuid)).toEqual(["a"]);
		expect(useLayerStore.getState().selectedLayer).toBeNull();
	});
});
