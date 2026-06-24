import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { useDocumentMutation, type UseDocumentMutation } from "../../src/hooks/useDocumentMutation";
import { useLayerMutation, type UseLayerMutation } from "../../src/hooks/useLayerMutation";
import { useHistoryStore } from "../../src/state/historyStore";
import { useLayerStore } from "../../src/state/layerStore";
import { useSlideStore } from "../../src/state/slideStore";
import { useViewerDocumentStore } from "../../src/state/viewerDocumentStore";
import type { ImageLayer, Layer, TextLayer } from "../../src/types/Layer";
import type { Slide } from "../../src/types/Slide";
import type { SlideState } from "../../src/types/SlideState";
import { updateTextLayer } from "../../src/utils/layerOps";

/** applySlideChangeLive に渡す純関数 (text のみ更新)。 */
const layerOpsUpdateText = (s: SlideState, idx: number, text: string): SlideState | null =>
	updateTextLayer(s, idx, { text });

// v4 Group D D-2: useLayerMutation 統合テスト。
// useDocumentMutation primitive 経由で:
//   - store cascade (slideStore → layerStore 同期)
//   - modified flag / history 自動記録
//   - undo/redo
// が動くことを統合パスで検証。各 op の純粋計算は layerOps.test.ts でカバー済。

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
	imageId: `img-${id}`,
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
	id,
	uuid,
	name: "",
	opacity: 1,
	locked: false,
	visible: true,
	shared: false,
	...baseTransform,
	type: "text",
	text,
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

interface CapturedHooks {
	layer: UseLayerMutation;
	doc: UseDocumentMutation;
}

const setupHooks = (): { api: CapturedHooks; teardown: () => void } => {
	const div = document.createElement("div");
	document.body.appendChild(div);
	const root: Root = createRoot(div);
	let captured: CapturedHooks | null = null;
	const Probe = (): null => {
		captured = { layer: useLayerMutation(), doc: useDocumentMutation() };
		return null;
	};
	act(() => {
		root.render(<Probe />);
	});
	if (!captured) throw new Error("hooks not captured");
	return {
		api: captured,
		teardown: () => {
			act(() => root.unmount());
			div.remove();
		},
	};
};

let hooks: { api: CapturedHooks; teardown: () => void };

beforeEach(() => {
	useSlideStore.getState().setSlides([]);
	useLayerStore.getState().setLayers([]);
	useViewerDocumentStore.getState().setModified(false);
	useHistoryStore.getState().clear();
	hooks = setupHooks();
});

afterEach(() => {
	hooks.teardown();
});

const seedSlideWithLayers = (layers: Layer[]): void => {
	useSlideStore.getState().setSlides([makeSlide(1, "s1", layers)]);
	useSlideStore.getState().setSelectedIndex(0);
	useViewerDocumentStore.getState().setModified(false);
	useHistoryStore.getState().clear();
};

