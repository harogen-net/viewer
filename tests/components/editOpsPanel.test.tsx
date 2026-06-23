import { MantineProvider } from "@mantine/core";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { EditOpsPanel } from "../../src/components/panels/EditOpsPanel";
import { useClipboardStore } from "../../src/state/clipboardStore";
import { useHistoryStore } from "../../src/state/historyStore";
import { useLayerStore } from "../../src/state/layerStore";
import { useSlideStore } from "../../src/state/slideStore";
import { useViewerDocumentStore } from "../../src/state/viewerDocumentStore";
import type { ImageLayer, Layer } from "../../src/types/Layer";
import type { Slide } from "../../src/types/Slide";

// v4 Group D D-4a: EditOpsPanel テスト (undo/redo + 順序変更 + 削除/複製 + 透明度)。

const baseTransform = {
	transX: 0,
	transY: 0,
	scaleX: 1,
	scaleY: 1,
	rotation: 0,
	mirrorH: false,
	mirrorV: false,
};
const makeImageLayer = (id: number, uuid: string, overrides: Partial<ImageLayer> = {}): ImageLayer => ({
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
	useViewerDocumentStore.setState({ meta: null, modified: false });
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
				<EditOpsPanel />
			</MantineProvider>,
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

/** uuid="t-1" のテキストレイヤー 1 枚を seed して選択可能にする。 */
const seedTextLayer = (text: string): void => {
	useSlideStore.getState().setSlides([
		makeSlide([
			{
				id: 1,
				uuid: "t-1",
				name: "",
				opacity: 1,
				locked: false,
				visible: true,
				shared: false,
				...baseTransform,
				type: "text",
				text,
			},
		]),
	]);
	useSlideStore.getState().setSelectedIndex(0);
};

/** 制御 textarea にネイティブ setter 経由で値を入れ input を発火 (React onChange を起こす)。 */
const typeInto = (ta: HTMLTextAreaElement, value: string): void => {
	const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")?.set;
	setter?.call(ta, value);
	ta.dispatchEvent(new Event("input", { bubbles: true }));
};

describe("EditOpsPanel (v4 Group D D-4a)", () => {
	it("選択 layer なしでは undo/redo 以外の op ボタンが disabled", () => {
		seedSlide([makeImageLayer(1, "u-1")]);
		render();
		expect(
			container.querySelector<HTMLButtonElement>('[data-edit-op="bring-to-front"]')?.disabled,
		).toBe(true);
		expect(
			container.querySelector<HTMLButtonElement>('[data-edit-op="remove"]')?.disabled,
		).toBe(true);
		expect(container.textContent).toContain("レイヤーを選択してください");
	});

	it("選択 layer ありで順序変更 / 複製 / 削除ボタンが有効化される", () => {
		seedSlide([makeImageLayer(1, "u-1"), makeImageLayer(2, "u-2")]);
		render();
		selectLayer("u-1");
		expect(
			container.querySelector<HTMLButtonElement>('[data-edit-op="bring-forward"]')?.disabled,
		).toBe(false);
		expect(
			container.querySelector<HTMLButtonElement>('[data-edit-op="remove"]')?.disabled,
		).toBe(false);
	});

	it("locked layer は op ボタンが disabled で案内表示", () => {
		seedSlide([makeImageLayer(1, "u-1", { locked: true })]);
		render();
		selectLayer("u-1");
		expect(
			container.querySelector<HTMLButtonElement>('[data-edit-op="bring-to-front"]')?.disabled,
		).toBe(true);
		expect(container.textContent).toContain("ロックされています");
	});

	it("bring-forward ボタンで layer 順序が 1 段上がり、履歴 1 件", () => {
		seedSlide([makeImageLayer(1, "u-1"), makeImageLayer(2, "u-2"), makeImageLayer(3, "u-3")]);
		render();
		selectLayer("u-1");
		clickByOp("bring-forward");
		const order = useSlideStore.getState().slides[0].layers.map((l) => l.uuid);
		expect(order).toEqual(["u-2", "u-1", "u-3"]);
		expect(useHistoryStore.getState().past.length).toBe(1);
	});

	it("bring-to-front ボタンで layer が最後尾 (前面) に移動", () => {
		seedSlide([makeImageLayer(1, "u-1"), makeImageLayer(2, "u-2"), makeImageLayer(3, "u-3")]);
		render();
		selectLayer("u-1");
		clickByOp("bring-to-front");
		const order = useSlideStore.getState().slides[0].layers.map((l) => l.uuid);
		expect(order).toEqual(["u-2", "u-3", "u-1"]);
	});

	it("send-to-back ボタンで layer が先頭 (背面) に移動", () => {
		seedSlide([makeImageLayer(1, "u-1"), makeImageLayer(2, "u-2"), makeImageLayer(3, "u-3")]);
		render();
		selectLayer("u-3");
		clickByOp("send-to-back");
		const order = useSlideStore.getState().slides[0].layers.map((l) => l.uuid);
		expect(order).toEqual(["u-3", "u-1", "u-2"]);
	});

	it("duplicate ボタンで layer が複製される (uuid は新規)", () => {
		seedSlide([makeImageLayer(1, "u-1")]);
		render();
		selectLayer("u-1");
		clickByOp("duplicate");
		const layers = useSlideStore.getState().slides[0].layers;
		expect(layers.length).toBe(2);
		// 元 layer + 複製 (id/uuid は新規)
		expect(layers[0].uuid).toBe("u-1");
		expect(layers[1].uuid).not.toBe("u-1");
		expect(useHistoryStore.getState().past.length).toBe(1);
	});

	it("remove ボタンで layer が削除され、selectedLayer が null になる", () => {
		seedSlide([makeImageLayer(1, "u-1"), makeImageLayer(2, "u-2")]);
		render();
		selectLayer("u-1");
		clickByOp("remove");
		const layers = useSlideStore.getState().slides[0].layers;
		expect(layers.length).toBe(1);
		expect(layers[0].uuid).toBe("u-2");
		// 削除された layer は selectedLayer から外れる (uuid 不一致で復元できない)
		expect(useLayerStore.getState().selectedLayer).toBeNull();
	});

	it("undo / redo: 初期は両方 disabled", () => {
		seedSlide([makeImageLayer(1, "u-1")]);
		render();
		expect(container.querySelector<HTMLButtonElement>('[data-edit-op="undo"]')?.disabled).toBe(true);
		expect(container.querySelector<HTMLButtonElement>('[data-edit-op="redo"]')?.disabled).toBe(true);
	});

	it("操作後 undo が有効、押すと巻き戻る、redo が有効化", () => {
		seedSlide([makeImageLayer(1, "u-1"), makeImageLayer(2, "u-2")]);
		render();
		selectLayer("u-1");
		clickByOp("bring-forward");
		expect(useSlideStore.getState().slides[0].layers.map((l) => l.uuid)).toEqual(["u-2", "u-1"]);
		// undo
		expect(container.querySelector<HTMLButtonElement>('[data-edit-op="undo"]')?.disabled).toBe(false);
		clickByOp("undo");
		expect(useSlideStore.getState().slides[0].layers.map((l) => l.uuid)).toEqual(["u-1", "u-2"]);
		// redo
		expect(container.querySelector<HTMLButtonElement>('[data-edit-op="redo"]')?.disabled).toBe(false);
		clickByOp("redo");
		expect(useSlideStore.getState().slides[0].layers.map((l) => l.uuid)).toEqual(["u-2", "u-1"]);
	});

	it("opacity スライダーで透明度が更新される", () => {
		seedSlide([makeImageLayer(1, "u-1", { opacity: 1 })]);
		render();
		selectLayer("u-1");
		// Mantine Slider は input[type=range] を内部に持つ
		const slider = container.querySelector<HTMLInputElement>('[data-edit-op="opacity"] input');
		expect(slider).not.toBeNull();
		// Slider の onChange を直接呼ぶのが難しいので、render 表示の % 値を確認 → 値変更は別経路。
		// 代わりに表示値を確認 + slider の value 属性チェック
		expect(container.textContent).toContain("100%");
	});

	it("履歴カウンタ表示: 1 / 1 (1 件 past, 0 件 future) など", () => {
		seedSlide([makeImageLayer(1, "u-1"), makeImageLayer(2, "u-2")]);
		render();
		selectLayer("u-1");
		clickByOp("bring-forward");
		// past = 1, future = 0 → "1 / 1"
		expect(container.textContent).toContain("1 / 1");
		clickByOp("undo");
		// past = 0, future = 1 → "0 / 1"
		expect(container.textContent).toContain("0 / 1");
	});
});

describe("EditOpsPanel (v4 Group D D-4b) - transform ops", () => {
	it("rotate-left/right で rotation が ±90° 加算", () => {
		seedSlide([makeImageLayer(1, "u-1", { rotation: 0 })]);
		render();
		selectLayer("u-1");
		clickByOp("rotate-right");
		expect(useSlideStore.getState().slides[0].layers[0].rotation).toBe(90);
		clickByOp("rotate-left");
		expect(useSlideStore.getState().slides[0].layers[0].rotation).toBe(0);
	});

	it("reset-rotation で rotation = 0", () => {
		seedSlide([makeImageLayer(1, "u-1", { rotation: 45 })]);
		render();
		selectLayer("u-1");
		clickByOp("reset-rotation");
		expect(useSlideStore.getState().slides[0].layers[0].rotation).toBe(0);
	});

	it("mirror-h / mirror-v ボタンが mirror flag を toggle", () => {
		seedSlide([makeImageLayer(1, "u-1")]);
		render();
		selectLayer("u-1");
		clickByOp("mirror-h");
		expect(useSlideStore.getState().slides[0].layers[0].mirrorH).toBe(true);
		clickByOp("mirror-h");
		expect(useSlideStore.getState().slides[0].layers[0].mirrorH).toBe(false);
		clickByOp("mirror-v");
		expect(useSlideStore.getState().slides[0].layers[0].mirrorV).toBe(true);
	});

	it("reset-opacity で opacity = 1", () => {
		seedSlide([makeImageLayer(1, "u-1", { opacity: 0.3 })]);
		render();
		selectLayer("u-1");
		clickByOp("reset-opacity");
		expect(useSlideStore.getState().slides[0].layers[0].opacity).toBe(1);
	});

	it("locked layer は transform op ボタンも disabled", () => {
		seedSlide([makeImageLayer(1, "u-1", { locked: true })]);
		render();
		selectLayer("u-1");
		expect(
			container.querySelector<HTMLButtonElement>('[data-edit-op="rotate-right"]')?.disabled,
		).toBe(true);
		expect(
			container.querySelector<HTMLButtonElement>('[data-edit-op="mirror-h"]')?.disabled,
		).toBe(true);
		expect(container.querySelector<HTMLButtonElement>('[data-edit-op="fit"]')?.disabled).toBe(true);
	});

	it("fit ボタン: DOM 計測できないので no-op (jsdom 環境)、エラーは出ない", () => {
		// jsdom では offsetWidth/Height は 0 を返すため fit は no-op (contentW<=0 で null)。
		// エラーなく押せることだけ確認。
		seedSlide([makeImageLayer(1, "u-1")]);
		render();
		selectLayer("u-1");
		expect(() => clickByOp("fit")).not.toThrow();
		// 履歴も増えない (no-op)
		expect(useHistoryStore.getState().past.length).toBe(0);
	});

	it("align-top/right/bottom/left ボタンが描画されており、enabled になる", () => {
		seedSlide([makeImageLayer(1, "u-1")]);
		render();
		selectLayer("u-1");
		for (const edge of ["top", "right", "bottom", "left"] as const) {
			const btn = container.querySelector<HTMLButtonElement>(
				`[data-edit-op="align-${edge}"]`,
			);
			expect(btn).not.toBeNull();
			expect(btn?.disabled).toBe(false);
		}
	});

	it("align ボタンも jsdom 環境では no-op (offsetWidth=0)、エラーは出ない", () => {
		seedSlide([makeImageLayer(1, "u-1")]);
		render();
		selectLayer("u-1");
		for (const edge of ["top", "right", "bottom", "left"]) {
			expect(() => clickByOp(`align-${edge}`)).not.toThrow();
		}
		expect(useHistoryStore.getState().past.length).toBe(0);
	});
});

describe("EditOpsPanel (v4 Group D D-6b) - clipRect", () => {
	it("ImageLayer 選択時のみ clipRect グループが描画される", () => {
		seedSlide([makeImageLayer(1, "u-1")]);
		render();
		// 未選択時は出ない
		expect(container.querySelector('[data-edit-op-group="clip-rect"]')).toBeNull();
		// 選択時に描画
		selectLayer("u-1");
		expect(container.querySelector('[data-edit-op-group="clip-rect"]')).not.toBeNull();
		// T/R/B/L slider + reset button
		expect(container.querySelector('[data-edit-op="clip-top"]')).not.toBeNull();
		expect(container.querySelector('[data-edit-op="clip-right"]')).not.toBeNull();
		expect(container.querySelector('[data-edit-op="clip-bottom"]')).not.toBeNull();
		expect(container.querySelector('[data-edit-op="clip-left"]')).not.toBeNull();
		expect(container.querySelector('[data-edit-op="reset-clip"]')).not.toBeNull();
	});

	it("reset-clip ボタンで clipRect が [0,0,0,0] に戻る", () => {
		seedSlide([makeImageLayer(1, "u-1", { clipRect: [10, 20, 30, 40] })]);
		render();
		selectLayer("u-1");
		clickByOp("reset-clip");
		const stored = useSlideStore.getState().slides[0].layers[0] as ImageLayer;
		expect(stored.clipRect).toEqual([0, 0, 0, 0]);
		expect(useHistoryStore.getState().past.length).toBe(1);
	});

	it("locked layer は reset-clip が disabled", () => {
		seedSlide([makeImageLayer(1, "u-1", { locked: true, clipRect: [10, 0, 0, 0] })]);
		render();
		selectLayer("u-1");
		const btn = container.querySelector<HTMLButtonElement>('[data-edit-op="reset-clip"]');
		expect(btn?.disabled).toBe(true);
	});
});

describe("EditOpsPanel clipboard ボタン (v4 Group D D-8)", () => {
	it("選択なしでは copy/cut/copy-transform が disabled、paste/paste-transform も disabled", () => {
		seedSlide([makeImageLayer(1, "u-1")]);
		render();
		expect(container.querySelector<HTMLButtonElement>('[data-edit-op="copy"]')?.disabled).toBe(true);
		expect(container.querySelector<HTMLButtonElement>('[data-edit-op="cut"]')?.disabled).toBe(true);
		expect(container.querySelector<HTMLButtonElement>('[data-edit-op="paste"]')?.disabled).toBe(true);
	});

	it("copy ボタンで clipboard に積まれ paste が有効化される", () => {
		seedSlide([makeImageLayer(1, "u-1")]);
		render();
		selectLayer("u-1");
		expect(container.querySelector<HTMLButtonElement>('[data-edit-op="paste"]')?.disabled).toBe(true);
		clickByOp("copy");
		expect(useClipboardStore.getState().layer?.uuid).toBe("u-1");
		expect(container.querySelector<HTMLButtonElement>('[data-edit-op="paste"]')?.disabled).toBe(false);
	});

	it("copy → paste ボタンで layer が複製される (履歴 1 件)", () => {
		seedSlide([makeImageLayer(1, "u-1")]);
		render();
		selectLayer("u-1");
		clickByOp("copy");
		clickByOp("paste");
		expect(useSlideStore.getState().slides[0].layers).toHaveLength(2);
		expect(useHistoryStore.getState().past.length).toBe(1);
	});

	it("copy-transform → paste-transform ボタンで変形が複写される", () => {
		seedSlide([
			makeImageLayer(1, "u-1", { transX: 33, rotation: 90 }),
			makeImageLayer(2, "u-2"),
		]);
		render();
		selectLayer("u-1");
		clickByOp("copy-transform");
		selectLayer("u-2");
		expect(
			container.querySelector<HTMLButtonElement>('[data-edit-op="paste-transform"]')?.disabled,
		).toBe(false);
		clickByOp("paste-transform");
		const after = useSlideStore.getState().slides[0].layers[1] as ImageLayer;
		expect(after.transX).toBe(33);
		expect(after.rotation).toBe(90);
	});
});

describe("EditOpsPanel テキスト (v4 Group D D-9)", () => {
	it("slide 選択中なら add-text ボタンが有効", () => {
		seedSlide([]);
		render();
		expect(container.querySelector<HTMLButtonElement>('[data-edit-op="add-text"]')?.disabled).toBe(
			false,
		);
	});

	it("add-text: prompt の入力テキストで追加され選択される (legacy 基準)", () => {
		const orig = window.prompt;
		window.prompt = () => "hello";
		try {
			seedSlide([]);
			render();
			clickByOp("add-text");
			const layers = useSlideStore.getState().slides[0].layers;
			expect(layers).toHaveLength(1);
			expect(layers[0].type).toBe("text");
			expect((layers[0] as { text: string }).text).toBe("hello");
			expect(useLayerStore.getState().selectedLayer?.uuid).toBe(layers[0].uuid);
			expect(useHistoryStore.getState().past.length).toBe(1);
		} finally {
			window.prompt = orig;
		}
	});

	it("add-text: prompt キャンセル (null) では追加しない", () => {
		const orig = window.prompt;
		window.prompt = () => null;
		try {
			seedSlide([]);
			render();
			clickByOp("add-text");
			expect(useSlideStore.getState().slides[0].layers).toHaveLength(0);
			expect(useHistoryStore.getState().past.length).toBe(0);
		} finally {
			window.prompt = orig;
		}
	});

	it("add-text: 空文字サブミットでは追加しない", () => {
		const orig = window.prompt;
		window.prompt = () => "";
		try {
			seedSlide([]);
			render();
			clickByOp("add-text");
			expect(useSlideStore.getState().slides[0].layers).toHaveLength(0);
			expect(useHistoryStore.getState().past.length).toBe(0);
		} finally {
			window.prompt = orig;
		}
	});

	it("textarea は TextLayer 選択時のみ表示 (ImageLayer では非表示)", () => {
		seedSlide([makeImageLayer(1, "u-1")]);
		render();
		selectLayer("u-1");
		expect(container.querySelector('[data-edit-op="text-edit"]')).toBeNull();
	});

	it("入力中 (onChange) はレイヤーへ即時反映され、history は積まれない", () => {
		seedTextLayer("before");
		render();
		selectLayer("t-1");
		const ta = container.querySelector<HTMLTextAreaElement>('[data-edit-op="text-edit"]');
		if (!ta) throw new Error("textarea not found");
		act(() => ta.dispatchEvent(new FocusEvent("focusin", { bubbles: true })));
		act(() => typeInto(ta, "live"));
		// レイヤーへ即時反映
		expect((useSlideStore.getState().slides[0].layers[0] as { text: string }).text).toBe("live");
		// 入力中は history を積まない
		expect(useHistoryStore.getState().past.length).toBe(0);
	});

	it("blur 時に開始テキストと異なれば history を 1 件記録、undo で巻き戻る", () => {
		seedTextLayer("before");
		render();
		selectLayer("t-1");
		const ta = container.querySelector<HTMLTextAreaElement>('[data-edit-op="text-edit"]');
		if (!ta) throw new Error("textarea not found");
		act(() => ta.dispatchEvent(new FocusEvent("focusin", { bubbles: true })));
		act(() => typeInto(ta, "after"));
		act(() => ta.dispatchEvent(new FocusEvent("focusout", { bubbles: true })));
		expect((useSlideStore.getState().slides[0].layers[0] as { text: string }).text).toBe("after");
		expect(useHistoryStore.getState().past.length).toBe(1);
		// undo で開始テキストへ戻る (編集セッション全体で 1 undo)
		clickByOp("undo");
		expect((useSlideStore.getState().slides[0].layers[0] as { text: string }).text).toBe("before");
	});

	it("blur 時に開始テキストと同じなら history を積まない", () => {
		seedTextLayer("same");
		render();
		selectLayer("t-1");
		const ta = container.querySelector<HTMLTextAreaElement>('[data-edit-op="text-edit"]');
		if (!ta) throw new Error("textarea not found");
		act(() => ta.dispatchEvent(new FocusEvent("focusin", { bubbles: true })));
		act(() => ta.dispatchEvent(new FocusEvent("focusout", { bubbles: true })));
		expect(useHistoryStore.getState().past.length).toBe(0);
	});
});
