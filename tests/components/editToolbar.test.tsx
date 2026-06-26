import { MantineProvider } from "@mantine/core";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { EditToolbar } from "../../src/components/panels/EditToolbar";
import { useAlertStore } from "../../src/state/alertStore";
import { useClipboardStore } from "../../src/state/clipboardStore";
import { useEditViewStore } from "../../src/state/editViewStore";
import { useHistoryStore } from "../../src/state/historyStore";
import { useLayerStore } from "../../src/state/layerStore";
import { useSlideStore } from "../../src/state/slideStore";
import { useViewerDocumentStore } from "../../src/state/viewerDocumentStore";
import type { ImageLayer, Layer } from "../../src/types/Layer";
import type { Slide } from "../../src/types/Slide";

// EditOps シェル整理: EditOpsPanel から分離したアプリ一般操作 (undo/redo・テキスト追加・
// rectEdit トグル・汎用 clipboard copy/cut/paste) を EditToolbar で受ける。

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

beforeEach(() => {
	useSlideStore.getState().setSlides([]);
	useLayerStore.getState().setLayers([]);
	useLayerStore.getState().setSelectedLayer(null);
	useHistoryStore.getState().clear();
	useClipboardStore.getState().clear();
	useEditViewStore.getState().setRectEdit(false);
	useAlertStore.getState().clear();
	useViewerDocumentStore.setState({ meta: null, modified: false });
	container = document.createElement("div");
	document.body.appendChild(container);
	root = createRoot(container);
});

afterEach(() => {
	act(() => root.unmount());
	container.remove();
	useEditViewStore.getState().setRectEdit(false);
});

const render = (): void => {
	act(() => {
		root.render(
			<MantineProvider>
				<EditToolbar />
			</MantineProvider>
		);
	});
};

const seedSlide = (layers: Layer[]): void => {
	useSlideStore.getState().setSlides([makeSlide(layers)]);
	useSlideStore.getState().setSelectedIndex(0);
};

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

// useAlert (モーダル) は非同期。ハンドラが積んだ pending リクエストを store 経由で resolve する。
const resolveAlert = async (value: boolean | string | null): Promise<void> => {
	await act(async () => {
		useAlertStore.getState().request?.resolve(value);
	});
};

describe("EditToolbar undo / redo + 履歴カウンタ", () => {
	it("初期は undo/redo 両方 disabled、カウンタ 0 / 0", () => {
		seedSlide([]);
		render();
		expect(container.querySelector<HTMLButtonElement>('[data-edit-op="undo"]')?.disabled).toBe(
			true
		);
		expect(container.querySelector<HTMLButtonElement>('[data-edit-op="redo"]')?.disabled).toBe(
			true
		);
		expect(container.textContent).toContain("0 / 0");
	});

	it("操作後 undo 有効 → 巻き戻し → redo 有効化 (add-text を履歴源に使用)", async () => {
		seedSlide([]);
		render();
		clickByOp("add-text");
		await resolveAlert("hi");
		expect(useSlideStore.getState().slides[0].layers).toHaveLength(1);
		expect(container.textContent).toContain("1 / 1"); // past=1, future=0
		// undo
		expect(container.querySelector<HTMLButtonElement>('[data-edit-op="undo"]')?.disabled).toBe(
			false
		);
		clickByOp("undo");
		expect(useSlideStore.getState().slides[0].layers).toHaveLength(0);
		expect(container.textContent).toContain("0 / 1"); // past=0, future=1
		// redo
		expect(container.querySelector<HTMLButtonElement>('[data-edit-op="redo"]')?.disabled).toBe(
			false
		);
		clickByOp("redo");
		expect(useSlideStore.getState().slides[0].layers).toHaveLength(1);
	});
});

describe("EditToolbar add-text (テキストレイヤー追加)", () => {
	it("slide 選択中なら add-text ボタンが有効", () => {
		seedSlide([]);
		render();
		expect(container.querySelector<HTMLButtonElement>('[data-edit-op="add-text"]')?.disabled).toBe(
			false
		);
	});

	it("prompt の入力テキストで追加され選択される、履歴 1 件 (legacy 基準)", async () => {
		seedSlide([]);
		render();
		clickByOp("add-text"); // handler が alert.prompt を await → リクエスト pending
		await resolveAlert("hello");
		const layers = useSlideStore.getState().slides[0].layers;
		expect(layers).toHaveLength(1);
		expect(layers[0].type).toBe("text");
		expect((layers[0] as { text: string }).text).toBe("hello");
		expect(useLayerStore.getState().selectedLayer?.uuid).toBe(layers[0].uuid);
		expect(useHistoryStore.getState().past.length).toBe(1);
	});

	it("prompt キャンセル (null) / 空文字では追加しない", async () => {
		seedSlide([]);
		render();
		clickByOp("add-text");
		await resolveAlert(null); // キャンセル
		expect(useSlideStore.getState().slides[0].layers).toHaveLength(0);
		clickByOp("add-text");
		await resolveAlert(""); // 空文字サブミット
		expect(useSlideStore.getState().slides[0].layers).toHaveLength(0);
		expect(useHistoryStore.getState().past.length).toBe(0);
	});
});

