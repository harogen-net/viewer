import { MantineProvider } from "@mantine/core";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { SlideListPanel } from "../../src/components/panels/SlideListPanel";
import { useAlertStore } from "../../src/state/alertStore";
import { useSlideStore } from "../../src/state/slideStore";
import { useViewerDocumentStore } from "../../src/state/viewerDocumentStore";
import type { Slide } from "../../src/types/Slide";
import type { ViewerDocument } from "../../src/types/ViewerDocument";

// v4 Group C build C-3: SlideListPanel 基本形のテスト (一覧表示 + 選択 + 視覚状態)。

const makeSlide = (id: number, uuid: string, overrides: Partial<Slide> = {}): Slide => ({
	id,
	uuid,
	width: 800,
	height: 600,
	durationRatio: 1,
	joining: true,
	disabled: false,
	layers: [],
	...overrides,
});

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
	useSlideStore.getState().setSlides([]);
	useViewerDocumentStore.getState().setDocument(null);
	useAlertStore.getState().clear();
	container = document.createElement("div");
	document.body.appendChild(container);
	root = createRoot(container);
});

afterEach(() => {
	act(() => root.unmount());
	container.remove();
});

// useAlert (モーダル) は非同期。ハンドラが積んだ pending リクエストを store 経由で resolve する。
const resolveAlert = async (value: boolean | string | null): Promise<void> => {
	await act(async () => {
		useAlertStore.getState().request?.resolve(value);
	});
};

const render = (readOnly = false, wrap = false): void => {
	act(() => {
		root.render(
			<MantineProvider>
				<SlideListPanel readOnly={readOnly} wrap={wrap} />
			</MantineProvider>
		);
	});
};

