import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { useLayerClipboard, type UseLayerClipboard } from "../../src/hooks/useLayerClipboard";
import { useClipboardStore } from "../../src/state/clipboardStore";
import { useHistoryStore } from "../../src/state/historyStore";
import { useLayerStore } from "../../src/state/layerStore";
import { useSlideStore } from "../../src/state/slideStore";
import { useViewerDocumentStore } from "../../src/state/viewerDocumentStore";
import type { ImageLayer, Layer } from "../../src/types/Layer";
import type { Slide } from "../../src/types/Slide";

// v4 Group D D-8: useLayerClipboard 統合テスト。
// clipboardStore + useLayerMutation 経由で copy/cut/paste/copyTransform/pasteTransform が
// store cascade / history を伴って動くことを検証。

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
	imageId: `img-${id}`,
	clipRect: [0, 0, 0, 0],
	isText: false,
	...overrides,
});
const makeSlide = (id: number, uuid: string, layers: Layer[]): Slide => ({
	id,
	uuid,
	width: 800,
	height: 600,
	durationRatio: 1,
	joining: true,
	disabled: false,
	layers,
});

let api: UseLayerClipboard;
let root: Root;
let div: HTMLDivElement;

const setup = (): void => {
	div = document.createElement("div");
	document.body.appendChild(div);
	root = createRoot(div);
	const Probe = (): null => {
		api = useLayerClipboard();
		return null;
	};
	act(() => root.render(<Probe />));
};

beforeEach(() => {
	useSlideStore.getState().setSlides([]);
	useLayerStore.getState().setLayers([]);
	useViewerDocumentStore.getState().setModified(false);
	useHistoryStore.getState().clear();
	useClipboardStore.getState().clear();
	setup();
});

afterEach(() => {
	act(() => root.unmount());
	div.remove();
	useClipboardStore.getState().clear();
});

const seed = (layers: Layer[], selectUuid?: string): void => {
	useSlideStore.getState().setSlides([makeSlide(1, "s1", layers)]);
	useSlideStore.getState().setSelectedIndex(0);
	if (selectUuid) {
		const l = layers.find((x) => x.uuid === selectUuid) ?? null;
		useLayerStore.getState().setSelectedLayer(l);
	}
	useViewerDocumentStore.getState().setModified(false);
	useHistoryStore.getState().clear();
};

describe("useLayerClipboard (v4 Group D D-8)", () => {
	it("copy: 選択 layer の clone を clipboard に積む (slide は不変)", () => {
		seed([makeImageLayer(1, "a"), makeImageLayer(2, "b")], "b");
		act(() => api.copy());
		expect(useClipboardStore.getState().layer?.uuid).toBe("b");
		// slide layers は変化なし、history も増えない
		expect(useSlideStore.getState().slides[0].layers).toHaveLength(2);
		expect(useHistoryStore.getState().past).toHaveLength(0);
		expect(api.canPaste).toBe(true);
	});

	it("copy の clone は参照分離 (clipRect を後続編集しても clipboard は不変)", () => {
		const layer = makeImageLayer(1, "a", { clipRect: [1, 2, 3, 4] });
		seed([layer], "a");
		act(() => api.copy());
		// 元 layer オブジェクトの clipRect を直接破壊
		layer.clipRect[0] = 999;
		expect(useClipboardStore.getState().layer).not.toBeNull();
		const copied = useClipboardStore.getState().layer as ImageLayer;
		expect(copied.clipRect[0]).toBe(1);
	});

	it("cut: copy + 選択 layer 削除 (history 1 件)", () => {
		seed([makeImageLayer(1, "a"), makeImageLayer(2, "b")], "a");
		act(() => api.cut());
		expect(useClipboardStore.getState().layer?.uuid).toBe("a");
		const layers = useSlideStore.getState().slides[0].layers;
		expect(layers).toHaveLength(1);
		expect(layers[0].uuid).toBe("b");
		expect(useHistoryStore.getState().past).toHaveLength(1);
	});

	it("paste: clipboard layer を現 slide に複製 (新 id/uuid) し選択する", () => {
		seed([makeImageLayer(5, "a", { imageId: "img-X" })], "a");
		act(() => api.copy());
		act(() => api.paste());
		const layers = useSlideStore.getState().slides[0].layers;
		expect(layers).toHaveLength(2);
		// 追加分は末尾、imageId は維持、id/uuid は別物
		const pasted = layers[1] as ImageLayer;
		expect(pasted.imageId).toBe("img-X");
		expect(pasted.uuid).not.toBe("a");
		expect(pasted.id).not.toBe(5);
		// 選択は追加した layer
		expect(useLayerStore.getState().selectedLayer?.uuid).toBe(pasted.uuid);
		expect(useHistoryStore.getState().past).toHaveLength(1);
	});

	it("paste: clipboard 空なら no-op", () => {
		seed([makeImageLayer(1, "a")], "a");
		act(() => api.paste());
		expect(useSlideStore.getState().slides[0].layers).toHaveLength(1);
		expect(useHistoryStore.getState().past).toHaveLength(0);
	});

	it("copyTransform / pasteTransform: 変形 7 値のみ複写", () => {
		const src = makeImageLayer(1, "a", { transX: 10, transY: 20, rotation: 45, scaleX: 2 });
		const dst = makeImageLayer(2, "b", { imageId: "img-keep" });
		seed([src, dst], "a");
		act(() => api.copyTransform());
		expect(api.canPasteTransform).toBe(true);
		// 貼付対象を b に切替
		seed([src, dst], "b");
		// seed が clipboard を消さないことを確認しつつ transform 再コピー不要
		act(() => api.pasteTransform());
		const after = useSlideStore.getState().slides[0].layers[1] as ImageLayer;
		expect(after.transX).toBe(10);
		expect(after.transY).toBe(20);
		expect(after.rotation).toBe(45);
		expect(after.scaleX).toBe(2);
		// imageId 等の非 transform プロパティは維持
		expect(after.imageId).toBe("img-keep");
	});

	it("選択なしでは copy / cut / copyTransform は no-op", () => {
		seed([makeImageLayer(1, "a")]); // 選択なし
		act(() => api.copy());
		act(() => api.copyTransform());
		expect(useClipboardStore.getState().layer).toBeNull();
		expect(useClipboardStore.getState().transform).toBeNull();
	});
});
