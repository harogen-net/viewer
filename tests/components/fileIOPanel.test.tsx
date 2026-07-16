import { MantineProvider } from "@mantine/core";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// 保存ファイル前後移動 (◀ / ▶) と未保存ガードの結線テスト。
// useStorage / useFileIO は IDB / ファイル依存のため hoisted mock で差し替える
// (関数 ref を安定させ refreshTitles の effect が無限再実行しないようにする)。

const { listTitlesMock, loadByTitleMock, saveMock, deleteMock, loadThumbnailsMock, getThumbnailMock } =
	vi.hoisted(() => ({
		listTitlesMock: vi.fn(),
		loadByTitleMock: vi.fn(),
		saveMock: vi.fn(),
		deleteMock: vi.fn(),
		loadThumbnailsMock: vi.fn(),
		getThumbnailMock: vi.fn(),
	}));

vi.mock("../../src/hooks/useStorage", () => ({
	useStorage: () => ({
		listTitles: listTitlesMock,
		loadByTitle: loadByTitleMock,
		save: saveMock,
		deleteByTitle: deleteMock,
		loadThumbnails: loadThumbnailsMock,
		getThumbnail: getThumbnailMock,
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

// jsdom UA は非モバイル固定なので isMobile を差し替えられる mock を用意 (test 内で切替可能)。
const { deviceMode } = vi.hoisted(() => ({
	deviceMode: { isMobile: false, isPortrait: false },
}));
vi.mock("../../src/hooks/useDeviceMode", () => ({
	useDeviceMode: () => deviceMode,
}));

import { FileIOPanel } from "../../src/components/panels/FileIOPanel";
import { AlertHost } from "../../src/components/common/AlertHost";
import { generateUniqueTitle } from "../../src/components/panels/fileIO/FileIOSubMenu";
import { useAlertStore } from "../../src/state/alertStore";
import { useImageLibraryStore } from "../../src/state/imageLibraryStore";
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

const render = async (readOnly = false): Promise<void> => {
	await act(async () => {
		root.render(
			<MantineProvider>
				<FileIOPanel readOnly={readOnly} />
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
	loadByTitleMock.mockImplementation(async (title: string) => ({
		status: "ok",
		doc: makeDoc(title),
	}));
	saveMock.mockResolvedValue({ title: "saved-2026" });
	loadThumbnailsMock.mockReset();
	// A はサムネ有り (連結1枚+frames)、B/C は無し
	loadThumbnailsMock.mockResolvedValue({ A: { thumb: "data:image/jpeg;base64,T", frames: 3 } });
	getThumbnailMock.mockReset();
	// 遅延ロード: title 指定で個別取得 (A のみサムネ有り)。
	getThumbnailMock.mockImplementation(async (title: string) =>
		title === "A" ? { thumb: "data:image/jpeg;base64,T", frames: 3 } : null
	);
	// device mode を既定 (PC) に戻す (テストごとに mutate されている可能性を排除)。
	deviceMode.isMobile = false;
	deviceMode.isPortrait = false;
	useAlertStore.getState().clear();
	useViewerDocumentStore.setState({ meta: null, modified: false });
	useSlideStore.getState().setSlides([]);
	useImageLibraryStore.getState().setImageLibrary({});
	container = document.createElement("div");
	document.body.appendChild(container);
	root = createRoot(container);
});

afterEach(() => {
	act(() => root.unmount());
	container.remove();
	// Mantine の Portal (Menu.Dropdown/Modal 等) は document.body 直下に残るため明示除去。
	// 残ると次テストの document.querySelector が古いノードを拾って flake する。
	document
		.querySelectorAll("[data-portal],[data-mantine-portal]")
		.forEach((n) => n.remove());
	useAlertStore.getState().clear();
});

describe("FileIOPanel 保存ファイル前後移動", () => {
	it("未選択時: ◀ は無効、▶ は有効 (▶ で先頭をロード)", async () => {
		await render();
		expect(navBtn("prev")?.disabled).toBe(true);
		expect(navBtn("next")?.disabled).toBe(false);
		click(navBtn("next"));
		await act(async () => {});
		expect(loadByTitleMock).toHaveBeenCalledWith("A", expect.any(Function)); // 先頭
	});

	// 回帰: 1 回の選択でロードは 1 回だけ (FileSelector と親が二重にロードしない)。
	it("ファイル選択でロードは 1 回だけ走る (二重ロードしない)", async () => {
		await render();
		click(navBtn("next")); // → 先頭 "A" を 1 回ロード
		await act(async () => {});
		expect(loadByTitleMock).toHaveBeenCalledTimes(1);
		expect(loadByTitleMock).toHaveBeenCalledWith("A", expect.any(Function));
	});

	it("▶ で次へ、端 (末尾) では ▶ 無効", async () => {
		await render();
		click(navBtn("next")); // → A (index 0)
		await act(async () => {});
		click(navBtn("next")); // → B (index 1)
		await act(async () => {});
		expect(loadByTitleMock).toHaveBeenLastCalledWith("B", expect.any(Function));
		click(navBtn("next")); // → C (index 2、末尾)
		await act(async () => {});
		expect(loadByTitleMock).toHaveBeenLastCalledWith("C", expect.any(Function));
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
		expect(loadByTitleMock).toHaveBeenLastCalledWith("A", expect.any(Function));
	});
});

// 未保存ガードの方針:
//   - ドロップダウン/前後ナビ選択 (handleSelectChange 既定 confirmDiscard=true): modified なら確認。
//   - ピッカーを開く操作 (handleOpenPicker): modified なら確認。
//   - ピッカー内のカード選択 (handlePick → handleSelectChange(_, false)): 開く時に確認済みのため再確認しない。
describe("FileIOPanel 未保存ガード", () => {
	it("選択 (前後ナビ) は modified 時に確認し、キャンセルでロードしない", async () => {
		await render();
		useViewerDocumentStore.setState({ modified: true });
		click(navBtn("next"));
		expect(useAlertStore.getState().request?.kind).toBe("confirm");
		await resolveAlert(false); // キャンセル
		expect(loadByTitleMock).not.toHaveBeenCalled();
	});

	it("選択は modified でも確認 OK ならロードする", async () => {
		await render();
		useViewerDocumentStore.setState({ modified: true });
		click(navBtn("next"));
		await resolveAlert(true); // 破棄して続行
		await act(async () => {});
		expect(loadByTitleMock).toHaveBeenCalledWith("A", expect.any(Function));
	});

	it("modified=false なら確認なしで即ロード", async () => {
		await render();
		click(navBtn("next"));
		await act(async () => {});
		expect(useAlertStore.getState().request).toBeNull(); // 確認は出ない
		expect(loadByTitleMock).toHaveBeenCalledWith("A", expect.any(Function));
	});

	// 開く処理の同期的副作用 = refreshTitles (listTitles) 呼び出しで「開いたか」を判定する
	// (jsdom では Modal の開くトランジションが進まず本文が mount されないため DOM では判定不可)。
	it("ピッカーを開く操作は modified 時に確認し、キャンセルなら開かない", async () => {
		await render();
		listTitlesMock.mockClear();
		useViewerDocumentStore.setState({ modified: true });
		click(container.querySelector<HTMLButtonElement>('[data-action="open-picker"]'));
		expect(useAlertStore.getState().request?.kind).toBe("confirm");
		await resolveAlert(false); // キャンセル
		expect(listTitlesMock).not.toHaveBeenCalled(); // 開く処理が走らない
	});

	it("ピッカーを開く操作は確認 OK なら開く", async () => {
		await render();
		listTitlesMock.mockClear();
		useViewerDocumentStore.setState({ modified: true });
		click(container.querySelector<HTMLButtonElement>('[data-action="open-picker"]'));
		await resolveAlert(true); // 破棄して続行
		await act(async () => {});
		expect(listTitlesMock).toHaveBeenCalled(); // 開く処理 (refreshTitles) が走った
	});

	it("インポートはファイル選択時には確認しない (確認はインポートボタン押下時に移動)", async () => {
		await render();
		useViewerDocumentStore.setState({ modified: true });
		// 隠し file input への change (= ファイル選択完了) では確認を出さない。
		const fileInput = container.querySelector<HTMLInputElement>('input[type="file"]');
		const file = new File(["x"], "a.hvd", { type: "text/plain" });
		Object.defineProperty(fileInput, "files", { value: [file], configurable: true });
		await act(async () => {
			fileInput?.dispatchEvent(new Event("change", { bubbles: true }));
		});
		expect(useAlertStore.getState().request).toBeNull(); // ファイル選択後に確認は出ない
	});
});

describe("FileIOPanel 保存で未保存状態を解除", () => {
	const seedEditedDoc = (): void => {
		act(() => {
			useSlideStore.getState().setSlides([makeSlide()]);
			useViewerDocumentStore.setState({ meta: makeMeta("(new)"), modified: true });
		});
	};

	it("保存 (統合ボタン) 後に modified=false へ戻り、meta.title が保存名に同期される", async () => {
		await render();
		seedEditedDoc();
		// 統合「保存」ボタン。title="(new)" (未命名) なので新規 (採番) 保存になる。
		click(container.querySelector<HTMLButtonElement>('[data-action="save"]'));
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
		expect(loadByTitleMock).toHaveBeenCalledWith("A", expect.any(Function));
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

describe("FileIOPanel ビジュアルピッカー", () => {
	// 開く操作でピッカー (Modal) が表示される結線のみ検証する。サムネは各カードが可視時に
	// getThumbnail で個別遅延ロードする (一括 loadThumbnails は使わない)。カード描画/クリックは
	// documentPickerGrid.test.tsx (Modal 非依存) で担保。
	it("ギャラリーを開くと開く処理が走り、一括 loadThumbnails は呼ばれない (遅延ロード)", async () => {
		await render();
		listTitlesMock.mockClear();
		click(container.querySelector<HTMLButtonElement>('[data-action="open-picker"]'));
		await act(async () => {});
		expect(listTitlesMock).toHaveBeenCalled(); // 開く処理 (refreshTitles) が走った
		expect(loadThumbnailsMock).not.toHaveBeenCalled(); // 一括読みは廃止 (各カードが遅延取得)
	});
});

describe("FileIOPanel ドキュメントを閉じる", () => {
	const closeBtn = (): HTMLButtonElement | null =>
		container.querySelector<HTMLButtonElement>('[data-action="close-document"]');

	it("未保存変更が無ければ確認なしで閉じる (meta=null へ)", async () => {
		await render();
		act(() => {
			useViewerDocumentStore.setState({ meta: makeMeta("A"), modified: false });
			useImageLibraryStore.getState().setImageLibrary({ img1: { dataURL: "data:x" } });
		});
		click(closeBtn());
		await act(async () => {});
		expect(useAlertStore.getState().request).toBeNull(); // 確認は出ない
		expect(useViewerDocumentStore.getState().meta).toBeNull();
		// close で image library もクリア (次に開くドキュメントに画像が持ち越されないよう)。
		expect(useImageLibraryStore.getState().imageById).toEqual({});
	});

	it("未保存変更ありは確認し、キャンセルなら閉じない", async () => {
		await render();
		act(() => {
			useViewerDocumentStore.setState({ meta: makeMeta("A"), modified: true });
		});
		click(closeBtn());
		expect(useAlertStore.getState().request?.kind).toBe("confirm");
		await resolveAlert(false); // キャンセル
		expect(useViewerDocumentStore.getState().meta).not.toBeNull();
	});

	it("未保存変更ありでも確認 OK なら閉じる", async () => {
		await render();
		act(() => {
			useViewerDocumentStore.setState({ meta: makeMeta("A"), modified: true });
		});
		click(closeBtn());
		await resolveAlert(true); // 破棄して閉じる
		await act(async () => {});
		expect(useViewerDocumentStore.getState().meta).toBeNull();
	});
});

describe("FileIOPanel 新規ドキュメント", () => {
	const newBtn = (): HTMLButtonElement | null =>
		container.querySelector<HTMLButtonElement>('[data-action="new"]');

	it("新規作成で image library がクリアされる (前ドキュメントの画像を引き継がない)", async () => {
		await render(false);
		act(() => {
			useViewerDocumentStore.setState({ meta: makeMeta("A"), modified: false });
			useImageLibraryStore
				.getState()
				.setImageLibrary({ img1: { dataURL: "data:x" }, img2: { dataURL: "data:y" } });
		});
		click(newBtn());
		await act(async () => {});
		expect(useImageLibraryStore.getState().imageById).toEqual({});
		expect(useViewerDocumentStore.getState().meta).not.toBeNull(); // 新規 doc が入っている
	});
});

describe("FileIOPanel ドキュメント設定 / 画像ライブラリ トリガ", () => {
	const has = (sel: string): boolean => !!container.querySelector(sel);

	it("編集モード + meta ありで トリガ両ボタンが出る", async () => {
		await render(false);
		act(() => {
			useViewerDocumentStore.setState({ meta: makeMeta("A"), modified: false });
		});
		expect(has("[data-open-doc-settings]")).toBe(true);
		expect(has("[data-open-image-library]")).toBe(true);
	});

	it("readOnly では meta ありでも両ボタンを隠す", async () => {
		await render(true);
		act(() => {
			useViewerDocumentStore.setState({ meta: makeMeta("A"), modified: false });
		});
		expect(has("[data-open-doc-settings]")).toBe(false);
		expect(has("[data-open-image-library]")).toBe(false);
	});
});

describe("FileIOPanel 閲覧モード (readOnly)", () => {
	const has = (sel: string): boolean => !!container.querySelector(sel);

	it("書込系の表トグル (保存/再ロード/削除) を隠し、開く系は残す", async () => {
		await render(true);
		// 表に出ている書込系ボタンは非表示 (新規/保存/インポート/エクスポートは Menu 内 = 既定で
		// dropdown 未マウントのため直接クエリ不可。ここでは表トグルの有無のみ検証する)。
		expect(has('[data-action="save"]')).toBe(false);
		expect(has('[data-action="reload"]')).toBe(false);
		expect(has('[data-action="delete"]')).toBe(false);
		// 開く系は残す
		expect(has('[data-action="open-picker"]')).toBe(true);
		expect(has('[data-file-nav="prev"]')).toBe(true);
		expect(has('[data-file-nav="next"]')).toBe(true);
	});

	it("編集モード (既定) では表の書込系 (保存/削除/再ロード) が出る", async () => {
		await render(false);
		expect(has('[data-action="save"]')).toBe(true);
		expect(has('[data-action="delete"]')).toBe(true);
		expect(has('[data-action="reload"]')).toBe(true);
	});
});

describe("generateUniqueTitle (import 同時保存の衝突回避)", () => {
	it("既存に無ければ base をそのまま返す", () => {
		expect(generateUniqueTitle("fresh", [{ id: 1, title: "A", update: 1 }])).toBe("fresh");
	});

	it("既存と衝突すれば (1)、更に衝突すれば (2)…と採番する", () => {
		const existing = [
			{ id: 1, title: "A", update: 1 },
			{ id: 2, title: "A(1)", update: 2 },
			{ id: 3, title: "A(2)", update: 3 },
		];
		expect(generateUniqueTitle("A", existing)).toBe("A(3)");
	});

	it("空リストなら base をそのまま返す", () => {
		expect(generateUniqueTitle("x", [])).toBe("x");
	});
});

describe("FileIOPanel インポート同時保存", () => {
	// importFile の結果を差し替えるためのセットアップ。
	// mock 対象は hoisted noopFileIO.importFile なので mockImplementationOnce で 1 回だけ差し替える。
	const triggerImport = async (): Promise<void> => {
		const fileInput = container.querySelector<HTMLInputElement>('input[type="file"]');
		const file = new File(["x"], "a.hvd", { type: "text/plain" });
		Object.defineProperty(fileInput, "files", { value: [file], configurable: true });
		await act(async () => {
			fileInput?.dispatchEvent(new Event("change", { bubbles: true }));
		});
	};

	beforeEach(() => {
		// 他 describe の save 呼び出しが calls に混ざらないようクリア。
		saveMock.mockClear();
	});

	it("import 成功時、同名 title 衝突なら (1) サフィックスで save を呼ぶ", async () => {
		// listTitles は [A, B, C] を返す設定 (beforeEach)。同名 "A" を import。
		noopFileIO.importFile.mockImplementationOnce(async () => ({
			doc: makeDoc("A"), // "A" は既存と衝突
			imageData: {},
			imageNames: {},
		}));
		saveMock.mockResolvedValueOnce({ title: "A(1)" });
		await render(false);
		await triggerImport();
		expect(saveMock).toHaveBeenCalled();
		const savedArg = saveMock.mock.calls[0]?.[0];
		expect(savedArg?.title).toBe("A(1)"); // 衝突回避
	});

	it("import 成功時、衝突しなければ元 title のまま save を呼ぶ", async () => {
		noopFileIO.importFile.mockImplementationOnce(async () => ({
			doc: makeDoc("fresh"),
			imageData: {},
			imageNames: {},
		}));
		saveMock.mockResolvedValueOnce({ title: "fresh" });
		await render(false);
		await triggerImport();
		const savedArg = saveMock.mock.calls[0]?.[0];
		expect(savedArg?.title).toBe("fresh");
	});
});

describe("FileIOPanel スマホ限定 ドキュメント削除", () => {
	// Mantine Menu.Dropdown は Portal で document 直下に出るため document から検索。
	const findMenuItem = (dataAction: string): HTMLElement | null =>
		document.querySelector<HTMLElement>(`[data-action="${dataAction}"]`);

	// 「…」トリガ (submenu の ActionIcon) を開く。dropdown が portal でマウントされるのを待つ。
	const openSubMenu = async (): Promise<void> => {
		// FileIOSubMenu の ActionIcon aria-label="その他の操作"
		const trigger = container.querySelector<HTMLButtonElement>('button[aria-label="その他の操作"]');
		expect(trigger).not.toBeNull();
		await act(async () => {
			trigger?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
		});
	};

	beforeEach(() => {
		deviceMode.isMobile = true; // スマホモード有効
		deleteMock.mockClear();
		deleteMock.mockResolvedValue(undefined);
	});

	it("スマホでは削除メニューが表示される (readOnly でも)", async () => {
		await render(true); // readOnly でも出す
		useViewerDocumentStore.setState({ meta: makeMeta("A"), modified: false });
		await openSubMenu();
		expect(findMenuItem("delete-mobile")).not.toBeNull();
	});

	it("PC では削除メニューは表示されない", async () => {
		deviceMode.isMobile = false;
		await render(false);
		useViewerDocumentStore.setState({ meta: makeMeta("A"), modified: false });
		await openSubMenu();
		expect(findMenuItem("delete-mobile")).toBeNull();
	});

	it("削除実行で IDB から削除され、doc/画像がクリアされる", async () => {
		await render(true);
		act(() => {
			useViewerDocumentStore.setState({ meta: makeMeta("A"), modified: false });
			useImageLibraryStore.getState().setImageLibrary({ x: { dataURL: "data:y" } });
		});
		await openSubMenu();
		click(findMenuItem("delete-mobile"));
		await resolveAlert(true); // 確認 OK
		await act(async () => {});
		expect(deleteMock).toHaveBeenCalledWith("A");
		// 画面からドキュメントが消える (setDocument(null) が呼ばれる) — 回帰: 以前はメニュー
		// 削除後も doc が画面に残り「消えていない」ように見えていた。
		expect(useViewerDocumentStore.getState().meta).toBeNull();
		expect(useImageLibraryStore.getState().imageById).toEqual({});
	});

	it("確認キャンセルでは削除しない", async () => {
		await render(true);
		useViewerDocumentStore.setState({ meta: makeMeta("A"), modified: false });
		await openSubMenu();
		click(findMenuItem("delete-mobile"));
		await resolveAlert(false);
		expect(deleteMock).not.toHaveBeenCalled();
		expect(useViewerDocumentStore.getState().meta).not.toBeNull();
	});

	it("未保存 (titles に無い title) では削除メニューが disabled", async () => {
		await render(true);
		useViewerDocumentStore.setState({ meta: makeMeta("unsaved-doc"), modified: false });
		await openSubMenu();
		const item = findMenuItem("delete-mobile") as HTMLButtonElement | null;
		expect(item).not.toBeNull();
		// Mantine Menu.Item の disabled は data-disabled 属性 or aria-disabled で表現される
		expect(
			item?.getAttribute("data-disabled") !== null ||
				item?.getAttribute("aria-disabled") === "true"
		).toBe(true);
	});
});