describe("SlideListPanel (v4 Group C build C-3)", () => {
	it("slides 空のとき empty メッセージを表示", () => {
		render();
		expect(container.textContent).toContain("スライドがありません");
	});

	it("3 slides で 3 個の thumb item が data-slide-index 付きで描画される", () => {
		useSlideStore.getState().setSlides([makeSlide(1, "a"), makeSlide(2, "b"), makeSlide(3, "c")]);
		render();
		const items = container.querySelectorAll<HTMLElement>("[data-slide-index]");
		expect(items.length).toBe(3);
		expect(items[0].getAttribute("data-slide-index")).toBe("0");
		expect(items[2].getAttribute("data-slide-index")).toBe("2");
	});

	it("選択中 slide は data-selected=true、それ以外は false", () => {
		useSlideStore.getState().setSlides([makeSlide(1, "a"), makeSlide(2, "b")]);
		useSlideStore.getState().setSelectedIndex(1);
		render();
		const items = container.querySelectorAll<HTMLElement>("[data-slide-index]");
		expect(items[0].getAttribute("data-selected")).toBe("false");
		expect(items[1].getAttribute("data-selected")).toBe("true");
	});

	it("disabled slide は data-disabled=true、opacity が下がる", () => {
		useSlideStore
			.getState()
			.setSlides([makeSlide(1, "a", { disabled: false }), makeSlide(2, "b", { disabled: true })]);
		render();
		const items = container.querySelectorAll<HTMLElement>("[data-slide-index]");
		expect(items[0].getAttribute("data-disabled")).toBe("false");
		expect(items[1].getAttribute("data-disabled")).toBe("true");
		expect(items[1].style.opacity).toBe("0.35");
	});

	it("thumb クリックで selectedIndex が変わる", () => {
		useSlideStore.getState().setSlides([makeSlide(1, "a"), makeSlide(2, "b"), makeSlide(3, "c")]);
		render();
		const items = container.querySelectorAll<HTMLElement>("[data-slide-index]");
		act(() => {
			items[2].dispatchEvent(new MouseEvent("click", { bubbles: true }));
		});
		expect(useSlideStore.getState().selectedIndex).toBe(2);
	});

	it("joining=true で接続線 (data-join=true) が隣接間に出る", () => {
		useSlideStore
			.getState()
			.setSlides([
				makeSlide(1, "a", { joining: true }),
				makeSlide(2, "b", { joining: false }),
				makeSlide(3, "c"),
			]);
		render();
		const joins = container.querySelectorAll<HTMLElement>("[data-join]");
		// 末尾以外の slide 数 = 2 個の indicator
		expect(joins.length).toBe(2);
		expect(joins[0].getAttribute("data-join")).toBe("true");
		expect(joins[1].getAttribute("data-join")).toBe("false");
	});

	it("末尾 slide の後ろには join indicator が出ない", () => {
		useSlideStore.getState().setSlides([makeSlide(1, "a")]);
		render();
		const joins = container.querySelectorAll<HTMLElement>("[data-join]");
		expect(joins.length).toBe(0);
	});

	it("選択未設定 (-1) なら status text に '/ selected' が出ない", () => {
		useSlideStore.getState().setSlides([makeSlide(1, "a")]);
		render();
		expect(container.textContent).toContain("1 slides");
		expect(container.textContent).not.toContain("selected:");
	});

	it("選択あり時は selected #N を表示 (1-indexed)", () => {
		useSlideStore.getState().setSlides([makeSlide(1, "a"), makeSlide(2, "b")]);
		useSlideStore.getState().setSelectedIndex(1);
		render();
		expect(container.textContent).toContain("selected: #2");
	});

	describe("前後移動ボタン (C-4)", () => {
		const getPrevBtn = (): HTMLButtonElement | null =>
			container.querySelector<HTMLButtonElement>("[data-action='move-prev']");
		const getNextBtn = (): HTMLButtonElement | null =>
			container.querySelector<HTMLButtonElement>("[data-action='move-next']");

		it("未選択時は前後ボタン両方 disabled", () => {
			useSlideStore.getState().setSlides([makeSlide(1, "a"), makeSlide(2, "b")]);
			render();
			expect(getPrevBtn()?.disabled).toBe(true);
			expect(getNextBtn()?.disabled).toBe(true);
		});

		it("先頭選択 (index=0) で 前 disabled / 後 enabled", () => {
			useSlideStore.getState().setSlides([makeSlide(1, "a"), makeSlide(2, "b")]);
			useSlideStore.getState().setSelectedIndex(0);
			render();
			expect(getPrevBtn()?.disabled).toBe(true);
			expect(getNextBtn()?.disabled).toBe(false);
		});

		it("末尾選択で 前 enabled / 後 disabled", () => {
			useSlideStore.getState().setSlides([makeSlide(1, "a"), makeSlide(2, "b")]);
			useSlideStore.getState().setSelectedIndex(1);
			render();
			expect(getPrevBtn()?.disabled).toBe(false);
			expect(getNextBtn()?.disabled).toBe(true);
		});

		it("後ボタンクリックで selected を 1 つ後ろに移動 + uuid 追従", () => {
			useSlideStore.getState().setSlides([makeSlide(1, "a"), makeSlide(2, "b"), makeSlide(3, "c")]);
			useSlideStore.getState().setSelectedIndex(0); // "a"
			render();
			act(() => {
				getNextBtn()?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
			});
			const s = useSlideStore.getState();
			expect(s.slides.map((x) => x.uuid)).toEqual(["b", "a", "c"]);
			expect(s.selectedIndex).toBe(1); // "a" は 0 → 1 へ
		});

		it("前ボタンクリックで selected を 1 つ前に移動", () => {
			useSlideStore.getState().setSlides([makeSlide(1, "a"), makeSlide(2, "b"), makeSlide(3, "c")]);
			useSlideStore.getState().setSelectedIndex(2); // "c"
			render();
			act(() => {
				getPrevBtn()?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
			});
			const s = useSlideStore.getState();
			expect(s.slides.map((x) => x.uuid)).toEqual(["a", "c", "b"]);
			expect(s.selectedIndex).toBe(1); // "c" は 2 → 1 へ
		});
	});

	describe("DnD 配線 (C-4)", () => {
		it("SortableSlideThumb がエラーなく render される (data-sortable-id 付与)", () => {
			useSlideStore.getState().setSlides([makeSlide(1, "a"), makeSlide(2, "b")]);
			render();
			const sortables = container.querySelectorAll<HTMLElement>("[data-sortable-id]");
			expect(sortables.length).toBe(2);
			expect(sortables[0].getAttribute("data-sortable-id")).toBe("a");
			expect(sortables[1].getAttribute("data-sortable-id")).toBe("b");
		});
	});

	describe("追加 / 複製 / 削除ボタン (C-5)", () => {
		const seedDoc = (slides: Slide[] = [], selectedIndex = -1): void => {
			const doc: ViewerDocument = {
				title: "test",
				width: 1280,
				height: 720,
				createTime: 0,
				editTime: 0,
				slides,
			};
			useViewerDocumentStore.getState().setDocument(doc);
			if (selectedIndex >= 0) useSlideStore.getState().setSelectedIndex(selectedIndex);
		};
		const getBtn = (action: string): HTMLButtonElement | null =>
			container.querySelector<HTMLButtonElement>(`[data-action='${action}']`);

		it("meta 未ロード時は追加ボタン disabled", () => {
			// document 未 set のまま render
			render();
			expect(getBtn("add")?.disabled).toBe(true);
		});

		it("meta ありで追加ボタン enabled、クリックで末尾追加 + 選択切替", () => {
			seedDoc([makeSlide(1, "a"), makeSlide(2, "b")]);
			render();
			expect(getBtn("add")?.disabled).toBe(false);

			act(() => {
				getBtn("add")?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
			});

			const s = useSlideStore.getState();
			expect(s.slides.length).toBe(3);
			expect(s.slides[2].id).toBe(3); // nextSlideId
			expect(s.slides[2].width).toBe(1280); // meta.width
			expect(s.slides[2].height).toBe(720);
			expect(s.selectedIndex).toBe(2); // 追加した slide が選択される
		});

		it("未選択時は複製 / 削除ボタン disabled", () => {
			seedDoc([makeSlide(1, "a")]);
			render();
			expect(getBtn("duplicate")?.disabled).toBe(true);
			expect(getBtn("delete")?.disabled).toBe(true);
		});

		it("選択時は複製 / 削除 enabled、複製で直後に挿入", () => {
			seedDoc([makeSlide(1, "a"), makeSlide(2, "b")], 0);
			render();
			expect(getBtn("duplicate")?.disabled).toBe(false);

			act(() => {
				getBtn("duplicate")?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
			});

			const s = useSlideStore.getState();
			expect(s.slides.length).toBe(3);
			expect(s.slides[0].uuid).toBe("a");
			expect(s.slides[1].uuid).not.toBe("a"); // 新規 uuid
			expect(s.slides[2].uuid).toBe("b");
		});

		it("削除ボタンは確認 OK なら deleteSlide を呼ぶ", async () => {
			seedDoc([makeSlide(1, "a"), makeSlide(2, "b"), makeSlide(3, "c")], 1);
			render();

			act(() => {
				getBtn("delete")?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
			});
			await resolveAlert(true);

			const s = useSlideStore.getState();
			expect(s.slides.map((x) => x.uuid)).toEqual(["a", "c"]);
		});

		it("削除ボタンは確認キャンセルなら no-op", async () => {
			seedDoc([makeSlide(1, "a"), makeSlide(2, "b")], 0);
			render();

			act(() => {
				getBtn("delete")?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
			});
			await resolveAlert(false);

			const s = useSlideStore.getState();
			expect(s.slides.length).toBe(2); // 削除されていない
		});
	});

	describe("コンテキストメニュー (C-6)", () => {
		const seedDoc = (slides: Slide[] = [], selectedIndex = -1): void => {
			const doc: ViewerDocument = {
				title: "test",
				width: 1280,
				height: 720,
				createTime: 0,
				editTime: 0,
				slides,
			};
			useViewerDocumentStore.getState().setDocument(doc);
			if (selectedIndex >= 0) useSlideStore.getState().setSelectedIndex(selectedIndex);
		};
		const fireContextMenu = (target: Element | null): void => {
			expect(target).not.toBeNull();
			act(() => {
				target!.dispatchEvent(
					new MouseEvent("contextmenu", { bubbles: true, clientX: 10, clientY: 10 })
				);
			});
		};
		// Menu.Dropdown は Portal で body 直下にレンダーされる
		const getMenuItem = (action: string): HTMLElement | null =>
			document.querySelector<HTMLElement>(`[data-ctx-action='${action}']`);

		it("空 list では context menu が出ない", () => {
			render();
			const panel = container.querySelector("[class*='Paper']") ?? container.firstElementChild!;
			fireContextMenu(panel);
			expect(document.querySelector("[data-context-menu='slide-list']")).toBeNull();
		});

		it("slide 右クリックで per-slide メニュー (toggle-joining 等) が表示される", () => {
			seedDoc([makeSlide(1, "a", { joining: true }), makeSlide(2, "b", { joining: false })]);
			render();
			const slideEl = container.querySelector<HTMLElement>("[data-slide-index='1']");
			fireContextMenu(slideEl);

			expect(getMenuItem("toggle-joining")).not.toBeNull();
			expect(getMenuItem("toggle-disabled")).not.toBeNull();
			expect(getMenuItem("duplicate-target")).not.toBeNull();
			expect(getMenuItem("delete-target")).not.toBeNull();
			expect(getMenuItem("all-joining")).not.toBeNull(); // 一括も同時表示
		});

		it("背景右クリックで一括操作のみ (per-slide なし)", () => {
			seedDoc([makeSlide(1, "a")]);
			render();
			// 背景 = Paper 内部の data-slide-count 要素 (data-slide-index を持たない)
			const bg = container.querySelector<HTMLElement>("[data-slide-count]");
			fireContextMenu(bg);

			expect(getMenuItem("toggle-joining")).toBeNull(); // per-slide なし
			expect(getMenuItem("all-joining")).not.toBeNull(); // 一括あり
		});

		it("「結合解除」クリックで対象 slide の joining が false に", () => {
			seedDoc([makeSlide(1, "a", { joining: true })]);
			render();
			const slideEl = container.querySelector<HTMLElement>("[data-slide-index='0']");
			fireContextMenu(slideEl);

			act(() => {
				getMenuItem("toggle-joining")?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
			});
			expect(useSlideStore.getState().slides[0].joining).toBe(false);
		});

		it("「すべて結合 / すべて分割」が現在の全体状態でラベル切替 + setAllJoining 呼出", () => {
			seedDoc([makeSlide(1, "a", { joining: true }), makeSlide(2, "b", { joining: true })]);
			render();
			fireContextMenu(container.querySelector("[data-slide-index='0']"));

			// 全 join=true なので "すべて分割" が出る
			const item = getMenuItem("all-joining");
			expect(item?.textContent).toContain("分割");

			act(() => {
				item?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
			});
			expect(useSlideStore.getState().slides.every((s) => !s.joining)).toBe(true);
		});

		it("「全無効化」「全有効化」で setAllDisabled が呼ばれる", () => {
			seedDoc([makeSlide(1, "a"), makeSlide(2, "b")]);
			render();
			fireContextMenu(container.querySelector("[data-slide-index='0']"));

			act(() => {
				getMenuItem("disable-all")?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
			});
			expect(useSlideStore.getState().slides.every((s) => s.disabled)).toBe(true);

			// 再度開いて enable-all
			fireContextMenu(container.querySelector("[data-slide-index='0']"));
			act(() => {
				getMenuItem("enable-all")?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
			});
			expect(useSlideStore.getState().slides.every((s) => !s.disabled)).toBe(true);
		});

		it("「無効スライドを一括削除」は disabled なし時 disabled、確認 OK で deleteAllDisabled 呼出", async () => {
			seedDoc([
				makeSlide(1, "a", { disabled: false }),
				makeSlide(2, "b", { disabled: true }),
				makeSlide(3, "c", { disabled: false }),
			]);
			render();
			fireContextMenu(container.querySelector("[data-slide-index='0']"));

			const item = getMenuItem("delete-disabled");
			expect((item as HTMLButtonElement)?.disabled).toBe(false);
			act(() => {
				item?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
			});
			await resolveAlert(true);
			expect(useSlideStore.getState().slides.map((s) => s.uuid)).toEqual(["a", "c"]);
		});
	});
});

