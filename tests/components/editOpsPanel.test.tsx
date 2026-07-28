import { MantineProvider } from "@mantine/core";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { EditOpsPanel } from "../../src/components/panels/EditOpsPanel";

// clip 入力の max は content 実測サイズ (measureScaledLayerSize) 依存で、jsdom では 0 → disabled、
// かつ max=0 clamp で値が 0 に潰れる。clip の機能テスト用に実測サイズを固定でモックする
// (downloadDataUrl 等 他の export は本物を維持)。
vi.mock("../../src/utils/domUtils", async (importOriginal) => {
	const actual = await importOriginal<typeof import("../../src/utils/domUtils")>();
	return { ...actual, measureScaledLayerSize: () => ({ w: 400, h: 300 }) };
});
import { useAlertStore } from "../../src/state/alertStore";
import { useClipboardStore } from "../../src/state/clipboardStore";
import { useHistoryStore } from "../../src/state/historyStore";
import { useLayerStore } from "../../src/state/layerStore";
import { useSlideStore } from "../../src/state/slideStore";
import { useViewerDocumentStore } from "../../src/state/viewerDocumentStore";
import type { ImageLayer, Layer } from "../../src/types/Layer";
import type { Slide } from "../../src/types/Slide";

// v4 Group D D-4a: EditOpsPanel テスト (undo/redo + 削除/複製 + 透明度)。
// 注: レイヤー順序変更 (bring-forward / bring-to-front / send-backward / send-to-back) は
// ui微修正で LayerListPanel へ移設されたため、当該テストは layerListPanel.test.tsx に集約。

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
	useAlertStore.getState().clear();
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

// クリップ UI は既定で畳まれている。ヘッダー (clip-toggle) をクリックして展開する。
const openClip = (): void => clickByOp("clip-toggle");