describe("EditToolbar rectEdit トグル", () => {
	it("トグルで editViewStore.rectEdit が反転し data-active が切替", () => {
		seedSlide([makeImageLayer(1, "u-1")]);
		render();
		const btn = () =>
			container.querySelector<HTMLButtonElement>('[data-edit-op="toggle-rect-edit"]');
		expect(useEditViewStore.getState().rectEdit).toBe(false);
		expect(btn()?.getAttribute("data-active")).toBe("false");
		clickByOp("toggle-rect-edit");
		expect(useEditViewStore.getState().rectEdit).toBe(true);
		expect(btn()?.getAttribute("data-active")).toBe("true");
		clickByOp("toggle-rect-edit");
		expect(useEditViewStore.getState().rectEdit).toBe(false);
	});

	it("選択 layer が無くてもトグルは操作できる (グローバルモード)", () => {
		seedSlide([]);
		render();
		expect(
			container.querySelector<HTMLButtonElement>('[data-edit-op="toggle-rect-edit"]')?.disabled
		).toBeFalsy();
	});
});

describe("EditToolbar 汎用 clipboard (copy / cut / paste)", () => {
	it("選択なしでは copy/cut/paste が disabled", () => {
		seedSlide([makeImageLayer(1, "u-1")]);
		render();
		expect(container.querySelector<HTMLButtonElement>('[data-edit-op="copy"]')?.disabled).toBe(
			true
		);
		expect(container.querySelector<HTMLButtonElement>('[data-edit-op="cut"]')?.disabled).toBe(true);
		expect(container.querySelector<HTMLButtonElement>('[data-edit-op="paste"]')?.disabled).toBe(
			true
		);
	});

	it("copy で clipboard に積まれ paste が有効化される", () => {
		seedSlide([makeImageLayer(1, "u-1")]);
		render();
		selectLayer("u-1");
		expect(container.querySelector<HTMLButtonElement>('[data-edit-op="paste"]')?.disabled).toBe(
			true
		);
		clickByOp("copy");
		expect(useClipboardStore.getState().layer?.uuid).toBe("u-1");
		expect(container.querySelector<HTMLButtonElement>('[data-edit-op="paste"]')?.disabled).toBe(
			false
		);
	});

	it("copy → paste で layer が複製される (履歴 1 件)", () => {
		seedSlide([makeImageLayer(1, "u-1")]);
		render();
		selectLayer("u-1");
		clickByOp("copy");
		clickByOp("paste");
		expect(useSlideStore.getState().slides[0].layers).toHaveLength(2);
		expect(useHistoryStore.getState().past.length).toBe(1);
	});
});