describe("useLayerMutation + useDocumentMutation (v4 Group D D-2)", () => {
	describe("mutation 適用 → store cascade / modified / history", () => {
		it("updateLayer: slideStore 反映 + layerStore cascade + modified + history", () => {
			seedSlideWithLayers([makeImageLayer(1, "a"), makeImageLayer(2, "b")]);

			hooks.api.layer.updateLayer(0, { opacity: 0.3 });

			const slides = useSlideStore.getState().slides;
			expect(slides[0].layers[0].opacity).toBe(0.3);
			// layerStore は selectedIndex 経由で同期 (cascade)
			expect(useLayerStore.getState().layers[0].opacity).toBe(0.3);
			expect(useViewerDocumentStore.getState().modified).toBe(true);
			expect(useHistoryStore.getState().past.length).toBe(1);
			expect(useHistoryStore.getState().past[0].label).toBe("update layer");
		});

		it("addLayer: 末尾追加 + uuid/id 採番", () => {
			seedSlideWithLayers([makeImageLayer(5, "a")]);

			hooks.api.layer.addLayer({
				name: "",
				opacity: 1,
				locked: false,
				visible: true,
				shared: false,
				...baseTransform,
				type: "image",
				imageId: "new",
				clipRect: [0, 0, 0, 0],
				isText: false,
			});

			const slides = useSlideStore.getState().slides;
			expect(slides[0].layers.length).toBe(2);
			expect(slides[0].layers[1].id).toBe(6);
		});

		it("removeLayer: 削除 + history 記録", () => {
			seedSlideWithLayers([makeImageLayer(1, "a"), makeImageLayer(2, "b")]);

			hooks.api.layer.removeLayer(0);

			expect(useSlideStore.getState().slides[0].layers.map((l) => l.uuid)).toEqual(["b"]);
			expect(useHistoryStore.getState().past.length).toBe(1);
		});

		it("no-op (op が null) では store も modified も history も変化しない", () => {
			seedSlideWithLayers([makeImageLayer(1, "a", { opacity: 0.5 })]);

			hooks.api.layer.updateLayer(0, { opacity: 0.5 }); // 同値

			expect(useViewerDocumentStore.getState().modified).toBe(false);
			expect(useHistoryStore.getState().past.length).toBe(0);
		});

		it("updateTextLayer: text layer のみ更新可", () => {
			seedSlideWithLayers([makeImageLayer(1, "a"), makeTextLayer(2, "b", "hi")]);

			hooks.api.layer.updateTextLayer(1, { text: "world" });
			expect((useSlideStore.getState().slides[0].layers[1] as TextLayer).text).toBe("world");

			// image layer に text 更新は no-op
			hooks.api.layer.updateTextLayer(0, { text: "x" });
			expect(useHistoryStore.getState().past.length).toBe(1); // 1 件のみ (image 更新は記録されない)
		});

		it("bring/send order ops: 期待通り並び替え + history", () => {
			seedSlideWithLayers([makeImageLayer(1, "a"), makeImageLayer(2, "b"), makeImageLayer(3, "c")]);

			hooks.api.layer.bringToFront(0);
			expect(useSlideStore.getState().slides[0].layers.map((l) => l.uuid)).toEqual(["b", "c", "a"]);

			hooks.api.layer.sendToBack(2);
			expect(useSlideStore.getState().slides[0].layers.map((l) => l.uuid)).toEqual(["a", "b", "c"]);

			hooks.api.layer.bringForward(0);
			expect(useSlideStore.getState().slides[0].layers.map((l) => l.uuid)).toEqual(["b", "a", "c"]);

			hooks.api.layer.sendBackward(2);
			expect(useSlideStore.getState().slides[0].layers.map((l) => l.uuid)).toEqual(["b", "c", "a"]);

			expect(useHistoryStore.getState().past.length).toBe(4);
		});
	});

	describe("undo / redo", () => {
		it("undo で 1 つ前の layers 状態に復元、redo で再適用", () => {
			seedSlideWithLayers([makeImageLayer(1, "a", { opacity: 1 })]);

			hooks.api.layer.updateLayer(0, { opacity: 0.5 });
			expect(useSlideStore.getState().slides[0].layers[0].opacity).toBe(0.5);

			hooks.api.doc.undo();
			expect(useSlideStore.getState().slides[0].layers[0].opacity).toBe(1);
			// layerStore も cascade 経由で復元される
			expect(useLayerStore.getState().layers[0].opacity).toBe(1);

			hooks.api.doc.redo();
			expect(useSlideStore.getState().slides[0].layers[0].opacity).toBe(0.5);
		});
	});

	describe("shared 連動更新 (§7 D-15、facade 経由 1 履歴)", () => {
		it("shared layer の編集が連続隣接スライドの兄弟へ伝播し、履歴は 1 件", () => {
			// 2 slide に同 imageId + shared=true。選択スライド 0 の layer を編集。
			useSlideStore
				.getState()
				.setSlides([
					makeSlide(1, "s1", [
						makeImageLayer(10, "x0", { shared: true, imageId: "S", opacity: 1 }),
					]),
					makeSlide(2, "s2", [
						makeImageLayer(11, "x1", { shared: true, imageId: "S", opacity: 1 }),
					]),
				]);
			useSlideStore.getState().setSelectedIndex(0);
			useViewerDocumentStore.getState().setModified(false);
			useHistoryStore.getState().clear();

			act(() => {
				hooks.api.layer.updateLayer(0, { opacity: 0.3 });
			});

			const slides = useSlideStore.getState().slides;
			expect(slides[0].layers[0].opacity).toBe(0.3); // 編集対象
			expect(slides[1].layers[0].opacity).toBe(0.3); // 兄弟へ伝播
			// 兄弟同期込みで履歴 1 件 (undo で両方戻る)
			expect(useHistoryStore.getState().past.length).toBe(1);
			expect(useHistoryStore.getState().past[0].label).toBe("update layer");
		});
	});

	describe("applySlideChangeLive / recordHistory (D-9 ライブ編集 primitive)", () => {
		it("applySlideChangeLive: store へ即時反映するが history は積まない", () => {
			seedSlideWithLayers([makeTextLayer(1, "a", "x")]);
			hooks.api.doc.applySlideChangeLive((s) => layerOpsUpdateText(s, 0, "live1"));
			hooks.api.doc.applySlideChangeLive((s) => layerOpsUpdateText(s, 0, "live2"));
			expect((useSlideStore.getState().slides[0].layers[0] as { text: string }).text).toBe("live2");
			expect(useViewerDocumentStore.getState().modified).toBe(true);
			expect(useHistoryStore.getState().past.length).toBe(0);
		});

		it("recordHistory: before→現在 を 1 件記録、undo で before に戻る", () => {
			seedSlideWithLayers([makeTextLayer(1, "a", "start")]);
			const before = hooks.api.doc.snapshot();
			hooks.api.doc.applySlideChangeLive((s) => layerOpsUpdateText(s, 0, "end"));
			hooks.api.doc.recordHistory("edit text", before);
			expect(useHistoryStore.getState().past.length).toBe(1);
			hooks.api.doc.undo();
			expect((useSlideStore.getState().slides[0].layers[0] as { text: string }).text).toBe("start");
		});

		it("recordHistory: 変化がなければ no-op", () => {
			seedSlideWithLayers([makeTextLayer(1, "a", "same")]);
			const before = hooks.api.doc.snapshot();
			hooks.api.doc.recordHistory("edit text", before);
			expect(useHistoryStore.getState().past.length).toBe(0);
		});
	});
});
