import { MantineProvider } from "@mantine/core";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// 保存ファイル前後移動 (◀ / ▶) と未保存ガードの結線テスト。
// useStorage / useFileIO は IDB / ファイル依存のため hoisted mock で差し替える
// (関数 ref を安定させ refreshTitles の effect が無限再実行しないようにする)。

const { listTitlesMock, loadByTitleMock, saveMock, deleteMock } = vi.hoisted(() => ({
	listTitlesMock: vi.fn(),
	loadByTitleMock: vi.fn(),
	saveMock: vi.fn(),
	deleteMock: vi.fn(),
}));

vi.mock("../../src/hooks/useStorage", () => ({
	useStorage: () => ({
		listTitles: listTitlesMock,
		loadByTitle: loadByTitleMock,
		save: saveMock,
		deleteByTitle: deleteMock,
	}),
}));

const { noopFileIO } = vi.hoisted(() => ({
	noopFileIO: {
		exportHvd: vi.fn(async () => ""),
		exportHvz: vi.fn(async () => ""),
		exportPng: vi.fn(async () => ""),
		importFile: vi.fn(async () => null),
		exportSlidePng: vi.fn(async () => ""),
		exportAllSlidesZip: vi.fn(async () => ""),
	},
}));
vi.mock("../../src/hooks/useFileIO", () => ({ useFileIO: () => noopFileIO }));

import { FileIOPanel } from "../../src/components/panels/FileIOPanel";
import { AlertHost } from "../../src/components/common/AlertHost";
import { useAlertStore } from "../../src/state/alertStore";
import { useSlideStore } from "../../src/state/slideStore";
import { useViewerDocumentStore } from "../../src/state/viewerDocumentStore";
import type { Slide } from "../../src/types/Slide";
import { createNewViewerDocument } from "../../src/utils/viewerDocumentFactory";

const makeDoc = (title: string) => ({ ...createNewViewerDocument(), title });
const makeMeta = (title: string) => {
	const { slides: _s, ...meta } = makeDoc(title);
	return meta;
};
const makeSlide = (): Slide => ({
	id: 1,
	uuid: "s1",
	width: 800,
	height: 600,
	durationRatio: 1,
	joining: true,
	disabled: false,
	layers: [],
});

let container: HTMLDivElement;
let root: Root;

const navBtn = (dir: "prev" | "next"): HTMLButtonElement | null =>
	container.querySelector<HTMLButtonElement>(`[data-file-nav="${dir}"]`);

const click = (el: HTMLElement | null): void => {
	act(() => {
		el?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
	});
};

// pending な confirm を store 経由で解決する (Mantine Modal の portal flake 回避)。
const resolveAlert = async (value: boolean): Promise<void> => {
	await act(async () => {
		useAlertStore.getState().request?.resolve(value);
	});
};

const render = async (): Promise<void> => {
	await act(async () => {
		root.render(
			<MantineProvider>
				<FileIOPanel />
				<AlertHost />
			</MantineProvider>
		);
	});
	// 初回 refreshTitles (effect) の解決を待つ
	await act(async () => {});
};

beforeEach(() => {
	listTitlesMock.mockReset();
	loadByTitleMock.mockReset();
	// update 降順で A(3) > B(2) > C(1) になる一覧
	listTitlesMock.mockResolvedValue([
		{ id: 1, title: "A", update: 3 },
		{ id: 2, title: "B", update: 2 },
		{ id: 3, title: "C", update: 1 },
	]);
	loadByTitleMock.mockImplementation(async (title: string) => makeDoc(title));
	saveMock.mockResolvedValue({ title: "saved-2026" });
	useAlertStore.getState().clear();
	useViewerDocumentStore.setState({ meta: null, modified: false });
	useSlideStore.getState().setSlides([]);
	container = document.createElement("div");
	document.body.appendChild(container);
	root = createRoot(container);
});

afterEach(() => {
	act(() => root.unmount());
	container.remove();
	useAlertStore.getState().clear();
});

