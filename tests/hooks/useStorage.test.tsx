import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { useStorage, type StorageApi } from "../../src/hooks/useStorage";
import { useImageLibraryStore } from "../../src/state/imageLibraryStore";
import { useLaunchModeStore, LaunchMode } from "../../src/state/launchModeStore";
import type { ViewerDocument } from "../../src/types/ViewerDocument";

// v3 Group B build 3: useStorage hook の単体テスト。
// fake-indexeddb (tests/setup.ts auto-import) 環境で動作。
// hook の API を取り出すため Probe コンポーネントを mount して ref に api を保存する。

function setupStorage(): { api: StorageApi; teardown: () => void } {
	const div = document.createElement("div");
	document.body.appendChild(div);
	const root: Root = createRoot(div);
	let captured: StorageApi | null = null;
	function Probe() {
		captured = useStorage();
		return null;
	}
	act(() => {
		root.render(<Probe />);
	});
	if (!captured) throw new Error("useStorage api not captured");
	return {
		api: captured,
		teardown: () => {
			act(() => root.unmount());
			div.remove();
		},
	};
}

async function resetDb(): Promise<void> {
	return new Promise((resolve, reject) => {
		const req = indexedDB.deleteDatabase("viewer");
		req.onsuccess = () => resolve();
		req.onerror = () => reject(req.error);
		req.onblocked = () => resolve();
	});
}

function makeDoc(title: string, slides = 1): ViewerDocument {
	return {
		title,
		width: 800,
		height: 600,
		createTime: 1000,
		editTime: 2000,
		bgColor: "#ffffff",
		slides: Array.from({ length: slides }, (_, i) => ({
			id: i + 1,
			uuid: `u-${i}`,
			width: 800,
			height: 600,
			durationRatio: 1,
			joining: true,
			disabled: false,
			layers: [],
		})),
	};
}

let storage: { api: StorageApi; teardown: () => void };

beforeEach(async () => {
	await resetDb();
	useImageLibraryStore.getState().setImageLibrary({});
	storage = setupStorage();
});

afterEach(() => {
	storage.teardown();
});

