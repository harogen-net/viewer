import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { useDocumentMutation, type UseDocumentMutation } from "../../src/hooks/useDocumentMutation";
import { useSlideMutation, type UseSlideMutation } from "../../src/hooks/useSlideMutation";
import { useHistoryStore } from "../../src/state/historyStore";
import { useLayerStore } from "../../src/state/layerStore";
import { useSlideStore } from "../../src/state/slideStore";
import { useViewerDocumentStore } from "../../src/state/viewerDocumentStore";
import type { Slide } from "../../src/types/Slide";

// v4 Group C: useSlideMutation + useDocumentMutation の統合テスト。
// store cascade (slideStore → layerStore) / modified flag / history 記録 / undo/redo を
// 統合パスで検証する。各 mutation の純粋な計算は slideOps.test.ts でカバー済。

const makeSlide = (id: number, uuid: string, overrides: Partial<Slide> = {}): Slide => ({
	id,
	uuid,
	width: 800,
	height: 600,
	durationRatio: 1,
	joining: true,
	disabled: false,
	layers: [],
	...overrides,
});

interface CapturedHooks {
	slide: UseSlideMutation;
	doc: UseDocumentMutation;
}

const setupHooks = (): { api: CapturedHooks; teardown: () => void } => {
	const div = document.createElement("div");
	document.body.appendChild(div);
	const root: Root = createRoot(div);
	let captured: CapturedHooks | null = null;
	const Probe = (): null => {
		captured = { slide: useSlideMutation(), doc: useDocumentMutation() };
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

const seed = (slides: Slide[], selectedIndex = -1): void => {
	useSlideStore.getState().setSlides(slides);
	if (selectedIndex >= 0) useSlideStore.getState().setSelectedIndex(selectedIndex);
	useViewerDocumentStore.getState().setModified(false);
	useHistoryStore.getState().clear();
};

describe("useSlideMutation + useDocumentMutation (v4 Group C primitive)", () => {
	describe("mutation 適用 → store cascade / modified / history", () => {
		it("moveSlide: slideStore 反映 + modified=true + history push", () => {
			seed([makeSlide(1, "a"), makeSlide(2, "b"), makeSlide(3, "c")], 1);

			hooks.api.slide.moveSlide(1, 0);

			const s = useSlideStore.getState();
			expect(s.slides.map((x) => x.uuid)).toEqual(["b", "a", "c"]);
			expect(s.selectedIndex).toBe(0);
			expect(useViewerDocumentStore.getState().modified).toBe(true);
			expect(useHistoryStore.getState().past.length).toBe(1);
			expect(useHistoryStore.getState().past[0].label).toBe("move slide");
		});

		it("no-op (op が null) では store も modified も history も変化しない", () => {
			seed([makeSlide(1, "a"), makeSlide(2, "b")]);

			hooks.api.slide.moveSlide(0, 0); // 同 index
			hooks.api.slide.moveSlide(-1, 1); // 範囲外

			expect(useViewerDocumentStore.getState().modified).toBe(false);
			expect(useHistoryStore.getState().past.length).toBe(0);
		});

		it("addSlide → 末尾追加 + layerStore は空 slide の layers (=[])", () => {
			seed([makeSlide(1, "a")], 0);

			hooks.api.slide.addSlide(100, 50);

			const s = useSlideStore.getState();
			expect(s.slides.length).toBe(2);
			expect(useLayerStore.getState().layers.length).toBe(0); // 選択不動、元 a の layers (空)
		});

		it("setSlideJoining → label が状態で切替 (join slide / split slide)", () => {
			seed([makeSlide(1, "a", { joining: true })]);

			hooks.api.slide.setSlideJoining(0, false);
			expect(useHistoryStore.getState().past[0].label).toBe("split slide");

			hooks.api.slide.setSlideJoining(0, true);
			expect(useHistoryStore.getState().past[1].label).toBe("join slide");
		});
	});

	describe("undo / redo", () => {
		it("undo で 1 つ前の SlideState に復元、redo で再適用", () => {
			seed([makeSlide(1, "a"), makeSlide(2, "b")], 0);

			hooks.api.slide.moveSlide(0, 1);
			expect(useSlideStore.getState().slides.map((x) => x.uuid)).toEqual(["b", "a"]);

			hooks.api.doc.undo();
			expect(useSlideStore.getState().slides.map((x) => x.uuid)).toEqual(["a", "b"]);
			expect(useSlideStore.getState().selectedIndex).toBe(0);
			expect(useHistoryStore.getState().future.length).toBe(1);

			hooks.api.doc.redo();
			expect(useSlideStore.getState().slides.map((x) => x.uuid)).toEqual(["b", "a"]);
			expect(useHistoryStore.getState().future.length).toBe(0);
		});

		it("空 history で undo / redo は no-op (例外なし)", () => {
			expect(() => hooks.api.doc.undo()).not.toThrow();
			expect(() => hooks.api.doc.redo()).not.toThrow();
		});

		it("undo 後に新 mutation で future が破棄される (分岐放棄)", () => {
			seed([makeSlide(1, "a"), makeSlide(2, "b"), makeSlide(3, "c")]);

			hooks.api.slide.moveSlide(0, 2);
			hooks.api.doc.undo();
			expect(useHistoryStore.getState().future.length).toBe(1);

			hooks.api.slide.deleteSlide(0);
			expect(useHistoryStore.getState().future.length).toBe(0);
			expect(useHistoryStore.getState().past.length).toBe(1);
		});

		it("canUndo / canRedo が past / future に連動", () => {
			seed([makeSlide(1, "a"), makeSlide(2, "b")]);
			expect(hooks.api.doc.canUndo()).toBe(false);
			expect(hooks.api.doc.canRedo()).toBe(false);

			hooks.api.slide.moveSlide(0, 1);
			expect(hooks.api.doc.canUndo()).toBe(true);

			hooks.api.doc.undo();
			expect(hooks.api.doc.canUndo()).toBe(false);
			expect(hooks.api.doc.canRedo()).toBe(true);
		});

		it("layerStore は undo 後も選択 slide の layers と整合", () => {
			const slideWithLayer = makeSlide(2, "b", {
				layers: [
					{
						id: 1,
						uuid: "l-1",
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
						type: "text",
						text: "hi",
					},
				],
			});
			seed([makeSlide(1, "a"), slideWithLayer], 1);
			expect(useLayerStore.getState().layers.length).toBe(1);

			hooks.api.slide.deleteSlide(1);
			// "a" が選択され layerStore は空に
			expect(useLayerStore.getState().layers.length).toBe(0);

			hooks.api.doc.undo();
			// undo で b が戻り、選択も復元される → layers 再投入
			expect(useLayerStore.getState().layers.length).toBe(1);
		});
	});

	describe("document setDocument で history clear", () => {
		it("setDocument 呼び出しで history が空に", () => {
			seed([makeSlide(1, "a"), makeSlide(2, "b")]);
			hooks.api.slide.moveSlide(0, 1);
			expect(useHistoryStore.getState().past.length).toBe(1);

			useViewerDocumentStore.getState().setDocument({
				title: "fresh",
				width: 100,
				height: 100,
				createTime: 0,
				editTime: 0,
				slides: [],
			});
			expect(useHistoryStore.getState().past.length).toBe(0);
			expect(useHistoryStore.getState().future.length).toBe(0);
		});
	});
});
