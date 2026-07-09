import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { type StorageApi, useStorage } from "../../src/hooks/useStorage";
import { useImageLibraryStore } from "../../src/state/imageLibraryStore";
import { useSensitiveSessionStore } from "../../src/state/sensitiveSessionStore";
import type { Slide } from "../../src/types/Slide";
import type { ViewerDocument } from "../../src/types/ViewerDocument";

// Phase 4: useStorage の save/load に暗号化/復号を結線 (jsdom で実 crypto.subtle + fake-indexeddb)。
// セッションパスワードは store へ直接セットしてモーダルを回避する。

let api: StorageApi;
let root: Root;
let div: HTMLDivElement;

const mount = (): void => {
	div = document.createElement("div");
	document.body.appendChild(div);
	root = createRoot(div);
	const Probe = (): null => {
		api = useStorage();
		return null;
	};
	act(() => root.render(<Probe />));
};

const makeSlide = (): Slide => ({
	id: 1,
	uuid: "s1",
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
			imageId: "img-1",
			clipRect: [0, 0, 0, 0],
			isText: false,
		},
	],
});

const makeDoc = (over: Partial<ViewerDocument> = {}): ViewerDocument => ({
	title: "secret",
	width: 800,
	height: 600,
	createTime: 1,
	editTime: 2,
	slides: [makeSlide()],
	...over,
});

const resetStores = (): void => {
	useImageLibraryStore.setState({ imageById: {} });
	useSensitiveSessionStore.setState({ password: null });
};

const deleteDb = (): Promise<void> =>
	new Promise((res) => {
		const r = indexedDB.deleteDatabase("viewer");
		r.onsuccess = () => res();
		r.onerror = () => res();
		r.onblocked = () => res();
	});

// slideData ストアの生 JSON を直接読む (暗号化を検査するため)。
const readStoredJson = (title: string): Promise<string> =>
	new Promise((resolve, reject) => {
		const open = indexedDB.open("viewer", 2);
		open.onsuccess = () => {
			const db = open.result;
			const g = db.transaction("slideData", "readonly").objectStore("slideData").get(title);
			g.onsuccess = () => {
				resolve((g.result as { data?: string } | undefined)?.data ?? "");
				db.close();
			};
			g.onerror = () => reject(g.error);
		};
		open.onerror = () => reject(open.error);
	});

// title レコードから isSensitive を消して「変更前に保存された旧レコード」を再現する。
const stripTitleFlag = (title: string): Promise<void> =>
	new Promise((resolve, reject) => {
		const open = indexedDB.open("viewer", 2);
		open.onsuccess = () => {
			const db = open.result;
			const tx = db.transaction("slideTitles", "readwrite");
			const store = tx.objectStore("slideTitles");
			const g = store.getAll();
			g.onsuccess = () => {
				for (const rec of g.result as Array<{ title: string; isSensitive?: boolean }>) {
					if (rec.title === title) {
						delete rec.isSensitive;
						store.put(rec);
					}
				}
			};
			tx.oncomplete = () => {
				db.close();
				resolve();
			};
			tx.onerror = () => reject(tx.error);
		};
		open.onerror = () => reject(open.error);
	});

beforeEach(async () => {
	await deleteDb();
	resetStores();
	mount();
});

afterEach(() => {
	act(() => root.unmount());
	div.remove();
	resetStores();
});