describe("useStorage (v3 Group B build 3)", () => {
	it("空 DB の listDocs は空配列", async () => {
		const docs = await storage.api.listDocs();
		expect(docs).toEqual([]);
	});

	it("save (override) で doc.title が保持され、loadById で同等 doc が戻る", async () => {
		const doc = makeDoc("my-doc", 2);
		const { title, docId } = (await storage.api.save(doc, { override: true }))!;
		expect(title).toBe("my-doc");
		expect(docId).toBeTruthy();

		const res = await storage.api.loadById(docId);
		expect(res.status).toBe("ok");
		if (res.status !== "ok") return;
		expect(res.doc.title).toBe("my-doc");
		expect(res.doc.docId).toBe(docId);
		expect(res.doc.width).toBe(800);
		expect(res.doc.slides.length).toBe(2);
	});

	it("save (override なし) は日付ベースの新タイトルを生成", async () => {
		const doc = makeDoc("ignored", 1);
		const { title } = (await storage.api.save(doc))!;
		// DateUtil.getDateString() の形式 (yyyy-MM-dd_HHmmss 等) のチェックは緩めに
		expect(title).not.toBe("ignored");
		expect(title.length).toBeGreaterThan(0);
	});

	it("save 後の listDocs で 1 件出る、editTime は now で上書き", async () => {
		const before = Date.now();
		const saved = (await storage.api.save(makeDoc("t1"), { override: true }))!;
		const after = Date.now();

		const docs = await storage.api.listDocs();
		expect(docs.length).toBe(1);
		expect(docs[0].title).toBe("t1");
		expect(docs[0].id).toBe(saved.docId);
		expect(docs[0].update).toBeGreaterThanOrEqual(before);
		expect(docs[0].update).toBeLessThanOrEqual(after);

		const res = await storage.api.loadById(saved.docId);
		expect(res.status).toBe("ok");
		if (res.status === "ok") expect(res.doc.editTime).toBeGreaterThanOrEqual(before);
	});

	it("loadById は imageLibraryStore に画像 dataURL を投入する", async () => {
		// 1) doc に image layer 1 枚 + imageLibrary に対応 dataURL を仕込んで save
		useImageLibraryStore.getState().setImageLibrary({
			img1: "data:image/png;base64,AAA=",
		});
		const doc: ViewerDocument = {
			title: "with-img",
			width: 100,
			height: 100,
			createTime: 0,
			editTime: 0,
			slides: [
				{
					id: 1,
					uuid: "s",
					width: 100,
					height: 100,
					durationRatio: 1,
					joining: true,
					disabled: false,
					layers: [
						{
							id: 1,
							uuid: "l",
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
		const saved = (await storage.api.save(doc, { override: true }))!;

		// 2) imageLibrary をクリアしてから loadById で再投入されることを検証
		useImageLibraryStore.getState().setImageLibrary({});
		expect(Object.keys(useImageLibraryStore.getState().imageById).length).toBe(0);

		await storage.api.loadById(saved.docId);
		const library = useImageLibraryStore.getState().imageById;
		expect(library.img1?.dataURL).toBe("data:image/png;base64,AAA=");
	});

	it("deleteById で 1 件だけ消える、該当なし id は no-op", async () => {
		const a = (await storage.api.save(makeDoc("a"), { override: true }))!;
		await storage.api.save(makeDoc("b"), { override: true });

		await storage.api.deleteById(a.docId);
		const docs = await storage.api.listDocs();
		expect(docs.length).toBe(1);
		expect(docs[0].title).toBe("b");
		expect((await storage.api.loadById(a.docId)).status).toBe("notfound");

		await expect(storage.api.deleteById("nonexistent")).resolves.toBeUndefined();
	});

	it("save の thumbnail (連結1枚+frames) が loadThumbnails で取得でき、未指定は欠落", async () => {
		const withThumb = (await storage.api.save(makeDoc("withThumb"), {
			override: true,
			thumbnail: { thumb: "data:image/jpeg;base64,THUMB", frames: 5 },
		}))!;
		const noThumb = (await storage.api.save(makeDoc("noThumb"), { override: true }))!;

		const thumbs = await storage.api.loadThumbnails();
		expect(thumbs[withThumb.docId]).toEqual({ thumb: "data:image/jpeg;base64,THUMB", frames: 5 });
		expect(thumbs[noThumb.docId]).toBeUndefined(); // 未生成は欠落 (UI で n/a)
	});

	it("deleteById はサムネも削除する", async () => {
		const x = (await storage.api.save(makeDoc("x"), {
			override: true,
			thumbnail: { thumb: "data:image/jpeg;base64,T", frames: 3 },
		}))!;
		expect((await storage.api.loadThumbnails())[x.docId]?.frames).toBe(3);
		await storage.api.deleteById(x.docId);
		expect((await storage.api.loadThumbnails())[x.docId]).toBeUndefined();
	});

	// docId ベースになったので「同じ文書か」は title ではなく docId で決まる
	// (docs/document-id-plan.md)。
	it("同じ docId への save は 1 レコードを上書きする", async () => {
		const first = (await storage.api.save(makeDoc("same"), { override: true }))!;

		await storage.api.save({ ...makeDoc("same", 3), docId: first.docId }, { override: true });
		const docs = await storage.api.listDocs();
		expect(docs.length).toBe(1);
		expect(docs[0].id).toBe(first.docId);

		const res = await storage.api.loadById(first.docId);
		expect(res.status).toBe("ok");
		if (res.status === "ok") expect(res.doc.slides.length).toBe(3);
	});

	it("リネームして保存しても docId は変わらず、旧レコードが残らない", async () => {
		const first = (await storage.api.save(makeDoc("before"), { override: true }))!;
		const renamed = (await storage.api.save(
			{ ...makeDoc("after"), docId: first.docId },
			{ override: true }
		))!;
		expect(renamed.docId).toBe(first.docId);

		const docs = await storage.api.listDocs();
		expect(docs.length).toBe(1);
		expect(docs[0].title).toBe("after");
	});

	it("別名で保存 (override なし) は docId を新規採番する", async () => {
		const first = (await storage.api.save(makeDoc("orig"), { override: true }))!;
		const copy = (await storage.api.save({ ...makeDoc("orig"), docId: first.docId }))!;
		expect(copy.docId).not.toBe(first.docId);
		expect((await storage.api.listDocs()).length).toBe(2);
	});

	// title は自由入力の表示名で、一意性を要求しない (docs/document-id-plan.md §6)。
	it("同名の文書を 2 件持て、片方だけ削除できる", async () => {
		const a = (await storage.api.save(makeDoc("dup"), { override: true }))!;
		const b = (await storage.api.save(makeDoc("dup"), { override: true }))!;
		expect(a.docId).not.toBe(b.docId);
		expect((await storage.api.listDocs()).length).toBe(2);

		await storage.api.deleteById(a.docId);
		const rest = await storage.api.listDocs();
		expect(rest.length).toBe(1);
		expect(rest[0].id).toBe(b.docId);
	});
});

// スマホモード (スマホ PWA 自動選択時) での書き込み gate テスト:
// 既定 (allowInViewMode=false) では save/delete が silent no-op になることと、
// allowInViewMode=true では IDB に実際に書かれることを検証する。
describe("useStorage VIEW mode gate (allowInViewMode bypass)", () => {
	beforeEach(() => {
		useLaunchModeStore.setState({ mode: LaunchMode.MOBILE });
	});
	afterEach(() => {
		useLaunchModeStore.setState({ mode: LaunchMode.PC });
	});

	it("スマホモード: save() は 既定で silent no-op (null 返し、IDB に書かれない)", async () => {
		const res = await storage.api.save(makeDoc("blocked"), { override: true });
		expect(res).toBeNull();
		const docs = await storage.api.listDocs();
		expect(docs.find((d) => d.title === "blocked")).toBeUndefined();
	});

	it("スマホモード: allowInViewMode=true なら IDB に実書きされる", async () => {
		const res = await storage.api.save(makeDoc("allowed"), { override: true, allowInViewMode: true });
		expect(res?.title).toBe("allowed");
		const docs = await storage.api.listDocs();
		expect(docs.some((d) => d.title === "allowed")).toBe(true);
	});

	it("スマホモード: deleteById() は 既定で silent no-op (IDB のレコードが残る)", async () => {
		// PC で seed してから スマホ に切替え (beforeEach で スマホ になっているので戻す)。
		useLaunchModeStore.setState({ mode: LaunchMode.PC });
		const keep = (await storage.api.save(makeDoc("keep-me"), { override: true }))!;
		useLaunchModeStore.setState({ mode: LaunchMode.MOBILE });
		await storage.api.deleteById(keep.docId);
		const docs = await storage.api.listDocs();
		expect(docs.some((d) => d.title === "keep-me")).toBe(true); // gate で 次の 削除 は スキップされる
	});

	it("スマホモード: allowInViewMode=true なら IDB から実除かれる", async () => {
		useLaunchModeStore.setState({ mode: LaunchMode.PC });
		const purge = (await storage.api.save(makeDoc("purge"), { override: true }))!;
		useLaunchModeStore.setState({ mode: LaunchMode.MOBILE });
		await storage.api.deleteById(purge.docId, { allowInViewMode: true });
		const docs = await storage.api.listDocs();
		expect(docs.find((d) => d.title === "purge")).toBeUndefined();
	});
});
