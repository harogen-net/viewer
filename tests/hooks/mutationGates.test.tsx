import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useDocumentMutation, type UseDocumentMutation } from "../../src/hooks/useDocumentMutation";
import {
    useImageLibraryMutation,
    type UseImageLibraryMutation,
} from "../../src/hooks/useImageLibraryMutation";
import { useLayerMutation, type UseLayerMutation } from "../../src/hooks/useLayerMutation";
import { useSlideMutation, type UseSlideMutation } from "../../src/hooks/useSlideMutation";
import { useHistoryStore } from "../../src/state/historyStore";
import { useImageLibraryStore } from "../../src/state/imageLibraryStore";
import { useLayerStore } from "../../src/state/layerStore";
import { useSlideStore } from "../../src/state/slideStore";
import { useViewerDocumentStore } from "../../src/state/viewerDocumentStore";
import { useViewerModeStore, ViewerMode } from "../../src/state/viewerModeStore";
import type { Slide } from "../../src/types/Slide";

// VIEW モード action-level reject (docs/mode-spec.md §3)。
// mutation 系 hook が VIEW モードでは silent no-op になり、store / history / library を
// 一切書き換えないことを 1 件ずつ検証する。
// (UI hide だけではキーボードショートカット等で mutation が発火しうるための保険。)

const makeSlide = (id: number, uuid: string): Slide => ({
	id,
	uuid,
	width: 800,
	height: 600,
	durationRatio: 1,
	joining: true,
	disabled: false,
	layers: [],
});

interface CapturedHooks {
	slide: UseSlideMutation;
	layer: UseLayerMutation;
	image: UseImageLibraryMutation;
	doc: UseDocumentMutation;
}

const setupHooks = (): { api: CapturedHooks; teardown: () => void } => {
	const div = document.createElement("div");
	document.body.appendChild(div);
	const root: Root = createRoot(div);
	let captured: CapturedHooks | null = null;
	const Probe = (): null => {
		captured = {
			slide: useSlideMutation(),
			layer: useLayerMutation(),
			image: useImageLibraryMutation(),
			doc: useDocumentMutation(),
		};
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
	// silent no-op なので warn だけは出る。テスト出力を汚さないため無効化。
	vi.spyOn(console, "warn").mockImplementation(() => {});
	useSlideStore.getState().setSlides([]);
	useLayerStore.getState().setLayers([]);
	useImageLibraryStore.getState().setImageLibrary({});
	useViewerDocumentStore.getState().setModified(false);
	useHistoryStore.getState().clear();
	hooks = setupHooks();
	useViewerModeStore.setState({ mode: ViewerMode.VIEW, isMobileEnv: false });
});

afterEach(() => {
	hooks.teardown();
	useViewerModeStore.setState({ mode: ViewerMode.EDIT, isMobileEnv: false });
	vi.restoreAllMocks();
});

describe("VIEW モードでの action-level reject", () => {
	it("useSlideMutation: mutation が no-op (slides / history / modified 不変)", () => {
		useSlideStore.getState().setSlides([makeSlide(1, "a"), makeSlide(2, "b")]);
		useViewerDocumentStore.getState().setModified(false);
		useHistoryStore.getState().clear();

		hooks.api.slide.moveSlide(0, 1);
		hooks.api.slide.addSlide(400, 300);
		hooks.api.slide.deleteSlide(0);

		expect(useSlideStore.getState().slides.map((s) => s.uuid)).toEqual(["a", "b"]);
		expect(useHistoryStore.getState().past.length).toBe(0);
		expect(useViewerDocumentStore.getState().modified).toBe(false);
	});

	it("useLayerMutation: mutation が no-op", () => {
		useSlideStore.getState().setSlides([makeSlide(1, "a")]);
		useSlideStore.getState().setSelectedIndex(0);

		hooks.api.layer.addTextLayer("hello", 800, 600);

		expect(useSlideStore.getState().slides[0].layers.length).toBe(0);
		expect(useHistoryStore.getState().past.length).toBe(0);
	});

	it("useDocumentMutation.undo / redo が no-op (history pop しない)", () => {
		// 1 件 push (EDIT で 1 度だけ切り替えて仕込む)
		useViewerModeStore.setState({ mode: ViewerMode.EDIT, isMobileEnv: false });
		useSlideStore.getState().setSlides([makeSlide(1, "a")]);
		hooks.api.slide.addSlide(400, 300);
		expect(useHistoryStore.getState().past.length).toBe(1);
		const pastLen = useHistoryStore.getState().past.length;
		const slidesBefore = useSlideStore.getState().slides.length;

		// VIEW に戻して undo/redo が no-op であることを検証
		useViewerModeStore.setState({ mode: ViewerMode.VIEW, isMobileEnv: false });
		hooks.api.doc.undo();
		expect(useHistoryStore.getState().past.length).toBe(pastLen);
		expect(useSlideStore.getState().slides.length).toBe(slidesBefore);
	});

	it("useImageLibraryMutation.addImageDataUrl は空文字を返し library に追加しない", async () => {
		const id = await hooks.api.image.addImageDataUrl("data:image/png;base64,AAAA");
		expect(id).toBe("");
		expect(Object.keys(useImageLibraryStore.getState().imageById).length).toBe(0);
	});

	it("useImageLibraryMutation.deleteImage は 0 を返し library / slides 不変", () => {
		// EDIT で 1 件追加してから VIEW でも消えないことを確認
		useViewerModeStore.setState({ mode: ViewerMode.EDIT, isMobileEnv: false });
		useImageLibraryStore.getState().addImage("img-1", { dataURL: "data:image/png;base64,x" });
		expect(Object.keys(useImageLibraryStore.getState().imageById).length).toBe(1);

		useViewerModeStore.setState({ mode: ViewerMode.VIEW, isMobileEnv: false });
		const removed = hooks.api.image.deleteImage("img-1");
		expect(removed).toBe(0);
		expect(Object.keys(useImageLibraryStore.getState().imageById).length).toBe(1);
	});
});