// EditOpsPanel から移設した「数値を伴わない」選択レイヤー操作
// (複製 / 削除 / spread / 回転±90 / フィット / 整列) と slide PNG 出力。
describe("EditToolbar 選択レイヤー操作 (移設)", () => {
	// shared 削除確認用に、2 スライドへ同 imageId + shared を seed。
	const seedSharedTwoSlides = (): void => {
		useSlideStore.getState().setSlides([
			{
				id: 1,
				uuid: "s0",
				width: 1600,
				height: 800,
				durationRatio: 1,
				joining: true,
				disabled: false,
				layers: [makeImageLayer(1, "u-1", { imageId: "S", shared: true })],
			},
			{
				id: 2,
				uuid: "s1",
				width: 1600,
				height: 800,
				durationRatio: 1,
				joining: true,
				disabled: false,
				layers: [makeImageLayer(2, "u-2", { imageId: "S", shared: true })],
			},
		]);
		useSlideStore.getState().setSelectedIndex(0);
	};

	it("選択なしでは複製/削除/回転/フィット/整列/spread が disabled", () => {
		seedSlide([makeImageLayer(1, "u-1")]);
		render();
		for (const op of [
			"duplicate",
			"remove",
			"rotate-left",
			"rotate-right",
			"fit",
			"align-top",
			"spread",
		]) {
			expect(container.querySelector<HTMLButtonElement>(`[data-edit-op="${op}"]`)?.disabled).toBe(
				true
			);
		}
	});

	it("duplicate ボタンで layer が複製される (uuid 新規、履歴 1 件)", () => {
		seedSlide([makeImageLayer(1, "u-1")]);
		render();
		selectLayer("u-1");
		clickByOp("duplicate");
		const layers = useSlideStore.getState().slides[0].layers;
		expect(layers.length).toBe(2);
		expect(layers[0].uuid).toBe("u-1");
		expect(layers[1].uuid).not.toBe("u-1");
		expect(useHistoryStore.getState().past.length).toBe(1);
	});

	it("remove ボタンで layer 削除、selectedLayer が null (非 shared)", () => {
		seedSlide([makeImageLayer(1, "u-1"), makeImageLayer(2, "u-2")]);
		render();
		selectLayer("u-1");
		clickByOp("remove");
		const layers = useSlideStore.getState().slides[0].layers;
		expect(layers.length).toBe(1);
		expect(layers[0].uuid).toBe("u-2");
		expect(useLayerStore.getState().selectedLayer).toBeNull();
	});

	it("rotate-left/right で rotation が ±90° 加算", () => {
		seedSlide([makeImageLayer(1, "u-1", { rotation: 0 })]);
		render();
		selectLayer("u-1");
		clickByOp("rotate-right");
		expect(useSlideStore.getState().slides[0].layers[0].rotation).toBe(90);
		clickByOp("rotate-left");
		expect(useSlideStore.getState().slides[0].layers[0].rotation).toBe(0);
	});

	it("spread: confirm OK で shared 化 + 履歴 1 件", async () => {
		seedSlide([makeImageLayer(1, "u-1")]);
		render();
		selectLayer("u-1");
		clickByOp("spread");
		await resolveAlert(true);
		expect(useSlideStore.getState().slides[0].layers[0].shared).toBe(true);
		expect(useHistoryStore.getState().past.length).toBe(1);
	});

	it("spread: confirm キャンセルでは何もしない", async () => {
		seedSlide([makeImageLayer(1, "u-1")]);
		render();
		selectLayer("u-1");
		clickByOp("spread");
		await resolveAlert(false);
		expect(useSlideStore.getState().slides[0].layers[0].shared).toBe(false);
		expect(useHistoryStore.getState().past.length).toBe(0);
	});

	it("shared 削除: choice 'all' で連鎖削除", async () => {
		seedSharedTwoSlides();
		render();
		selectLayer("u-1");
		clickByOp("remove");
		await resolveAlert("all");
		expect(useSlideStore.getState().slides[0].layers).toHaveLength(0);
		expect(useSlideStore.getState().slides[1].layers).toHaveLength(0);
	});

	it("shared 削除: choice 'single' でこのスライドのみ", async () => {
		seedSharedTwoSlides();
		render();
		selectLayer("u-1");
		clickByOp("remove");
		await resolveAlert("single");
		expect(useSlideStore.getState().slides[0].layers).toHaveLength(0);
		expect(useSlideStore.getState().slides[1].layers).toHaveLength(1);
	});

	it("shared 削除: choice 'cancel' / dismiss(null) では削除しない", async () => {
		seedSharedTwoSlides();
		render();
		selectLayer("u-1");
		clickByOp("remove");
		await resolveAlert("cancel");
		expect(useSlideStore.getState().slides[0].layers).toHaveLength(1);
		clickByOp("remove");
		await resolveAlert(null);
		expect(useSlideStore.getState().slides[0].layers).toHaveLength(1);
		expect(useSlideStore.getState().slides[1].layers).toHaveLength(1);
	});

	it("locked layer は移設 op が disabled", () => {
		seedSlide([makeImageLayer(1, "u-1", { locked: true })]);
		render();
		selectLayer("u-1");
		for (const op of ["duplicate", "rotate-right", "fit", "align-top"]) {
			expect(container.querySelector<HTMLButtonElement>(`[data-edit-op="${op}"]`)?.disabled).toBe(
				true
			);
		}
	});

	it("fit / align は jsdom (offsetWidth=0) で no-op、エラーを投げない", () => {
		seedSlide([makeImageLayer(1, "u-1")]);
		render();
		selectLayer("u-1");
		expect(() => clickByOp("fit")).not.toThrow();
		for (const edge of ["top", "right", "bottom", "left"]) {
			expect(() => clickByOp(`align-${edge}`)).not.toThrow();
		}
		expect(useHistoryStore.getState().past.length).toBe(0);
	});

	it("export-slide-png ボタンが slide 選択時に有効、クリックでエラーを投げない", () => {
		seedSlide([makeImageLayer(1, "u-1")]);
		render();
		const btn = container.querySelector<HTMLButtonElement>('[data-edit-op="export-slide-png"]');
		expect(btn).not.toBeNull();
		expect(btn?.disabled).toBe(false);
		// meta=null (beforeEach) のため handler は早期 return = canvas に触れず no-op。
		expect(() => clickByOp("export-slide-png")).not.toThrow();
	});
});
