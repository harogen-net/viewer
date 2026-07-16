import { beforeEach, describe, expect, it } from "vitest";
import { useImageLibraryStore } from "../../src/state/imageLibraryStore";
import { useSlideStore } from "../../src/state/slideStore";
import { useViewerDocumentStore } from "../../src/state/viewerDocumentStore";
import { createNewViewerDocument } from "../../src/utils/viewerDocumentFactory";

// markSaved: 保存完了マーク (title 同期 + modified=false、history/slides は触らない)。

const makeMeta = (title: string) => {
	const { slides: _slides, ...meta } = createNewViewerDocument();
	return { ...meta, title };
};

beforeEach(() => {
	useViewerDocumentStore.setState({
		meta: null,
		modified: false,
		progress: null,
		progressLabel: "",
		savedSlides: null,
		metaDirty: false,
	});
	useSlideStore.getState().setSlides([]);
	useImageLibraryStore.getState().setImageLibrary({});
});

describe("viewerDocumentStore.setProgress", () => {
	const s = () => useViewerDocumentStore.getState();
	it("値とラベルを設定し、label 省略時は現ラベルを維持する", () => {
		s().setProgress(0.3, "保存中…");
		expect(s().progress).toBe(0.3);
		expect(s().progressLabel).toBe("保存中…");
		// label 省略 → ラベル維持
		s().setProgress(0.6);
		expect(s().progress).toBe(0.6);
		expect(s().progressLabel).toBe("保存中…");
	});
	it("null で進捗もラベルもクリアする", () => {
		s().setProgress(0.5, "x");
		s().setProgress(null);
		expect(s().progress).toBeNull();
		expect(s().progressLabel).toBe("");
	});
});

describe("viewerDocumentStore.markSaved", () => {
	it("meta.title を保存名へ同期し modified を false にする", () => {
		useViewerDocumentStore.setState({ meta: makeMeta("(new)"), modified: true });
		useViewerDocumentStore.getState().markSaved("2026-06-25_120000");
		const s = useViewerDocumentStore.getState();
		expect(s.meta?.title).toBe("2026-06-25_120000");
		expect(s.modified).toBe(false);
	});

	it("meta が null でも modified を false に戻す (meta は null のまま)", () => {
		useViewerDocumentStore.setState({ meta: null, modified: true });
		useViewerDocumentStore.getState().markSaved("x");
		const s = useViewerDocumentStore.getState();
		expect(s.meta).toBeNull();
		expect(s.modified).toBe(false);
	});
});

describe("viewerDocumentStore.patchMeta", () => {
	it("meta の一部を更新し modified=true にする", () => {
		useViewerDocumentStore.setState({ meta: makeMeta("(new)"), modified: false });
		useViewerDocumentStore.getState().patchMeta({ title: "my-doc", bgColor: "#112233" });
		const s = useViewerDocumentStore.getState();
		expect(s.meta?.title).toBe("my-doc");
		expect(s.meta?.bgColor).toBe("#112233");
		expect(s.modified).toBe(true);
	});

	it("既存フィールドは保持される (部分更新)", () => {
		useViewerDocumentStore.setState({ meta: makeMeta("keep"), modified: false });
		const beforeWidth = useViewerDocumentStore.getState().meta?.width;
		useViewerDocumentStore.getState().patchMeta({ isSensitive: true });
		const s = useViewerDocumentStore.getState();
		expect(s.meta?.title).toBe("keep");
		expect(s.meta?.width).toBe(beforeWidth);
		expect(s.meta?.isSensitive).toBe(true);
	});

	it("meta が null なら何もしない", () => {
		useViewerDocumentStore.setState({ meta: null, modified: false });
		useViewerDocumentStore.getState().patchMeta({ title: "x" });
		const s = useViewerDocumentStore.getState();
		expect(s.meta).toBeNull();
		expect(s.modified).toBe(false);
	});
});

