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
	useSensitiveSessionStore.setState({ password: null, request: null });
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

const flush = async (n = 6): Promise<void> => {
	for (let i = 0; i < n; i++) {
		await act(async () => {
			await new Promise((r) => setTimeout(r, 0));
		});
	}
};

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
		let loaded: ViewerDocument | null = null;
		await act(async () => {
			loaded = await api.loadByTitle("secret");
		});
		expect(loaded?.isSensitive).toBe(true);
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

	it("sensitive: パスワード入力キャンセルで save は null (保存しない)", async () => {
		useImageLibraryStore.getState().setImageLibrary({ "img-1": "data:x" });
		let saved: { title: string } | null | undefined;
		act(() => {
			api.save(makeDoc({ isSensitive: true }), { override: true }).then((r) => {
				saved = r;
			});
		});
		await flush();
		const req = useSensitiveSessionStore.getState().request;
		expect(req).not.toBeNull(); // 解錠モーダル要求が積まれる
		await act(async () => req?.resolve(null)); // キャンセル
		await flush();
		expect(saved).toBeNull();
	});

	it("sensitive: load 解錠キャンセルはロック状態 (画像空) で doc を返す", async () => {
		useImageLibraryStore.getState().setImageLibrary({ "img-1": "data:image/png;base64,SEC" });
		useSensitiveSessionStore.setState({ password: "pw" });
		await act(async () => {
			await api.save(makeDoc({ isSensitive: true }), { override: true });
		});
		useImageLibraryStore.getState().setImageLibrary({});
		useSensitiveSessionStore.setState({ password: null, request: null }); // PW を忘れた状態

		let loaded: ViewerDocument | null | undefined;
		act(() => {
			api.loadByTitle("secret").then((d) => {
				loaded = d;
			});
		});
		await flush();
		const req = useSensitiveSessionStore.getState().request;
		expect(req).not.toBeNull();
		await act(async () => req?.resolve(null)); // 解錠キャンセル
		await flush();
		expect(loaded?.isSensitive).toBe(true); // doc 構造は読める
		expect(Object.keys(useImageLibraryStore.getState().imageById)).toHaveLength(0); // 画像はロック
	});
});