describe("FileIOPanel 保存ファイル前後移動", () => {
	it("未選択時: ◀ は無効、▶ は有効 (▶ で先頭をロード)", async () => {
		await render();
		expect(navBtn("prev")?.disabled).toBe(true);
		expect(navBtn("next")?.disabled).toBe(false);
		click(navBtn("next"));
		await act(async () => {});
		expect(loadByTitleMock).toHaveBeenCalledWith("A"); // 先頭
	});

	it("▶ で次へ、端 (末尾) では ▶ 無効", async () => {
		await render();
		click(navBtn("next")); // → A (index 0)
		await act(async () => {});
		click(navBtn("next")); // → B (index 1)
		await act(async () => {});
		expect(loadByTitleMock).toHaveBeenLastCalledWith("B");
		click(navBtn("next")); // → C (index 2、末尾)
		await act(async () => {});
		expect(loadByTitleMock).toHaveBeenLastCalledWith("C");
		expect(navBtn("next")?.disabled).toBe(true); // 末尾で無効
		expect(navBtn("prev")?.disabled).toBe(false);
	});

	it("◀ で前へ戻れる", async () => {
		await render();
		click(navBtn("next")); // A
		await act(async () => {});
		click(navBtn("next")); // B
		await act(async () => {});
		click(navBtn("prev")); // A
		await act(async () => {});
		expect(loadByTitleMock).toHaveBeenLastCalledWith("A");
	});
});

describe("FileIOPanel 未保存ガード", () => {
	it("modified 時は確認し、キャンセルでロードしない", async () => {
		await render();
		useViewerDocumentStore.setState({ modified: true });
		click(navBtn("next"));
		// confirm が pending になっている
		expect(useAlertStore.getState().request?.kind).toBe("confirm");
		await resolveAlert(false); // キャンセル
		expect(loadByTitleMock).not.toHaveBeenCalled();
	});

	it("modified 時でも確認 OK ならロードする", async () => {
		await render();
		useViewerDocumentStore.setState({ modified: true });
		click(navBtn("next"));
		await resolveAlert(true); // 破棄して続行
		await act(async () => {});
		expect(loadByTitleMock).toHaveBeenCalledWith("A");
	});

	it("modified=false なら確認なしで即ロード", async () => {
		await render();
		click(navBtn("next"));
		await act(async () => {});
		expect(useAlertStore.getState().request).toBeNull(); // 確認は出ない
		expect(loadByTitleMock).toHaveBeenCalledWith("A");
	});
});

describe("FileIOPanel 保存で未保存状態を解除", () => {
	const seedEditedDoc = (): void => {
		act(() => {
			useSlideStore.getState().setSlides([makeSlide()]);
			useViewerDocumentStore.setState({ meta: makeMeta("(new)"), modified: true });
		});
	};

	it("保存 (新規) 後に modified=false へ戻り、meta.title が保存名に同期される", async () => {
		await render();
		seedEditedDoc();
		click(container.querySelector<HTMLButtonElement>('[data-action="save-new"]'));
		await act(async () => {});
		expect(saveMock).toHaveBeenCalled();
		const s = useViewerDocumentStore.getState();
		expect(s.modified).toBe(false);
		expect(s.meta?.title).toBe("saved-2026");
	});
});

describe("FileIOPanel 再読み込み (元に戻す)", () => {
	it("保存済み + 未保存変更ありで有効、確認 OK で同一 title を再ロード", async () => {
		await render();
		// 現在 document を保存済み title "A" (一覧に存在) + 未保存状態にする
		act(() => {
			useViewerDocumentStore.setState({ meta: makeMeta("A"), modified: true });
		});
		const btn = container.querySelector<HTMLButtonElement>('[data-action="reload"]');
		expect(btn?.disabled).toBe(false);
		click(btn);
		expect(useAlertStore.getState().request?.kind).toBe("confirm");
		await resolveAlert(true);
		await act(async () => {});
		expect(loadByTitleMock).toHaveBeenCalledWith("A");
	});

	it("確認キャンセルでは再ロードしない", async () => {
		await render();
		act(() => {
			useViewerDocumentStore.setState({ meta: makeMeta("A"), modified: true });
		});
		click(container.querySelector<HTMLButtonElement>('[data-action="reload"]'));
		await resolveAlert(false);
		expect(loadByTitleMock).not.toHaveBeenCalled();
	});

	it("未保存変更が無ければ無効", async () => {
		await render();
		act(() => {
			useViewerDocumentStore.setState({ meta: makeMeta("A"), modified: false });
		});
		expect(container.querySelector<HTMLButtonElement>('[data-action="reload"]')?.disabled).toBe(
			true
		);
	});

	it("未保存でも保存されていない title なら無効 ((new) は一覧に無い)", async () => {
		await render();
		act(() => {
			useViewerDocumentStore.setState({ meta: makeMeta("(new)"), modified: true });
		});
		expect(container.querySelector<HTMLButtonElement>('[data-action="reload"]')?.disabled).toBe(
			true
		);
	});
});
