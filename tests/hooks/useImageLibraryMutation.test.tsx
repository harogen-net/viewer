import { act, useSyncExternalStore } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { useImageLibraryMutation } from "../../src/hooks/useImageLibraryMutation";
import { useHistoryStore } from "../../src/state/historyStore";
import { useImageLibraryStore } from "../../src/state/imageLibraryStore";
import { useLayerStore } from "../../src/state/layerStore";
import { useSlideStore } from "../../src/state/slideStore";
import { useViewerDocumentStore } from "../../src/state/viewerDocumentStore";
import type { ImageLayer, Layer } from "../../src/types/Layer";
import type { Slide } from "../../src/types/Slide";

// v4 Group D D-6a: useImageLibraryMutation の hook 統合テスト。
// Probe コンポーネント経由で実 hook を起動し、store に書き換えが反映されるかを検証。

const baseTransform = {
	transX: 0,
	transY: 0,
	scaleX: 1,
	scaleY: 1,
	rotation: 0,
	mirrorH: false,
	mirrorV: false,
};
const makeImageLayer = (id: number, uuid: string, imageId: string): ImageLayer => ({
	id,
	uuid,
	name: "",
	opacity: 1,
	locked: false,
	visible: true,
	shared: false,
	...baseTransform,
	type: "image",
	imageId,
	clipRect: [0, 0, 0, 0],
	isText: false,
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

let container: HTMLDivElement;
let root: Root;

// hook API を test から呼べるように一時記録 (ref のように)
const hookRef: { api: ReturnType<typeof useImageLibraryMutation> | null } = { api: null };

const Probe = () => {
	const api = useImageLibraryMutation();
	// slideStore に依存して re-render させるため (削除 cascade 確認用)
	useSyncExternalStore(
		(cb) => useSlideStore.subscribe(cb),
		() => useSlideStore.getState().slides.length,
	);
	hookRef.api = api;
	return null;
};

beforeEach(() => {
	useSlideStore.getState().setSlides([]);
	useImageLibraryStore.setState({ imageById: {} });
	useHistoryStore.getState().clear();
	useViewerDocumentStore.setState({ meta: null, modified: false });
	container = document.createElement("div");
	document.body.appendChild(container);
	root = createRoot(container);
	hookRef.api = null;
	act(() => root.render(<Probe />));
});

afterEach(() => {
	act(() => root.unmount());
	container.remove();
});

const makeFile = (dataUrl: string, name = "test.png", type = "image/png"): File => {
	// data URL → File: 簡易に base64 部分を抽出して Blob 化
	const m = /^data:([^;]+);base64,(.*)$/.exec(dataUrl);
	const bin = atob(m?.[2] ?? "");
	const bytes = new Uint8Array(bin.length);
	for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
	return new File([bytes], name, { type });
};

const dummyImage1 = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVQYV2NgAAIAAAUAAeImBZsAAAAASUVORK5CYII=";
const dummyImage2 = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVQYV2P4////fwAJ+wP9BUNFygAAAABJRU5ErkJggg==";

describe("useImageLibraryMutation (v4 Group D D-6a)", () => {
	it("addImageFile: File → imageLibraryStore に登録される", async () => {
		const file = makeFile(dummyImage1);
		let id = "";
		await act(async () => {
			id = await hookRef.api!.addImageFile(file);
		});
		expect(id.length).toBeGreaterThan(0);
		expect(useImageLibraryStore.getState().imageById[id]).toBeDefined();
		expect(useImageLibraryStore.getState().imageById[id].dataURL).toBe(dummyImage1);
		expect(useImageLibraryStore.getState().imageById[id].name).toBe("test.png");
	});

	it("addImageFile: 同 dataURL を 2 回 add しても dedupe される", async () => {
		const file1 = makeFile(dummyImage1, "a.png");
		const file2 = makeFile(dummyImage1, "b.png");
		let id1 = "";
		let id2 = "";
		await act(async () => {
			id1 = await hookRef.api!.addImageFile(file1);
			id2 = await hookRef.api!.addImageFile(file2);
		});
		expect(id1).toBe(id2);
		expect(Object.keys(useImageLibraryStore.getState().imageById).length).toBe(1);
	});

	it("addImageFile: image 型以外は throw", async () => {
		const file = new File(["text"], "x.txt", { type: "text/plain" });
		await expect(hookRef.api!.addImageFile(file)).rejects.toThrow(/not an image/);
	});

	it("addImageDataUrl: dataURL 直接追加", async () => {
		let id = "";
		await act(async () => {
			id = await hookRef.api!.addImageDataUrl(dummyImage1, "x");
		});
		expect(useImageLibraryStore.getState().imageById[id].name).toBe("x");
	});

	it("deleteImage: 該当 layer なしなら 0 を返し画像のみ削除", async () => {
		let id = "";
		await act(async () => {
			id = await hookRef.api!.addImageDataUrl(dummyImage1);
		});
		let count = -1;
		act(() => {
			count = hookRef.api!.deleteImage(id);
		});
		expect(count).toBe(0);
		expect(useImageLibraryStore.getState().imageById[id]).toBeUndefined();
		expect(useHistoryStore.getState().past.length).toBe(0);
	});

	it("deleteImage: 該当 layer 全削除 (cascade) + 履歴 1 件", async () => {
		let id = "";
		await act(async () => {
			id = await hookRef.api!.addImageDataUrl(dummyImage1);
		});
		// 該当 layer を 2 slide に配置
		useSlideStore.getState().setSlides([
			makeSlide(1, "s1", [
				makeImageLayer(1, "u-1", id),
				makeImageLayer(2, "u-2", "other-id"),
			]),
			makeSlide(2, "s2", [makeImageLayer(3, "u-3", id)]),
		]);
		useSlideStore.getState().setSelectedIndex(0);

		let count = -1;
		act(() => {
			count = hookRef.api!.deleteImage(id);
		});
		expect(count).toBe(2);
		// image は library から削除
		expect(useImageLibraryStore.getState().imageById[id]).toBeUndefined();
		// cascade 削除で id 参照 layer は消え、他 imageId の layer は残る
		expect(useSlideStore.getState().slides[0].layers.map((l) => l.uuid)).toEqual(["u-2"]);
		expect(useSlideStore.getState().slides[1].layers.length).toBe(0);
		// 履歴 1 件
		expect(useHistoryStore.getState().past.length).toBe(1);
		expect(useHistoryStore.getState().past[0].label).toBe("remove layers by image");
	});

	describe("placeImageOnSlide", () => {
		// jsdom の HTMLImageElement は naturalWidth/Height = 0 を返すため、
		// 全テストで Image natural size を stub 化する。
		let __origNW: PropertyDescriptor | undefined;
		let __origNH: PropertyDescriptor | undefined;
		beforeEach(() => {
			__origNW = Object.getOwnPropertyDescriptor(HTMLImageElement.prototype, "naturalWidth");
			__origNH = Object.getOwnPropertyDescriptor(HTMLImageElement.prototype, "naturalHeight");
			Object.defineProperty(HTMLImageElement.prototype, "naturalWidth", {
				configurable: true,
				get() {
					return 400;
				},
			});
			Object.defineProperty(HTMLImageElement.prototype, "naturalHeight", {
				configurable: true,
				get() {
					return 200;
				},
			});
		});
		afterEach(() => {
			if (__origNW) Object.defineProperty(HTMLImageElement.prototype, "naturalWidth", __origNW);
			if (__origNH) Object.defineProperty(HTMLImageElement.prototype, "naturalHeight", __origNH);
		});

		it("slide 未選択 (selectedIndex<0) は false 返却、layer 追加なし", async () => {
			let id = "";
			await act(async () => {
				id = await hookRef.api!.addImageDataUrl(dummyImage1);
			});
			useSlideStore.getState().setSlides([makeSlide(1, "s1", [])]);
			// setSelectedIndex(-1) は無いので setSlides で -1 になる前提
			let result: boolean | null = null;
			await act(async () => {
				result = await hookRef.api!.placeImageOnSlide(id);
			});
			expect(result).toBe(false);
		});

		it("画像未登録 imageId は false 返却", async () => {
			useSlideStore.getState().setSlides([makeSlide(1, "s1", [])]);
			useSlideStore.getState().setSelectedIndex(0);
			let result: boolean | null = null;
			await act(async () => {
				result = await hookRef.api!.placeImageOnSlide("unknown-id");
			});
			expect(result).toBe(false);
		});

		it("配置成功: aspect 一致 (slide 2:1 + image 2:1) → 回転なし、scale=4 で fit", async () => {
			let id = "";
			await act(async () => {
				id = await hookRef.api!.addImageDataUrl(dummyImage1, "photo.png");
			});
			// slide 1600x800 (16:8 = 2:1)、image 400x200 (2:1)
			useSlideStore.getState().setSlides([
				{ id: 1, uuid: "s1", width: 1600, height: 800, durationRatio: 1, joining: true, disabled: false, layers: [] },
			]);
			useSlideStore.getState().setSelectedIndex(0);

			let result: boolean | null = null;
			await act(async () => {
				result = await hookRef.api!.placeImageOnSlide(id);
			});
			expect(result).toBe(true);

			const layers = useSlideStore.getState().slides[0].layers;
			expect(layers.length).toBe(1);
			const layer = layers[0] as ImageLayer;
			expect(layer.type).toBe("image");
			expect(layer.imageId).toBe(id);
			expect(layer.name).toBe("photo.png");
			// scale0 = min(1600/400, 800/200) = 4、scaleR = min(1600/200, 800/400) = min(8, 2) = 2 → 0° 採用
			expect(layer.scaleX).toBe(4);
			expect(layer.scaleY).toBe(4);
			expect(layer.rotation).toBe(0);
			// 中央: transX = 1600/2 - 400/2 = 600, transY = 800/2 - 200/2 = 300
			expect(layer.transX).toBe(600);
			expect(layer.transY).toBe(300);
			expect(useLayerStore.getState().selectedLayer?.uuid).toBe(layer.uuid);
		});

		it("配置成功: 縦長 slide + 横長 image → auto -90° 回転で大きく fit", async () => {
			// slide 800x1600 (aspect 0.5), image 400x200 (aspect 2.0) — 不一致
			// scale0 = min(800/400, 1600/200) = min(2, 8) = 2
			// scaleR = min(800/200, 1600/400) = min(4, 4) = 4 ← より大
			// → rotation = -90°、scale = 4
			let id = "";
			await act(async () => {
				id = await hookRef.api!.addImageDataUrl(dummyImage1);
			});
			useSlideStore.getState().setSlides([
				{ id: 1, uuid: "s1", width: 800, height: 1600, durationRatio: 1, joining: true, disabled: false, layers: [] },
			]);
			useSlideStore.getState().setSelectedIndex(0);

			await act(async () => {
				await hookRef.api!.placeImageOnSlide(id);
			});

			const layer = useSlideStore.getState().slides[0].layers[0] as ImageLayer;
			expect(layer.rotation).toBe(-90);
			expect(layer.scaleX).toBe(4);
			expect(layer.scaleY).toBe(4);
			// 中央配置は content 中心ベース (回転は中心軸): transX = 800/2 - 400/2 = 200, transY = 1600/2 - 200/2 = 700
			expect(layer.transX).toBe(200);
			expect(layer.transY).toBe(700);
		});

		it("配置: scale 同点なら 0° (デフォルト無変換)", async () => {
			// 正方 slide 1000x1000 + 正方 image (Image.naturalWidth/Height stub は 400x200 だが、
			// ここでは stub を 100x100 に上書きして等比検証)
			Object.defineProperty(HTMLImageElement.prototype, "naturalWidth", {
				configurable: true,
				get() {
					return 100;
				},
			});
			Object.defineProperty(HTMLImageElement.prototype, "naturalHeight", {
				configurable: true,
				get() {
					return 100;
				},
			});
			let id = "";
			await act(async () => {
				id = await hookRef.api!.addImageDataUrl(dummyImage1);
			});
			useSlideStore.getState().setSlides([
				{ id: 1, uuid: "s1", width: 1000, height: 1000, durationRatio: 1, joining: true, disabled: false, layers: [] },
			]);
			useSlideStore.getState().setSelectedIndex(0);

			await act(async () => {
				await hookRef.api!.placeImageOnSlide(id);
			});

			const layer = useSlideStore.getState().slides[0].layers[0] as ImageLayer;
			// scale0 == scaleR == 10、scaleR > scale0 は false → 0° 優先
			expect(layer.rotation).toBe(0);
			expect(layer.scaleX).toBe(10);
		});
	});
	});
