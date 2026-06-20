import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { useFileIO, type UseFileIO } from "../../src/hooks/useFileIO";
import type { ViewerDocument } from "../../src/types/ViewerDocument";

// v4 Group B 完了テスト: useFileIO の round-trip 統合 (FileIOPanel 経由相当)。
// downloadBlob は URL.createObjectURL を呼ぶため、これを stub して Blob を捕捉し、
// 同じ Blob を File でラップして importFile に通すことで export → import の往復を
// 1 周回す。これにより storageCodec 単体テスト (tests/storageCodec.test.ts) では
// 検証できない hook 層の組み立て (filename 規約 / 拡張子分岐 / store 戻り値) を担保。

const setupHook = (): { api: UseFileIO; teardown: () => void } => {
	const div = document.createElement("div");
	document.body.appendChild(div);
	const root: Root = createRoot(div);
	let captured: UseFileIO | null = null;
	const Probe = (): null => {
		captured = useFileIO();
		return null;
	};
	act(() => {
		root.render(<Probe />);
	});
	if (!captured) throw new Error("useFileIO api not captured");
	return {
		api: captured,
		teardown: () => {
			act(() => root.unmount());
			div.remove();
		},
	};
};

// URL.createObjectURL を stub し downloadBlob が渡す Blob を捕捉する。
const captureDownloadBlob = (): {
	getBlob: () => Blob | null;
	restore: () => void;
} => {
	let captured: Blob | null = null;
	const originalCreate = URL.createObjectURL;
	const originalRevoke = URL.revokeObjectURL;
	URL.createObjectURL = (obj: Blob | MediaSource): string => {
		if (obj instanceof Blob) captured = obj;
		return "blob:test";
	};
	URL.revokeObjectURL = (): void => {
		/* no-op */
	};
	return {
		getBlob: () => captured,
		restore: () => {
			URL.createObjectURL = originalCreate;
			URL.revokeObjectURL = originalRevoke;
		},
	};
};

const makeDoc = (title: string): ViewerDocument => ({
	title,
	width: 800,
	height: 600,
	createTime: 1000,
	editTime: 2000,
	bgColor: "#ffffff",
	slides: [
		{
			id: 1,
			uuid: "u-1",
			width: 800,
			height: 600,
			durationRatio: 1,
			joining: true,
			disabled: false,
			layers: [],
		},
	],
});

let hook: { api: UseFileIO; teardown: () => void };
let capture: ReturnType<typeof captureDownloadBlob>;

beforeEach(() => {
	hook = setupHook();
	capture = captureDownloadBlob();
});

afterEach(() => {
	capture.restore();
	hook.teardown();
});

describe("useFileIO round-trip (v4 Group B 完了テスト)", () => {
	it("HVD: exportHvd → File → importFile で同 doc を復元", async () => {
		const doc = makeDoc("hvd-doc");
		const msg = await hook.api.exportHvd(doc, {});
		expect(msg).toBe("exported: hvd-doc.hvd");

		const blob = capture.getBlob();
		expect(blob).not.toBeNull();
		const buf = await blob!.arrayBuffer();
		const file = new File([buf], "hvd-doc.hvd", { type: "application/json" });

		const result = await hook.api.importFile(file);
		expect(result).not.toBeNull();
		expect(result?.doc.title).toBe("hvd-doc");
		expect(result?.doc.width).toBe(800);
		expect(result?.doc.height).toBe(600);
		expect(result?.doc.bgColor).toBe("#ffffff");
		expect(result?.doc.slides.length).toBe(1);
		expect(result?.doc.slides[0].id).toBe(1);
	});

	it("HVZ: exportHvz → File → importFile で同 doc を復元", async () => {
		const doc = makeDoc("hvz-doc");
		const msg = await hook.api.exportHvz(doc, {});
		expect(msg).toBe("exported: hvz-doc.hvz");

		const blob = capture.getBlob();
		expect(blob).not.toBeNull();
		const buf = await blob!.arrayBuffer();
		const file = new File([buf], "hvz-doc.hvz", { type: "application/zip" });

		const result = await hook.api.importFile(file);
		expect(result).not.toBeNull();
		expect(result?.doc.title).toBe("hvz-doc");
		expect(result?.doc.slides.length).toBe(1);
	});

	it("PNG: exportPng → File → importFile で同 doc を復元 (filename [hv] prefix も検証)", async () => {
		const doc = makeDoc("png-doc");
		const msg = await hook.api.exportPng(doc, {});
		expect(msg).toBe("exported: [hv]png-doc.png");

		const blob = capture.getBlob();
		expect(blob).not.toBeNull();
		const buf = await blob!.arrayBuffer();
		// legacy 互換: ファイル名先頭の [hv] prefix は importFile 側で剥がされる
		const file = new File([buf], "[hv]png-doc.png", { type: "image/png" });

		const result = await hook.api.importFile(file);
		expect(result).not.toBeNull();
		expect(result?.doc.title).toBe("png-doc");
		expect(result?.doc.slides.length).toBe(1);
	});

	it("未対応拡張子は null を返す", async () => {
		const file = new File(["dummy"], "test.txt", { type: "text/plain" });
		const result = await hook.api.importFile(file);
		expect(result).toBeNull();
	});

	it("imageMap を渡した HVD round-trip で imageData が復元される", async () => {
		// serializeHvd は image layer から参照されている imageId のみ imageData に
		// 含めるため、img1 を参照する layer を持つ doc を用意する。
		const doc: ViewerDocument = {
			...makeDoc("img-doc"),
			slides: [
				{
					id: 1,
					uuid: "u-1",
					width: 800,
					height: 600,
					durationRatio: 1,
					joining: true,
					disabled: false,
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
							type: "image",
							imageId: "img1",
							clipRect: [0, 0, 0, 0],
							isText: false,
						},
					],
				},
			],
		};
		const imageMap = {
			"img1": "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkAAIAAAoAAv/lxKUAAAAASUVORK5CYII=",
		};
		await hook.api.exportHvd(doc, imageMap);

		const blob = capture.getBlob();
		expect(blob).not.toBeNull();
		const buf = await blob!.arrayBuffer();
		const file = new File([buf], "img-doc.hvd", { type: "application/json" });

		const result = await hook.api.importFile(file);
		expect(result).not.toBeNull();
		expect(result?.imageData.img1).toBe(imageMap.img1);
	});
});
