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

	// スライド単位の再生設定 (有効/無効・表示尺・結合) だけは VIEW でも通す
	// (EditCapability.SLIDE_PLAYBACK)。スマホで手元からスライドショーを調整するための開放。
	it("useSlideMutation: 有効/無効の切替は VIEW でも通る", () => {
		useSlideStore.getState().setSlides([makeSlide(1, "a"), makeSlide(2, "b")]);
		useViewerDocumentStore.getState().setModified(false);
		useHistoryStore.getState().clear();

		hooks.api.slide.setSlideDisabled(0, true);

		expect(useSlideStore.getState().slides[0].disabled).toBe(true);
		// history と modified も通常の編集と同じように動く (保存すれば残る変更なので)。
		expect(useHistoryStore.getState().past.length).toBe(1);
		expect(useViewerDocumentStore.getState().modified).toBe(true);
	});

	it("useSlideMutation: 表示尺の増減と直接指定は VIEW でも通る", () => {
		useSlideStore.getState().setSlides([makeSlide(1, "a")]);

		hooks.api.slide.incrementSlideDurationRatio(0);
		expect(useSlideStore.getState().slides[0].durationRatio).toBeGreaterThan(1);

		hooks.api.slide.decrementSlideDurationRatio(0);
		expect(useSlideStore.getState().slides[0].durationRatio).toBe(1);

		hooks.api.slide.setSlideDurationRatio(0, 3);
		expect(useSlideStore.getState().slides[0].durationRatio).toBe(3);
	});

	it("useSlideMutation: 結合の切替は VIEW でも通る", () => {
		useSlideStore.getState().setSlides([makeSlide(1, "a"), makeSlide(2, "b")]);
		// makeSlide は joining: true で作られるので、まず解除してから結合し直す。
		hooks.api.slide.setSlideJoining(0, false);
		expect(useSlideStore.getState().slides[0].joining).toBe(false);

		hooks.api.slide.setSlideJoining(0, true);
		expect(useSlideStore.getState().slides[0].joining).toBe(true);
	});

	// 一括操作は 1 タップの影響が全スライドに及ぶため VIEW では開けていない。
	// 「再生設定なら何でも通る」に緩んでいないことを確認する。
	it("useSlideMutation: 一括操作 / 複製は VIEW では通らない", () => {
		useSlideStore.getState().setSlides([makeSlide(1, "a"), makeSlide(2, "b")]);

		hooks.api.slide.setAllDisabled(true);
		hooks.api.slide.setAllJoining(false);
		hooks.api.slide.enableOnly(0);
		hooks.api.slide.deleteAllDisabled();
		hooks.api.slide.duplicateSlide(0);

		const slides = useSlideStore.getState().slides;
		expect(slides.length).toBe(2);
		expect(slides.every((s) => !s.disabled)).toBe(true);
		expect(slides.every((s) => s.joining)).toBe(true);
		expect(useHistoryStore.getState().past.length).toBe(0);
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
