import JSZip from "jszip";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { useFileIO, type UseFileIO } from "../../src/hooks/useFileIO";
import { useSensitiveSessionStore } from "../../src/state/sensitiveSessionStore";
import type { Slide } from "../../src/types/Slide";
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
	useSensitiveSessionStore.setState({ password: null, request: null });
	hook = setupHook();
	capture = captureDownloadBlob();
});

afterEach(() => {
	capture.restore();
	hook.teardown();
	useSensitiveSessionStore.setState({ password: null, request: null });
});

const flush = async (n = 6): Promise<void> => {
	for (let i = 0; i < n; i++) {
		await act(async () => {
			await new Promise((r) => setTimeout(r, 0));
		});
	}
};

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
			img1: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkAAIAAAoAAv/lxKUAAAAASUVORK5CYII=",
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

// スライド画像出力 (§4/§10)。jsdom には canvas 2d context / toBlob が無いため、
// 描画自体は no-op スタブで通し、制御フロー (命名 / disabled 除外 / ガード) を検証する。
describe("useFileIO スライド画像出力 (v4 Group D output系)", () => {
	const makeSlide = (id: number, uuid: string, disabled = false): Slide => ({
		id,
		uuid,
		width: 800,
		height: 600,
		durationRatio: 1,
		joining: true,
		disabled,
		layers: [],
	});
	const makeMultiDoc = (title: string): ViewerDocument => ({
		title,
		width: 800,
		height: 600,
		createTime: 0,
		editTime: 0,
		bgColor: "#112233",
		// index 0 有効 / 1 disabled / 2 有効
		slides: [makeSlide(1, "a"), makeSlide(2, "b", true), makeSlide(3, "c")],
	});

	// 元実装を退避し、テスト後に復元する。
	let origGetContext: typeof HTMLCanvasElement.prototype.getContext;
	let origToBlob: typeof HTMLCanvasElement.prototype.toBlob;

	beforeEach(() => {
		origGetContext = HTMLCanvasElement.prototype.getContext;
		origToBlob = HTMLCanvasElement.prototype.toBlob;
		// drawSlideToCanvas が触る API のみ持つ no-op context (CanvasRenderingContext2D 全体は満たさない)。
		const stubCtx = {
			fillStyle: "",
			globalAlpha: 1,
			fillRect: () => {},
			clearRect: () => {},
			scale: () => {},
			translate: () => {},
			rotate: () => {},
			drawImage: () => {},
			resetTransform: () => {},
		};
		HTMLCanvasElement.prototype.getContext = (() =>
			stubCtx) as unknown as typeof HTMLCanvasElement.prototype.getContext;
		// PNG っぽい Blob を返す (中身は検証しない)。
		HTMLCanvasElement.prototype.toBlob = function (cb: BlobCallback): void {
			cb(new Blob(["\x89PNG"], { type: "image/png" }));
		};
	});

	afterEach(() => {
		HTMLCanvasElement.prototype.getContext = origGetContext;
		HTMLCanvasElement.prototype.toBlob = origToBlob;
	});

	it("exportSlidePng: index 0 → '{title}_1.png' を image/png Blob で download", async () => {
		const msg = await hook.api.exportSlidePng(makeMultiDoc("imgexp"), {}, 0);
		expect(msg).toBe("exported: imgexp_1.png");
		const blob = capture.getBlob();
		expect(blob?.type).toBe("image/png");
	});

	it("exportSlidePng: 範囲外 index は throw", async () => {
		await expect(hook.api.exportSlidePng(makeMultiDoc("imgexp"), {}, 9)).rejects.toThrow();
	});

	it("exportAllSlidesZip: 有効スライドのみ、元 index 基準で命名した ZIP を出力", async () => {
		const msg = await hook.api.exportAllSlidesZip(makeMultiDoc("imgexp"), {});
		expect(msg).toBe("exported: imgexp.zip");
		const blob = capture.getBlob();
		expect(blob).not.toBeNull();
		// 生成された zip を読み戻し、disabled(index1) を除いた _1 / _3 のみであることを確認
		const zip = await JSZip.loadAsync(await blob!.arrayBuffer());
		const names = Object.keys(zip.files).sort();
		expect(names).toEqual(["imgexp_1.png", "imgexp_3.png"]);
	});

	it("exportAllSlidesZip: 有効スライドが 0 枚なら throw", async () => {
		const doc = makeMultiDoc("imgexp");
		for (const s of doc.slides) s.disabled = true;
		await expect(hook.api.exportAllSlidesZip(doc, {})).rejects.toThrow();
	});
});

describe("useFileIO sensitive (Phase 4 export/import)", () => {
	const imageMap = { img1: "data:image/png;base64,SECRETpixelsZZZ" };
	const sensitiveDoc = (title: string): ViewerDocument => ({
		...makeDoc(title),
		isSensitive: true,
		slides: [
			{
				id: 1,
				uuid: "u1",
				width: 800,
				height: 600,
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
	});

	it("HVD: sensitive export→import round-trip (暗号化され、同PWで復号)", async () => {
		useSensitiveSessionStore.setState({ password: "pw" });
		const msg = await hook.api.exportHvd(sensitiveDoc("sec"), imageMap);
		expect(msg).toBe("exported: sec.hvd");

		const text = await capture.getBlob()!.text();
		expect(text).not.toContain("SECRETpixels"); // 平文が書き出されない
		expect(text).toContain("imageDataEnc");

		const file = new File([text], "sec.hvd", { type: "application/json" });
		const result = await hook.api.importFile(file);
		expect(result?.imageData.img1).toBe("data:image/png;base64,SECRETpixelsZZZ");
	});

	it("export: パスワード入力キャンセルで null (何も書き出さない)", async () => {
		let msg: string | null | undefined;
		act(() => {
			hook.api.exportHvd(sensitiveDoc("sec"), imageMap).then((m) => {
				msg = m;
			});
		});
		await flush();
		useSensitiveSessionStore.getState().request?.resolve(null); // 解錠キャンセル
		await flush();
		expect(msg).toBeNull();
		expect(capture.getBlob()).toBeNull(); // download されていない
	});

	it("import: 解錠キャンセルはロック状態 (imageData 空) で doc を返す", async () => {
		useSensitiveSessionStore.setState({ password: "pw" });
		await hook.api.exportHvd(sensitiveDoc("sec"), imageMap);
		const text = await capture.getBlob()!.text();
		const file = new File([text], "sec.hvd", { type: "application/json" });

		useSensitiveSessionStore.setState({ password: null, request: null }); // PW を忘れた状態
		let result: Awaited<ReturnType<UseFileIO["importFile"]>> | undefined;
		act(() => {
			hook.api.importFile(file).then((r) => {
				result = r;
			});
		});
		await flush();
		useSensitiveSessionStore.getState().request?.resolve(null); // 解錠キャンセル
		await flush();
		expect(result?.doc.title).toBe("sec");
		expect(Object.keys(result?.imageData ?? {})).toHaveLength(0); // 画像ロック
	});
});