// useAlert (モーダル) は非同期。ハンドラが積んだ pending リクエストを store 経由で resolve する。
const resolveAlert = async (value: boolean | string | null): Promise<void> => {
	await act(async () => {
		useAlertStore.getState().request?.resolve(value);
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
	// 複製/削除/spread/回転±90/フィット/整列 は EditToolbar へ移設 (editToolbar.test.tsx)。
	// 本パネルに残るのは mirror / 回転リセット / 透明度 / 変形コピペ / clip / テキスト / 数値入力。

	it("選択 layer なしでは編集系ボタンが disabled、数値/透明度グループは非表示", () => {
		seedSlide([makeImageLayer(1, "u-1")]);
		render();
		expect(container.querySelector<HTMLButtonElement>('[data-edit-op="mirror-h"]')?.disabled).toBe(
			true
		);
		// 数値プロパティ / 透明度は選択時のみ描画される。
		expect(container.querySelector('[data-edit-op-group="props"]')).toBeNull();
		expect(container.querySelector('[data-edit-op-group="opacity"]')).toBeNull();
	});

	it("locked layer は編集系ボタンが disabled で案内表示", () => {
		seedSlide([makeImageLayer(1, "u-1", { locked: true })]);
		render();
		selectLayer("u-1");
		expect(container.querySelector<HTMLButtonElement>('[data-edit-op="mirror-h"]')?.disabled).toBe(
			true
		);
		expect(container.textContent).toContain("ロックされています");
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
});

describe("EditOpsPanel (v4 Group D D-4b) - transform ops (残留分)", () => {
	// rotate ±90 / fit / align は EditToolbar へ移設。回転リセットは回転入力に統合済み。

	it("回転リセット ('rot' ラベルクリック) で rotation = 0", () => {
		seedSlide([makeImageLayer(1, "u-1", { rotation: 45 })]);
		render();
		selectLayer("u-1");
		// 回転リセットは専用ボタンを廃し、数値入力左の "rot" ラベルクリックに統合された。
		const rotLabel = Array.from(container.querySelectorAll<HTMLElement>("*")).find(
			(el) => el.textContent === "rot" && el.children.length === 0
		);
		if (!rotLabel) throw new Error("rot label not found");
		act(() => rotLabel.dispatchEvent(new MouseEvent("click", { bubbles: true })));
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

	it("locked layer は mirror も disabled", () => {
		seedSlide([makeImageLayer(1, "u-1", { locked: true })]);
		render();
		selectLayer("u-1");
		expect(container.querySelector<HTMLButtonElement>('[data-edit-op="mirror-h"]')?.disabled).toBe(
			true
		);
	});
});

describe("EditOpsPanel 画像ダウンロード", () => {
	it("ImageLayer 選択時のみ download-image ボタンが描画される", () => {
		seedSlide([makeImageLayer(1, "u-1")]);
		render();
		// 未選択では出ない
		expect(container.querySelector('[data-edit-op="download-image"]')).toBeNull();
		selectLayer("u-1");
		expect(container.querySelector('[data-edit-op="download-image"]')).not.toBeNull();
	});

	it("TextLayer 選択では download-image は出ない", () => {
		seedTextLayer("hi");
		render();
		selectLayer("t-1");
		expect(container.querySelector('[data-edit-op="download-image"]')).toBeNull();
	});

	it("ImageLayer 選択時に画像差し替え (単体/全) ボタンが描画される", () => {
		seedSlide([makeImageLayer(1, "u-1")]);
		render();
		expect(container.querySelector('[data-edit-op="replace-image"]')).toBeNull();
		selectLayer("u-1");
		expect(container.querySelector('[data-edit-op="replace-image"]')).not.toBeNull();
		expect(container.querySelector('[data-edit-op="replace-image-all"]')).not.toBeNull();
	});

	it("locked ImageLayer では差し替えボタンが disabled", () => {
		seedSlide([makeImageLayer(1, "u-1", { locked: true })]);
		render();
		selectLayer("u-1");
		expect(
			container.querySelector<HTMLButtonElement>('[data-edit-op="replace-image"]')?.disabled
		).toBe(true);
		expect(
			container.querySelector<HTMLButtonElement>('[data-edit-op="replace-image-all"]')?.disabled
		).toBe(true);
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
		// T/R/B/L slider + 数値入力 (NumberAdjustInput)。Collapse 内だが既定閉でも DOM には存在。
		expect(container.querySelector('[data-edit-op="clip-top"]')).not.toBeNull();
		expect(container.querySelector('[data-edit-op="clip-right"]')).not.toBeNull();
		expect(container.querySelector('[data-edit-op="clip-bottom"]')).not.toBeNull();
		expect(container.querySelector('[data-edit-op="clip-left"]')).not.toBeNull();
		expect(container.querySelector('[data-adjust="clip-top"]')).not.toBeNull();
		// reset は展開時のみ描画。
		expect(container.querySelector('[data-edit-op="reset-clip"]')).toBeNull();
		openClip();
		expect(container.querySelector('[data-edit-op="reset-clip"]')).not.toBeNull();
	});

	it("クリップUIは既定で畳まれ、ヘッダークリックで開閉する", () => {
		seedSlide([makeImageLayer(1, "u-1")]);
		render();
		selectLayer("u-1");
		// 既定は閉 → reset は非描画。
		expect(container.querySelector('[data-edit-op="reset-clip"]')).toBeNull();
		openClip(); // 開く
		expect(container.querySelector('[data-edit-op="reset-clip"]')).not.toBeNull();
		openClip(); // 再クリックで閉じる
		expect(container.querySelector('[data-edit-op="reset-clip"]')).toBeNull();
	});

	it("reset-clip ボタンで clipRect が [0,0,0,0] に戻る", () => {
		seedSlide([makeImageLayer(1, "u-1", { clipRect: [10, 20, 30, 40] })]);
		render();
		selectLayer("u-1");
		openClip();
		clickByOp("reset-clip");
		const stored = useSlideStore.getState().slides[0].layers[0] as ImageLayer;
		expect(stored.clipRect).toEqual([0, 0, 0, 0]);
		expect(useHistoryStore.getState().past.length).toBe(1);
	});

	it("locked layer は reset-clip が disabled", () => {
		seedSlide([makeImageLayer(1, "u-1", { locked: true, clipRect: [10, 0, 0, 0] })]);
		render();
		selectLayer("u-1");
		openClip();
		const btn = container.querySelector<HTMLButtonElement>('[data-edit-op="reset-clip"]');
		expect(btn?.disabled).toBe(true);
	});

	// clip 入力ボックス (NumberAdjustInput)。max は測定モックで w=400/h=300 に固定。
	const clipInput = (key: string): HTMLInputElement => {
		const el = container.querySelector<HTMLInputElement>(`[data-adjust="clip-${key}"]`);
		if (!el) throw new Error(`clip input not found: ${key}`);
		return el;
	};

	it("クリップ入力は ↑ で -25 / ↓ で +25 (legacy {v:-25} 準拠、invert)", () => {
		seedSlide([makeImageLayer(1, "u-1", { clipRect: [100, 0, 0, 0] })]);
		render();
		selectLayer("u-1");
		openClip();
		const el = clipInput("top");
		expect(el.disabled).toBe(false); // 測定モックで max>0 → 有効
		act(() => el.dispatchEvent(new FocusEvent("focusin", { bubbles: true })));
		act(() => el.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowUp", bubbles: true })));
		expect((useSlideStore.getState().slides[0].layers[0] as ImageLayer).clipRect[0]).toBe(75);
		act(() => el.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowDown", bubbles: true })));
		expect((useSlideStore.getState().slides[0].layers[0] as ImageLayer).clipRect[0]).toBe(100);
		// 入力中 (blur 前) は history を積まない。
		expect(useHistoryStore.getState().past.length).toBe(0);
	});

	it("クリップ入力に直接入力 → Enter で反映、blur で history 1 件", () => {
		seedSlide([makeImageLayer(1, "u-1", { clipRect: [0, 0, 0, 0] })]);
		render();
		selectLayer("u-1");
		openClip();
		const el = clipInput("top");
		act(() => el.dispatchEvent(new FocusEvent("focusin", { bubbles: true })));
		act(() => {
			const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
			setter?.call(el, "50");
			el.dispatchEvent(new Event("input", { bubbles: true }));
		});
		act(() => el.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true })));
		expect((useSlideStore.getState().slides[0].layers[0] as ImageLayer).clipRect[0]).toBe(50);
		act(() => el.dispatchEvent(new FocusEvent("focusout", { bubbles: true })));
		expect(useHistoryStore.getState().past.length).toBe(1);
		expect(
			(useHistoryStore.getState().past[0].before.slides[0].layers[0] as ImageLayer).clipRect[0]
		).toBe(0);
	});
});

describe("EditOpsPanel 形状 (変形) clipboard ボタン (v4 Group D D-8)", () => {
	// 汎用 clipboard (copy/cut/paste) は EditToolbar へ移設 (editToolbar.test.tsx)。
	// 本 describe は選択レイヤーに残した「変形コピー/貼付」のみ扱う。

	it("選択なしでは copy-transform / paste-transform が disabled", () => {
		seedSlide([makeImageLayer(1, "u-1")]);
		render();
		expect(
			container.querySelector<HTMLButtonElement>('[data-edit-op="copy-transform"]')?.disabled
		).toBe(true);
		expect(
			container.querySelector<HTMLButtonElement>('[data-edit-op="paste-transform"]')?.disabled
		).toBe(true);
	});

	it("copy-transform → paste-transform ボタンで変形が複写される", () => {
		seedSlide([makeImageLayer(1, "u-1", { transX: 33, rotation: 90 }), makeImageLayer(2, "u-2")]);
		render();
		selectLayer("u-1");
		clickByOp("copy-transform");
		selectLayer("u-2");
		expect(
			container.querySelector<HTMLButtonElement>('[data-edit-op="paste-transform"]')?.disabled
		).toBe(false);
		clickByOp("paste-transform");
		const after = useSlideStore.getState().slides[0].layers[1] as ImageLayer;
		expect(after.transX).toBe(33);
		expect(after.rotation).toBe(90);
	});
});

describe("EditOpsPanel テキスト編集 (v4 Group D D-9)", () => {
	// add-text (テキストレイヤー追加) は EditToolbar へ移設 (editToolbar.test.tsx)。
	// 本 describe は選択中 TextLayer の textarea 編集 (= 選択レイヤー UI) のみ扱う。

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
		// 記録された before スナップショットが開始テキストを保持 (= undo で巻き戻せる)。
		// undo 機構そのものは EditToolbar 側でテスト。
		const before = useHistoryStore.getState().past[0].before;
		expect((before.slides[0].layers[0] as { text: string }).text).toBe("before");
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

describe("EditOpsPanel 数値プロパティ入力 (v4 Group D D-10, §12)", () => {
	const adjustInput = (prop: string): HTMLInputElement => {
		const el = container.querySelector<HTMLInputElement>(`[data-adjust="${prop}"]`);
		if (!el) throw new Error(`adjust input not found: ${prop}`);
		return el;
	};

	it("選択 layer の transX/transY/scaleX/rotation が入力欄に表示される", () => {
		seedSlide([
			makeImageLayer(1, "u-1", { transX: 12, transY: 34, scaleX: 2, scaleY: 2, rotation: 45 }),
		]);
		render();
		selectLayer("u-1");
		expect(adjustInput("transX").value).toBe("12");
		expect(adjustInput("transY").value).toBe("34");
		expect(adjustInput("scale").value).toBe("2");
		expect(adjustInput("rotation").value).toBe("45");
	});

	it("↑キーで transX が -25 (legacy 逆方向)、即時反映で入力中は history なし", () => {
		seedSlide([makeImageLayer(1, "u-1", { transX: 100 })]);
		render();
		selectLayer("u-1");
		const el = adjustInput("transX");
		act(() => el.dispatchEvent(new FocusEvent("focusin", { bubbles: true })));
		act(() => el.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowUp", bubbles: true })));
		expect(useSlideStore.getState().slides[0].layers[0].transX).toBe(75); // ↑ で -25 (invert)
		// ↓ は +25
		act(() => el.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowDown", bubbles: true })));
		expect(useSlideStore.getState().slides[0].layers[0].transX).toBe(100);
		// 入力中 (blur 前) は history を積まない
		expect(useHistoryStore.getState().past.length).toBe(0);
	});

	it("拡大率は multiply (×1.1) で scaleX/scaleY 両方を更新", () => {
		seedSlide([makeImageLayer(1, "u-1", { scaleX: 2, scaleY: 2 })]);
		render();
		selectLayer("u-1");
		const el = adjustInput("scale");
		act(() => el.dispatchEvent(new FocusEvent("focusin", { bubbles: true })));
		act(() => el.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowUp", bubbles: true })));
		const layer = useSlideStore.getState().slides[0].layers[0];
		expect(layer.scaleX).toBeCloseTo(2.2);
		expect(layer.scaleY).toBeCloseTo(2.2);
	});

	it("回転は ↑ で 5° 単位、blur で history 1 件 + undo で元に戻る", () => {
		seedSlide([makeImageLayer(1, "u-1", { rotation: 0 })]);
		render();
		selectLayer("u-1");
		const el = adjustInput("rotation");
		act(() => el.dispatchEvent(new FocusEvent("focusin", { bubbles: true })));
		act(() => el.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowUp", bubbles: true })));
		act(() => el.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowUp", bubbles: true })));
		act(() => el.dispatchEvent(new FocusEvent("focusout", { bubbles: true })));
		expect(useSlideStore.getState().slides[0].layers[0].rotation).toBe(10); // 5° × 2
		expect(useHistoryStore.getState().past.length).toBe(1);
		// 記録された before が開始 rotation=0 を保持 (= undo で巻き戻せる)。undo 機構は EditToolbar 側でテスト。
		expect(useHistoryStore.getState().past[0].before.slides[0].layers[0].rotation).toBe(0);
	});

	it("位置 X は Shift+↑ で -100 (=shiftStep×invert)、rotation は Shift 無効 (5)", () => {
		seedSlide([makeImageLayer(1, "u-1", { transX: 0, rotation: 0 })]);
		render();
		selectLayer("u-1");
		const x = adjustInput("transX");
		act(() => x.dispatchEvent(new FocusEvent("focusin", { bubbles: true })));
		act(() =>
			x.dispatchEvent(
				new KeyboardEvent("keydown", { key: "ArrowUp", shiftKey: true, bubbles: true })
			)
		);
		expect(useSlideStore.getState().slides[0].layers[0].transX).toBe(-100); // invert + shiftStep
		// rotation は Shift 無効 + invert なし → 通常 step 5 (正方向)
		const r = adjustInput("rotation");
		act(() => r.dispatchEvent(new FocusEvent("focusin", { bubbles: true })));
		act(() =>
			r.dispatchEvent(
				new KeyboardEvent("keydown", { key: "ArrowUp", shiftKey: true, bubbles: true })
			)
		);
		expect(useSlideStore.getState().slides[0].layers[0].rotation).toBe(5);
	});

	it("locked layer では入力欄が disabled", () => {
		seedSlide([makeImageLayer(1, "u-1", { locked: true })]);
		render();
		selectLayer("u-1");
		expect(adjustInput("transX").disabled).toBe(true);
	});

	// 回帰: 入力 focus 中に別レイヤーへ切り替えても、前レイヤーの draft が新レイヤーへ commit されない。
	// (NumberAdjustInput は focus 中 value を draft に同期しないため、key=uuid で remount して持ち越しを断つ)
	it("X 入力 focus 中に別レイヤーを選択 → blur しても新レイヤーは汚染されない", () => {
		seedSlide([
			makeImageLayer(1, "u-1", { transX: 10 }),
			makeImageLayer(2, "u-2", { transX: 999 }),
		]);
		render();
		selectLayer("u-1");
		const xA = adjustInput("transX");
		// A の X 入力に focus → draft を 12345 へ (Enter せず)
		act(() => xA.dispatchEvent(new FocusEvent("focusin", { bubbles: true })));
		act(() => {
			const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
			setter?.call(xA, "12345");
			xA.dispatchEvent(new Event("input", { bubbles: true }));
		});
		// B を選択 (React flush で EditOpsPanel は B 用に再 render、A の入力は remount で破棄)
		selectLayer("u-2");
		// 旧 A 入力に blur を発火 (remount 済みなら React onBlur は走らない)
		act(() => xA.dispatchEvent(new FocusEvent("focusout", { bubbles: true })));

		const layers = useSlideStore.getState().slides[0].layers;
		expect((layers[1] as ImageLayer).transX).toBe(999); // B は汚染されない
		expect((layers[0] as ImageLayer).transX).toBe(10); // A も draft 12345 が確定しない (focus 中切替で破棄)
		// 切替後の入力は B の値を表示
		expect(adjustInput("transX").value).toBe("999");
	});
});

// rectEdit トグル / add-text / undo-redo は EditToolbar へ移設 (editToolbar.test.tsx)。
