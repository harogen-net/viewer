import { beforeEach, describe, expect, it } from "vitest";
import { useClipboardStore } from "../../src/state/clipboardStore";
import { useViewerDocumentStore } from "../../src/state/viewerDocumentStore";
import type { ImageLayer, LayerTransform } from "../../src/types/Layer";
import type { ViewerDocument } from "../../src/types/ViewerDocument";

// v4 Group D D-8: clipboardStore の基本動作 + document 差し替え時の自動 clear。
// レガシー寄せ: copy 元 document を閉じる/切替えると clipboard は失われる
// (またぎペーストで孤児 imageId を生まない)。

const makeImageLayer = (): ImageLayer => ({
	id: 1,
	uuid: "a",
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
	type: "image",
	imageId: "img-1",
	clipRect: [0, 0, 0, 0],
	isText: false,
});

const transform: LayerTransform = {
	transX: 5,
	transY: 6,
	scaleX: 2,
	scaleY: 2,
	rotation: 90,
	mirrorH: true,
	mirrorV: false,
};

const makeDoc = (title: string): ViewerDocument => ({
	title,
	width: 1600,
	height: 900,
	createTime: 0,
	editTime: 0,
	bgColor: "#000000",
	isSensitive: false,
	slides: [],
});

beforeEach(() => {
	useClipboardStore.getState().clear();
});

describe("clipboardStore (v4 Group D D-8)", () => {
	it("setLayer / setTransform / clear", () => {
		useClipboardStore.getState().setLayer(makeImageLayer());
		useClipboardStore.getState().setTransform(transform);
		expect(useClipboardStore.getState().layer?.uuid).toBe("a");
		expect(useClipboardStore.getState().transform?.rotation).toBe(90);
		useClipboardStore.getState().clear();
		expect(useClipboardStore.getState().layer).toBeNull();
		expect(useClipboardStore.getState().transform).toBeNull();
	});

	it("setDocument(doc) で clipboard が clear される (ロード/新規/import 共通経路)", () => {
		useClipboardStore.getState().setLayer(makeImageLayer());
		useClipboardStore.getState().setTransform(transform);
		useViewerDocumentStore.getState().setDocument(makeDoc("doc-B"));
		expect(useClipboardStore.getState().layer).toBeNull();
		expect(useClipboardStore.getState().transform).toBeNull();
	});

	it("setDocument(null) でも clipboard が clear される", () => {
		useClipboardStore.getState().setLayer(makeImageLayer());
		useViewerDocumentStore.getState().setDocument(null);
		expect(useClipboardStore.getState().layer).toBeNull();
	});
});