describe("clean 判定 (savedSlides 参照比較 + metaDirty)", () => {
	const store = () => useViewerDocumentStore.getState();
	// 1 スライド (text layer 1 枚, transX=10) を持つ doc。
	const docWithSlide = () => {
		const doc = createNewViewerDocument();
		doc.slides = [
			{
				id: 1,
				uuid: "s1",
				width: doc.width,
				height: doc.height,
				durationRatio: 1,
				joining: true,
				disabled: false,
				layers: [
					{
						id: 1,
						uuid: "l1",
						name: "",
						opacity: 1,
						locked: false,
						visible: true,
						shared: false,
						transX: 10,
						transY: 20,
						scaleX: 1,
						scaleY: 1,
						rotation: 0,
						mirrorH: false,
						mirrorV: false,
						type: "text",
						text: "hi",
					},
				],
			},
		];
		return doc;
	};
	const editTransX = (value: number) =>
		useSlideStore.getState().slides.map((sl) => ({
			...sl,
			layers: sl.layers.map((l) => ({ ...l, transX: value })),
		}));

	it("setDocument 直後は modified=false", () => {
		store().setDocument(createNewViewerDocument());
		expect(store().modified).toBe(false);
	});

	it("編集で modified=true、保存時点の slides 参照へ戻すと modified=false に落ちる", () => {
		store().setDocument(docWithSlide());
		const saved = useSlideStore.getState().slides; // baseline 参照

		// 編集 (別配列 + 内容変更) → dirty
		useSlideStore.getState().setSlides(editTransX(999));
		store().refreshModified();
		expect(store().modified).toBe(true);

		// undo 相当: 保存時点の参照に戻す → clean
		useSlideStore.getState().setSlides(saved);
		store().refreshModified();
		expect(store().modified).toBe(false);
	});

	it("別配列でも内容が保存時と同じなら clean (変形ペーストで元の値へ戻したケース)", () => {
		store().setDocument(docWithSlide());

		// レイヤを移動 (別配列 + transX 変更) → dirty
		useSlideStore.getState().setSlides(editTransX(999));
		store().refreshModified();
		expect(store().modified).toBe(true);

		// 変形を元の値 (10) に戻す = 別配列だが内容は保存時と同一 → clean になる
		useSlideStore.getState().setSlides(editTransX(10));
		store().refreshModified();
		expect(store().modified).toBe(false);
	});

	it("meta 編集があると slides を保存時点へ戻しても modified は true のまま", () => {
		store().setDocument(docWithSlide());
		const saved = useSlideStore.getState().slides;

		store().patchMeta({ bgColor: "#000000" }); // metaDirty=true
		useSlideStore.getState().setSlides(saved); // slide は clean に戻す
		store().refreshModified();
		expect(store().modified).toBe(true); // meta 変更が残るので dirty 維持
	});

	it("markSaved が現在の slides を新 baseline にする", () => {
		store().setDocument(docWithSlide());
		const edited = editTransX(555); // 編集した内容
		useSlideStore.getState().setSlides(edited);
		store().refreshModified();
		expect(store().modified).toBe(true);

		store().markSaved("t"); // 保存 → edited が新 baseline
		expect(store().modified).toBe(false);

		// さらに編集して保存時点へ戻せば clean
		useSlideStore.getState().setSlides([]);
		store().refreshModified();
		expect(store().modified).toBe(true);
		useSlideStore.getState().setSlides(edited);
		store().refreshModified();
		expect(store().modified).toBe(false);
	});
});

describe("viewerDocumentStore.setDocument", () => {
	it("null (close) で image library がクリアされる", () => {
		useImageLibraryStore
			.getState()
			.setImageLibrary({ img1: { dataURL: "data:x" }, img2: { dataURL: "data:y" } });
		expect(Object.keys(useImageLibraryStore.getState().imageById).length).toBe(2);

		useViewerDocumentStore.getState().setDocument(null);
		expect(useImageLibraryStore.getState().imageById).toEqual({});
	});
});
