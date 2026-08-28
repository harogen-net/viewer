import { act } from "react";
import { createRoot } from "react-dom/client";
import { beforeEach, describe, expect, it } from "vitest";
import {
	probeLegacyDocs,
	runLegacyMigration,
	useStorage,
	type StorageApi,
} from "../../src/hooks/useStorage";
import { useImageLibraryStore } from "../../src/state/imageLibraryStore";
import { MigrationStatus, useMigrationStore } from "../../src/state/migrationStore";

// 旧形式 (IDB v2) → 新形式 (v3 / docId) の移行 (docs/document-id-plan.md)。
//
// 検証の要は 3 つ:
//   1. 承認前にスキーマを変えない (version が 2 のまま) = 旧版へ戻る退路が残っている
//   2. 承認前でも読み取りはできる (移行前にバックアップを取れる)
//   3. 移行で文書が失われない・二重採番されない
//
// hook の API は Probe コンポーネント経由で取り出す (既存 useStorage.test.tsx と同手法)。

function setupStorage(): { api: StorageApi; teardown: () => void } {
	const div = document.createElement("div");
	document.body.appendChild(div);
	const root = createRoot(div);
	let captured: StorageApi | null = null;
	function Probe(): null {
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

interface LegacySeed {
	title: string;
	data?: string;
	thumb?: string;
}

/** v2 スキーマの DB を手で作ってレコードを流し込む。 */
const seedV2 = (records: LegacySeed[]): Promise<void> =>
	new Promise((resolve, reject) => {
		const req = indexedDB.open("viewer", 2);
		req.onupgradeneeded = () => {
			const db = req.result;
			db.createObjectStore("slideTitles", { keyPath: "id", autoIncrement: true });
			db.createObjectStore("slideData", { keyPath: "title" });
			db.createObjectStore("slideThumbnails", { keyPath: "title" });
		};
		req.onsuccess = () => {
			const db = req.result;
			const tx = db.transaction(["slideTitles", "slideData", "slideThumbnails"], "readwrite");
			records.forEach((r, i) => {
				tx.objectStore("slideTitles").add({ title: r.title, update: 1000 + i });
				if (r.data != null) tx.objectStore("slideData").put({ title: r.title, data: r.data });
				if (r.thumb) {
					tx.objectStore("slideThumbnails").put({ title: r.title, thumb: r.thumb, frames: 3 });
				}
			});
			tx.oncomplete = () => {
				db.close();
				resolve();
			};
			tx.onerror = () => reject(tx.error);
		};
		req.onerror = () => reject(req.error);
	});

/** 現在の DB version (version 指定なしで開く = スキーマを変えない)。 */
const dbVersion = (): Promise<number> =>
	new Promise((resolve, reject) => {
		const req = indexedDB.open("viewer");
		req.onsuccess = () => {
			const v = req.result.version;
			req.result.close();
			resolve(v);
		};
		req.onerror = () => reject(req.error);
	});

const hvd = (extra = ""): string =>
	`{"version":3,${extra}"screen":{"width":800,"height":600},"slideData":[{"id":0,"layers":[]}],"imageData":{}}`;

const wipeDb = (): Promise<void> =>
	new Promise((resolve) => {
		const req = indexedDB.deleteDatabase("viewer");
		req.onsuccess = () => resolve();
		req.onerror = () => resolve();
		req.onblocked = () => resolve();
	});

/** probe → その結果を store へ反映 (実アプリでは LegacyMigrationModal が行う)。 */
const probeAndSet = async (): Promise<number> => {
	const { count, titles } = await probeLegacyDocs();
	useMigrationStore.getState().setProbed(count, titles);
	return count;
};

let storage: { api: StorageApi; teardown: () => void };

beforeEach(async () => {
	await wipeDb();
	// setup.ts は NONE で始めるが、このファイルは移行そのものを見るので未調査から始める。
	useMigrationStore.setState({
		status: MigrationStatus.UNKNOWN,
		legacyCount: 0,
		legacyTitles: [],
		progress: 0,
		error: null,
	});
	useImageLibraryStore.getState().setImageLibrary({});
	storage = setupStorage();
	return () => storage.teardown();
});

describe("probe (調べるだけ)", () => {
	it("旧レコードを数え、**スキーマを変更しない** (version 2 のまま)", async () => {
		await seedV2([{ title: "old-1", data: hvd() }, { title: "old-2", data: hvd() }]);
		expect(await dbVersion()).toBe(2);

		const { count, titles } = await probeLegacyDocs();
		expect(count).toBe(2);
		expect(titles).toEqual(["old-1", "old-2"]);

		// ここが肝: 調べただけでは version が上がらない = 旧版のアプリへ戻れる
		expect(await dbVersion()).toBe(2);
	});

	it("旧データが無ければ NONE (通常運転)", async () => {
		expect(await probeAndSet()).toBe(0);
		expect(useMigrationStore.getState().status).toBe(MigrationStatus.NONE);
	});

	it("空の v2 DB も移行不要と判定する", async () => {
		await seedV2([]);
		expect(await probeAndSet()).toBe(0);
	});
});

describe("承認前 (PENDING) の振る舞い", () => {
	beforeEach(async () => {
		await seedV2([
			{ title: "旧A", data: hvd(), thumb: "data:image/png;base64,AAA" },
			{ title: "旧B", data: hvd() },
		]);
		await probeAndSet();
		expect(useMigrationStore.getState().status).toBe(MigrationStatus.PENDING);
	});

	// 移行前にバックアップを取ってほしいので、読み取りだけは通す。
	// 一覧が空では書き出しようがなく、「後で」が意味を成さない。
	it("一覧・ロード・サムネが旧ストアから読める", async () => {
		const docs = await storage.api.listDocs();
		expect(docs.map((d) => d.title).sort()).toEqual(["旧A", "旧B"]);

		const a = docs.find((d) => d.title === "旧A")!;
		const res = await storage.api.loadById(a.id);
		expect(res.status).toBe("ok");
		if (res.status === "ok") {
			expect(res.doc.title).toBe("旧A");
			expect(res.doc.slides.length).toBe(1);
			// 暫定 id は docId ではない。持ち出すと移行後の本物の ID とぶつかる。
			expect(res.doc.docId).toBeUndefined();
		}
		expect((await storage.api.getThumbnail(a.id))?.thumb).toBe("data:image/png;base64,AAA");
		expect(Object.keys(await storage.api.loadThumbnails())).toEqual([a.id]);
	});

	it("保存・削除はできず、読み書きを通じて version が上がらない", async () => {
		const doc = {
			title: "x",
			width: 8,
			height: 6,
			createTime: 1,
			editTime: 1,
			slides: [],
		};
		expect(await storage.api.save(doc, { override: true })).toBeNull();

		const docs = await storage.api.listDocs();
		await storage.api.deleteById(docs[0].id);
		expect((await storage.api.listDocs()).length).toBe(2); // 消えていない

		expect(await dbVersion()).toBe(2);
	});
});

describe("移行の実行", () => {
	it("承認後に実行すると新形式へ移り、進捗が報告される", async () => {
		await seedV2([
			{ title: "a", data: hvd(), thumb: "data:image/png;base64,T" },
			{ title: "b", data: hvd() },
		]);
		await probeAndSet();

		const seen: number[] = [];
		expect(await runLegacyMigration((f) => seen.push(f))).toBe(2);
		expect(seen).toEqual([0.5, 1]);
		expect(await dbVersion()).toBe(3);

		useMigrationStore.getState().setDone();
		const docs = await storage.api.listDocs();
		expect(docs.map((d) => d.title).sort()).toEqual(["a", "b"]);
		// docId が採番され、ロードすると doc にも入る
		const a = docs.find((d) => d.title === "a")!;
		expect(a.id.length).toBeGreaterThan(10);
		const res = await storage.api.loadById(a.id);
		expect(res.status).toBe("ok");
		if (res.status === "ok") expect(res.doc.docId).toBe(a.id);
		expect((await storage.api.getThumbnail(a.id))?.frames).toBe(3);
	});

	it("本体が docId を持っていれば採番せずそれを使う", async () => {
		await seedV2([{ title: "kept", data: hvd('"docId":"fixed-id-123",') }]);
		await probeAndSet();
		await runLegacyMigration();
		useMigrationStore.getState().setDone();
		expect((await storage.api.listDocs())[0].id).toBe("fixed-id-123");
	});

	it("2 回目の起動で二重採番しない (旧ストアが空になっている)", async () => {
		await seedV2([{ title: "once", data: hvd() }]);
		await probeAndSet();
		await runLegacyMigration();
		useMigrationStore.getState().setDone();
		const first = await storage.api.listDocs();

		// 再起動相当: もう一度 probe すると移行不要になる
		expect(await probeAndSet()).toBe(0);
		useMigrationStore.getState().setDone();
		const second = await storage.api.listDocs();
		expect(second.length).toBe(1);
		expect(second[0].id).toBe(first[0].id);
	});

	it("センシティブ文書は移行時に isSensitive が立つ", async () => {
		await seedV2([
			{
				title: "sec",
				data: '{"version":3,"screen":{"width":8,"height":6},"slideData":[],"isSensitive":true,"security":{},"imageDataEnc":"x"}',
			},
		]);
		await probeAndSet();
		await runLegacyMigration();
		useMigrationStore.getState().setDone();
		expect((await storage.api.listDocs())[0].isSensitive).toBe(true);
	});

	// 本体が欠けた壊れたレコードを捨てると「移行で文書が消えた」に見えるため、一覧だけは移す。
	it("本体の無い一覧レコードも移す (ロードは notfound)", async () => {
		await seedV2([{ title: "broken" }]);
		await probeAndSet();
		expect(await runLegacyMigration()).toBe(1);
		useMigrationStore.getState().setDone();
		const docs = await storage.api.listDocs();
		expect(docs.map((d) => d.title)).toEqual(["broken"]);
		expect((await storage.api.loadById(docs[0].id)).status).toBe("notfound");
	});
});

// 旧 slideTitles は autoIncrement が主キーなので **同名レコードを複数持てる**。
// 実機で踏んだ不具合: title を暫定 id にしていたため id が衝突し、Select が
// "Duplicate options are not supported" で落ちた。
describe("旧一覧に同名レコードがある場合", () => {
	beforeEach(async () => {
		await seedV2([
			{ title: "同名", data: hvd() },
			{ title: "同名" }, // slideData は title キーなので 1 件しか無い
			{ title: "単独", data: hvd() },
		]);
		await probeAndSet();
	});

	it("承認前の暫定 id が衝突しない", async () => {
		const docs = await storage.api.listDocs();
		expect(docs.length).toBe(3);
		expect(new Set(docs.map((d) => d.id)).size).toBe(3);
		expect(docs.filter((d) => d.title === "同名").length).toBe(2);
	});

	it("同名でも id 指定で正しい文書をロードできる", async () => {
		const docs = await storage.api.listDocs();
		for (const d of docs.filter((x) => x.title === "単独")) {
			const res = await storage.api.loadById(d.id);
			expect(res.status).toBe("ok");
			if (res.status === "ok") expect(res.doc.title).toBe("単独");
		}
	});

	it("移行では同名の 2 件目を捨て、本体の無い空文書を作らない", async () => {
		expect(await runLegacyMigration()).toBe(3); // 3 行処理 (1 行は重複として破棄)
		useMigrationStore.getState().setDone();
		const docs = await storage.api.listDocs();
		expect(docs.map((d) => d.title).sort()).toEqual(["単独", "同名"]);
		for (const d of docs) {
			expect((await storage.api.loadById(d.id)).status).toBe("ok");
		}
	});
});