describe("SlideListPanel ドラッグ&ドロップ (v4 Group D D-12)", () => {
	const seedDoc = (): void => {
		const doc: ViewerDocument = {
			title: "test",
			width: 1280,
			height: 720,
			createTime: 0,
			editTime: 0,
			slides: [],
		};
		useViewerDocumentStore.getState().setDocument(doc);
	};

	it("drop overlay は既定で hidden、document ロード時は dragover で表示される", () => {
		seedDoc();
		render();
		const overlay = container.querySelector<HTMLElement>("[data-slide-list-drop-overlay]");
		expect(overlay).not.toBeNull();
		expect(overlay?.style.display).toBe("none");
		const zone = container.querySelector<HTMLElement>("[data-slide-list-drop-zone]");
		act(() => {
			zone?.dispatchEvent(new Event("dragover", { bubbles: true, cancelable: true }));
		});
		expect(overlay?.style.display).toBe("flex");
	});

	it("document 未ロード (meta 無し) では dragover しても overlay を出さない (disabled)", () => {
		// setDocument(null) のまま render → useDrop disabled
		render();
		const overlay = container.querySelector<HTMLElement>("[data-slide-list-drop-overlay]");
		const zone = container.querySelector<HTMLElement>("[data-slide-list-drop-zone]");
		act(() => {
			zone?.dispatchEvent(new Event("dragover", { bubbles: true, cancelable: true }));
		});
		expect(overlay?.style.display).toBe("none");
	});
});