describe("useStorage sensitive (Phase 4 結線)", () => {
	it("sensitive: 暗号化保存し、同一 PW の load で復号して imageLibrary に戻す", async () => {
		useImageLibraryStore.getState().setImageLibrary({ "img-1": "data:image/png;base64,SECRETpixels" });
		useSensitiveSessionStore.setState({ password: "pw" }); // セッションPW = モーダル不要
		let saved: { title: string } | null = null;
		await act(async () => {
			saved = await api.save(makeDoc({ isSensitive: true }), { override: true });
		});
		expect(saved).not.toBeNull();

		const raw = await readStoredJson("secret");
		expect(raw).not.toContain("SECRETpixels"); // 平文が保存されていない
		expect(raw).toContain("imageDataEnc");

		useImageLibraryStore.getState().setImageLibrary({}); // クリアしてから load
		let res: Awaited<ReturnType<typeof api.loadByTitle>> | undefined;
		await act(async () => {
			res = await api.loadByTitle("secret");
		});
		expect(res?.status).toBe("ok");
		if (res?.status === "ok") expect(res.doc.isSensitive).toBe(true);
		expect(useImageLibraryStore.getState().imageById["img-1"]?.dataURL).toBe(
			"data:image/png;base64,SECRETpixels"
		);
	});

	it("非 sensitive: 従来通り平文で保存・ロードされる (回帰)", async () => {
		useImageLibraryStore.getState().setImageLibrary({ "img-1": "data:plainDATA" });
		await act(async () => {
			await api.save(makeDoc({ isSensitive: false }), { override: true });
		});
		const raw = await readStoredJson("secret");
		expect(raw).toContain("data:plainDATA");

		useImageLibraryStore.getState().setImageLibrary({});
		await act(async () => {
			await api.loadByTitle("secret");
		});
		expect(useImageLibraryStore.getState().imageById["img-1"]?.dataURL).toBe("data:plainDATA");
	});

	it("sensitive: パスワード欄が未入力なら save は null (保存中止)", async () => {
		useImageLibraryStore.getState().setImageLibrary({ "img-1": "data:x" });
		useSensitiveSessionStore.setState({ password: null }); // box 未入力
		let saved: { title: string } | null = null;
		await act(async () => {
			saved = await api.save(makeDoc({ isSensitive: true }), { override: true });
		});
		expect(saved).toBeNull();
	});

	it("save で isSensitive が一覧レコードに保存される (ピッカー 🔒 標示用)", async () => {
		useSensitiveSessionStore.setState({ password: "pw" });
		await act(async () => {
			await api.save(makeDoc({ isSensitive: true }), { override: true });
		});
		const titles = await api.listTitles();
		expect(titles.find((t) => t.title === "secret")?.isSensitive).toBe(true);
	});

	it("backfill: 旧レコード(isSensitive 未記録)でも listTitles が slideData から復元する", async () => {
		useSensitiveSessionStore.setState({ password: "pw" });
		await act(async () => {
			await api.save(makeDoc({ isSensitive: true }), { override: true });
		});
		await stripTitleFlag("secret"); // 変更前の旧レコード状態を再現
		const titles = await api.listTitles(); // ここで backfill されるはず
		expect(titles.find((t) => t.title === "secret")?.isSensitive).toBe(true);
		// 永続化も確認 (2 回目も true、backfill が書き戻されている)
		const again = await api.listTitles();
		expect(again.find((t) => t.title === "secret")?.isSensitive).toBe(true);
	});

	it("非 sensitive は isSensitive=false で一覧保存される", async () => {
		await act(async () => {
			await api.save(makeDoc({ isSensitive: false }), { override: true });
		});
		const titles = await api.listTitles();
		expect(titles.find((t) => t.title === "secret")?.isSensitive).toBe(false);
	});

	it("sensitive: load 時に box が誤りなら locked を返しロード中止 (現状維持・画像なし文書を出さない)", async () => {
		useImageLibraryStore.getState().setImageLibrary({ "img-1": "data:image/png;base64,SEC" });
		useSensitiveSessionStore.setState({ password: "pw" });
		await act(async () => {
			await api.save(makeDoc({ isSensitive: true }), { override: true });
		});
		// 「現在開いている文書」の画像を入れておく (誤PWロードでこれが消えないことを確認)
		useImageLibraryStore.getState().setImageLibrary({ current: "data:current" });
		useSensitiveSessionStore.setState({ password: "wrong" }); // box に誤ったPW

		let res: Awaited<ReturnType<typeof api.loadByTitle>> | undefined;
		await act(async () => {
			res = await api.loadByTitle("secret");
		});
		expect(res?.status).toBe("locked"); // ロード中止 (画像なし文書を出さない)
		// store は触られず、現文書の画像が保持される
		expect(useImageLibraryStore.getState().imageById.current?.dataURL).toBe("data:current");
	});
});
