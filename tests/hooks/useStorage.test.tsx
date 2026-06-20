import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { useStorage, type StorageApi } from "../../src/hooks/useStorage";
import { useImageLibraryStore } from "../../src/state/imageLibraryStore";
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
	it("空 DB の listTitles は空配列", async () => {
		const titles = await storage.api.listTitles();
		expect(titles).toEqual([]);
	});

	it("save (override) で doc.title が保持され、loadByTitle で同等 doc が戻る", async () => {
		const doc = makeDoc("my-doc", 2);
		const { title } = await storage.api.save(doc, { override: true });
		expect(title).toBe("my-doc");

		const loaded = await storage.api.loadByTitle("my-doc");
		expect(loaded).not.toBeNull();
		expect(loaded?.title).toBe("my-doc");
		expect(loaded?.width).toBe(800);
		expect(loaded?.slides.length).toBe(2);
	});

	it("save (override なし) は日付ベースの新タイトルを生成", async () => {
		const doc = makeDoc("ignored", 1);
		const { title } = await storage.api.save(doc);
		// DateUtil.getDateString() の形式 (yyyy-MM-dd_HHmmss 等) のチェックは緩めに
		expect(title).not.toBe("ignored");
		expect(title.length).toBeGreaterThan(0);
	});

	it("save 後の listTitles で 1 件出る、editTime は now で上書き", async () => {
		const before = Date.now();
		await storage.api.save(makeDoc("t1"), { override: true });
		const after = Date.now();

		const titles = await storage.api.listTitles();
		expect(titles.length).toBe(1);
		expect(titles[0].title).toBe("t1");
		expect(titles[0].update).toBeGreaterThanOrEqual(before);
		expect(titles[0].update).toBeLessThanOrEqual(after);

		const loaded = await storage.api.loadByTitle("t1");
		expect(loaded?.editTime).toBeGreaterThanOrEqual(before);
	});

	it("loadByTitle は imageLibraryStore に画像 dataURL を投入する", async () => {
		// 1) doc に image layer 1 枚 + imageLibrary に対応 dataURL を仕込んで save
		useImageLibraryStore.getState().setImageLibrary({
			"img1": "data:image/png;base64,AAA=",
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
		await storage.api.save(doc, { override: true });

		// 2) imageLibrary をクリアしてから loadByTitle で再投入されることを検証
		useImageLibraryStore.getState().setImageLibrary({});
		expect(Object.keys(useImageLibraryStore.getState().imageById).length).toBe(0);

		await storage.api.loadByTitle("with-img");
		const library = useImageLibraryStore.getState().imageById;
		expect(library.img1?.dataURL).toBe("data:image/png;base64,AAA=");
	});

	it("deleteByTitle で title が消える、該当なし title は no-op", async () => {
		await storage.api.save(makeDoc("a"), { override: true });
		await storage.api.save(makeDoc("b"), { override: true });

		await storage.api.deleteByTitle("a");
		const titles = await storage.api.listTitles();
		expect(titles.length).toBe(1);
		expect(titles[0].title).toBe("b");
		expect(await storage.api.loadByTitle("a")).toBeNull();

		await expect(storage.api.deleteByTitle("nonexistent")).resolves.toBeUndefined();
	});

	it("同一 title への save は id 維持で上書き", async () => {
		await storage.api.save(makeDoc("same"), { override: true });
		const t1 = await storage.api.listTitles();
		const id1 = t1[0].id;

		await storage.api.save(makeDoc("same", 3), { override: true });
		const t2 = await storage.api.listTitles();
		expect(t2.length).toBe(1);
		expect(t2[0].id).toBe(id1);

		const loaded = await storage.api.loadByTitle("same");
		expect(loaded?.slides.length).toBe(3);
	});
});