describe("SlideListPanel 閲覧モード (readOnly)", () => {
	it("編集ボタン・per-thumb コントロール・DnD を隠し、サムネ選択のみ可", () => {
		useSlideStore.getState().setSlides([makeSlide(1, "a"), makeSlide(2, "b")]);
		useSlideStore.getState().setSelectedIndex(0);
		render(true);
		// 編集ボタン群は非表示
		for (const action of ["move-prev", "move-next", "add", "duplicate", "delete"]) {
			expect(container.querySelector(`[data-action='${action}']`)).toBeNull();
		}
		// per-thumb 編集コントロール・DnD は無し
		expect(container.querySelector("[data-thumb-control]")).toBeNull();
		expect(container.querySelector("[data-sortable-id]")).toBeNull();
		// サムネ自体は描画される (選択用)
		expect(container.querySelectorAll("[data-thumb-canvas]").length).toBe(2);
	});

	it("編集モード (既定) では編集ボタンが出る", () => {
		useSlideStore.getState().setSlides([makeSlide(1, "a"), makeSlide(2, "b")]);
		render(false);
		expect(container.querySelector("[data-action='add']")).not.toBeNull();
		expect(container.querySelector("[data-sortable-id]")).not.toBeNull();
	});
});

describe("SlideListPanel wrap (複数行ギャラリー)", () => {
	it("wrap=false は単一行 (nowrap)、wrap=true は複数行 (wrap)", () => {
		useSlideStore.getState().setSlides([makeSlide(1, "a"), makeSlide(2, "b")]);
		render(false, false);
		const row1 = container.querySelector<HTMLElement>("[data-slide-count]");
		expect(row1?.style.flexWrap).toBe("nowrap");

		render(false, true);
		const row2 = container.querySelector<HTMLElement>("[data-slide-count]");
		expect(row2?.style.flexWrap).toBe("wrap");
	});
});
