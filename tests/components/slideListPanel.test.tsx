import { MantineProvider } from "@mantine/core";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
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

const render = (mobileMode = false, listMode = false): void => {
	act(() => {
		root.render(
			<MantineProvider>
				<SlideListPanel mobileMode={mobileMode} listMode={listMode} />
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

	it("disabled slide は data-disabled=true、絵柄と下地だけを暗くする", () => {
		useSlideStore
			.getState()
			.setSlides([makeSlide(1, "a", { disabled: false }), makeSlide(2, "b", { disabled: true })]);
		render();
		const items = container.querySelectorAll<HTMLElement>("[data-slide-index]");
		expect(items[0].getAttribute("data-disabled")).toBe("false");
		expect(items[1].getAttribute("data-disabled")).toBe("true");
		// グレーアウトは canvas (絵柄) のみ。wrapper に掛けると有効/無効チェックや
		// 編集ボタンまで沈んで狙いにくくなるため、wrapper 自体は素のまま。
		// 半透明ではなく filter で落とす (opacity だと白地が透けて色が抜けるだけ)。
		const canvasOf = (el: HTMLElement): HTMLElement | null =>
			el.querySelector<HTMLElement>("[data-thumb-canvas]");
		expect(canvasOf(items[1])?.style.filter).toContain("brightness");
		expect(items[1].style.opacity).toBe("");
		expect(items[1].style.filter).toBe("");
		// 透明ボーダーの下から覗く下地も暗くする (白い枠が残ると非活性に見えない)。
		expect(items[1].style.background).not.toBe("rgb(255, 255, 255)");
		// 有効な側の絵柄には何も掛けず、下地は白のまま
		expect(canvasOf(items[0])?.style.filter).toBe("");
		expect(items[0].style.background).toBe("rgb(255, 255, 255)");
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

	describe("前後選択ボタン (C-4 → 選択ナビ)", () => {
		// ◀▶ は「選択中スライドの前後を選択」するナビ (移動ではない)。data-action は select-prev/select-next。
		const getPrevBtn = (): HTMLButtonElement | null =>
			container.querySelector<HTMLButtonElement>("[data-action='select-prev']");
		const getNextBtn = (): HTMLButtonElement | null =>
			container.querySelector<HTMLButtonElement>("[data-action='select-next']");

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

		it("後ボタンクリックで selectedIndex のみ 1 つ後ろへ (並びは不変)", () => {
			useSlideStore.getState().setSlides([makeSlide(1, "a"), makeSlide(2, "b"), makeSlide(3, "c")]);
			useSlideStore.getState().setSelectedIndex(0); // "a"
			render();
			act(() => {
				getNextBtn()?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
			});
			const s = useSlideStore.getState();
			expect(s.slides.map((x) => x.uuid)).toEqual(["a", "b", "c"]); // 並びは変わらない
			expect(s.selectedIndex).toBe(1); // 選択が "b" へ
		});

		it("前ボタンクリックで selectedIndex のみ 1 つ前へ (並びは不変)", () => {
			useSlideStore.getState().setSlides([makeSlide(1, "a"), makeSlide(2, "b"), makeSlide(3, "c")]);
			useSlideStore.getState().setSelectedIndex(2); // "c"
			render();
			act(() => {
				getPrevBtn()?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
			});
			const s = useSlideStore.getState();
			expect(s.slides.map((x) => x.uuid)).toEqual(["a", "b", "c"]); // 並びは変わらない
			expect(s.selectedIndex).toBe(1); // 選択が "b" へ
		});

		it("編集中は前後選択で editingIndex も追従する", () => {
			useSlideStore.getState().setSlides([makeSlide(1, "a"), makeSlide(2, "b"), makeSlide(3, "c")]);
			useSlideStore.getState().setEditingIndex(0); // 編集モード (editingIndex=selectedIndex=0)
			render();
			act(() => {
				getNextBtn()?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
			});
			const s = useSlideStore.getState();
			expect(s.selectedIndex).toBe(1);
			expect(s.editingIndex).toBe(1); // 編集対象も追従
		});

		it("listMode (ギャラリー) では前後選択ボタンを表示しない", () => {
			useSlideStore.getState().setSlides([makeSlide(1, "a"), makeSlide(2, "b")]);
			useSlideStore.getState().setSelectedIndex(0);
			render(false, true);
			expect(getPrevBtn()).toBeNull();
			expect(getNextBtn()).toBeNull();
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

	describe("追加ボタン (リスト末尾・meta gate) (C-5)", () => {
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
		const getAddBtn = (): HTMLButtonElement | null =>
			container.querySelector<HTMLButtonElement>("[data-action='add']");

		it("meta 未ロード時は追加ボタンを描画しない", () => {
			// document 未 set のまま render → canAdd=false で addSlideButton 自体が出ない
			useSlideStore.getState().setSlides([makeSlide(1, "a")]);
			render();
			expect(getAddBtn()).toBeNull();
		});

		it("meta ありなら追加ボタンを描画、クリックで末尾追加 + 選択切替", () => {
			seedDoc([makeSlide(1, "a"), makeSlide(2, "b")]);
			render();
			expect(getAddBtn()).not.toBeNull();

			act(() => {
				getAddBtn()?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
			});

			const s = useSlideStore.getState();
			expect(s.slides.length).toBe(3);
			expect(s.slides[2].id).toBe(3); // nextSlideId
			expect(s.slides[2].width).toBe(1280); // meta.width
			expect(s.slides[2].height).toBe(720);
			expect(s.selectedIndex).toBe(2); // 追加した slide が選択される
		});

		it("空リストでも追加ボタンは描画される (最初の 1 枚を追加可)", () => {
			seedDoc([]); // meta あり / slides 空
			render();
			expect(getAddBtn()).not.toBeNull();

			act(() => {
				getAddBtn()?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
			});
			expect(useSlideStore.getState().slides.length).toBe(1);
		});
	});

	describe("スライド内 複製 / 削除ボタン (選択不要・C-5)", () => {
		const seedDoc = (slides: Slide[] = []): void => {
			const doc: ViewerDocument = {
				title: "test",
				width: 1280,
				height: 720,
				createTime: 0,
				editTime: 0,
				slides,
			};
			useViewerDocumentStore.getState().setDocument(doc);
		};
		// 複製/削除はサムネ内のボタン (data-thumb-control)。選択に関係なく当該 slide へ作用する。
		const getThumbControl = (index: number, control: string): HTMLButtonElement | null => {
			const thumb = container.querySelector<HTMLElement>(`[data-slide-index='${index}']`);
			return thumb?.querySelector<HTMLButtonElement>(`[data-thumb-control='${control}']`) ?? null;
		};

		it("複製ボタンは選択していない slide でも直後に挿入され、複製元が結合状態になる", () => {
			seedDoc([makeSlide(1, "a", { joining: false }), makeSlide(2, "b")]);
			render(); // 未選択 (selectedIndex=-1)
			const dupBtn = getThumbControl(0, "duplicate");
			expect(dupBtn).not.toBeNull();

			act(() => {
				dupBtn?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
			});

			const s = useSlideStore.getState();
			expect(s.slides.length).toBe(3);
			expect(s.slides[0].uuid).toBe("a");
			expect(s.slides[0].joining).toBe(true); // 複製元は複製と結合される
			expect(s.slides[1].uuid).not.toBe("a"); // 直後に新規 uuid
			expect(s.slides[2].uuid).toBe("b");
		});

		it("削除ボタンは確認なしで即座に当該 slide を削除 (選択不要)", () => {
			seedDoc([makeSlide(1, "a"), makeSlide(2, "b"), makeSlide(3, "c")]);
			render(); // 未選択
			act(() => {
				getThumbControl(1, "delete")?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
			});

			expect(useSlideStore.getState().slides.map((x) => x.uuid)).toEqual(["a", "c"]);
		});

		it("削除ボタンは確認ダイアログを出さない", () => {
			seedDoc([makeSlide(1, "a"), makeSlide(2, "b")]);
			render();
			act(() => {
				getThumbControl(0, "delete")?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
			});

			expect(useAlertStore.getState().request).toBeNull(); // 確認は出ない
			expect(useSlideStore.getState().slides.length).toBe(1); // 即削除される
		});
	});

	describe("選択と編集の分離 (selectedIndex / editingIndex)", () => {
		const seedDoc = (slides: Slide[] = []): void => {
			const doc: ViewerDocument = {
				title: "test",
				width: 1280,
				height: 720,
				createTime: 0,
				editTime: 0,
				slides,
			};
			useViewerDocumentStore.getState().setDocument(doc);
		};

		it("シングルクリックは選択のみ (編集に移行しない)", () => {
			seedDoc([makeSlide(1, "a"), makeSlide(2, "b")]);
			render();
			const thumb = container.querySelector<HTMLElement>("[data-slide-index='1']");
			act(() => {
				thumb?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
			});
			const s = useSlideStore.getState();
			expect(s.selectedIndex).toBe(1);
			expect(s.editingIndex).toBe(-1); // 編集には移行しない
		});

		it("ダブルクリックで editingIndex がセットされ編集へ移行", () => {
			seedDoc([makeSlide(1, "a"), makeSlide(2, "b")]);
			render();
			const thumb = container.querySelector<HTMLElement>("[data-slide-index='1']");
			act(() => {
				thumb?.dispatchEvent(new MouseEvent("dblclick", { bubbles: true }));
			});
			const s = useSlideStore.getState();
			expect(s.editingIndex).toBe(1);
			expect(s.selectedIndex).toBe(1); // 編集中は一致
		});

		it("スライド内「編集」ボタンで editingIndex がセットされる", () => {
			seedDoc([makeSlide(1, "a"), makeSlide(2, "b")]);
			render();
			const thumb = container.querySelector<HTMLElement>("[data-slide-index='0']");
			const editBtn = thumb?.querySelector<HTMLButtonElement>("[data-thumb-control='edit']");
			expect(editBtn).not.toBeNull();
			act(() => {
				editBtn?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
			});
			expect(useSlideStore.getState().editingIndex).toBe(0);
		});

		it("編集中に別スライドをクリックすると editingIndex が切り替わる", () => {
			seedDoc([makeSlide(1, "a"), makeSlide(2, "b"), makeSlide(3, "c")]);
			useSlideStore.getState().setEditingIndex(0); // 編集モード (render 前に設定し closure に反映)
			render();
			const thumb = container.querySelector<HTMLElement>("[data-slide-index='2']");
			act(() => {
				thumb?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
			});
			const s = useSlideStore.getState();
			expect(s.editingIndex).toBe(2); // 編集対象が切り替わる
			expect(s.selectedIndex).toBe(2);
		});
	});

	describe("選択中のみアクションボタン表示 (reveal CSS)", () => {
		it("選択中のみ data-thumb-reveal を表示する CSS が注入される", () => {
			useSlideStore.getState().setSlides([makeSlide(1, "a")]);
			render();
			const styleText = Array.from(container.querySelectorAll("style"))
				.map((s) => s.textContent ?? "")
				.join("\n");
			expect(styleText).toContain("[data-thumb-reveal]");
			expect(styleText).toContain('data-selected="true"');
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

		it("「削除」クリックは確認なしで対象 slide を即削除する", () => {
			seedDoc([makeSlide(1, "a"), makeSlide(2, "b"), makeSlide(3, "c")]);
			render();
			fireContextMenu(container.querySelector("[data-slide-index='1']"));
			act(() => {
				getMenuItem("delete-target")?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
			});

			expect(useAlertStore.getState().request).toBeNull(); // 確認は出ない
			expect(useSlideStore.getState().slides.map((s) => s.uuid)).toEqual(["a", "c"]);
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

		it("「このスライドのみ有効化」で対象のみ有効・他は全無効", () => {
			seedDoc([
				makeSlide(1, "a", { disabled: false }),
				makeSlide(2, "b", { disabled: false }),
				makeSlide(3, "c", { disabled: false }),
			]);
			render();
			fireContextMenu(container.querySelector("[data-slide-index='1']"));

			act(() => {
				getMenuItem("enable-only")?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
			});
			expect(useSlideStore.getState().slides.map((s) => s.disabled)).toEqual([true, false, true]);
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

describe("SlideListPanel スマホモード (mobileMode)", () => {
	const seedDoc = (slides: Slide[]): void => {
		useViewerDocumentStore.getState().setDocument({
			title: "test",
			width: 1280,
			height: 720,
			createTime: 0,
			editTime: 0,
			slides,
		});
	};

	it("編集ボタン・per-thumb コントロール・DnD を隠し、サムネ選択のみ可", () => {
		seedDoc([makeSlide(1, "a"), makeSlide(2, "b")]);
		useSlideStore.getState().setSelectedIndex(0);
		render(true);
		// 操作ボタン群 (前後選択・追加) は非表示
		for (const action of ["select-prev", "select-next", "add"]) {
			expect(container.querySelector(`[data-action='${action}']`)).toBeNull();
		}
		// per-thumb 編集コントロール・DnD は無し
		expect(container.querySelector("[data-thumb-control]")).toBeNull();
		expect(container.querySelector("[data-sortable-id]")).toBeNull();
		// サムネ自体は描画される (選択用)
		expect(container.querySelectorAll("[data-thumb-canvas]").length).toBe(2);
	});

	it("PCモード (既定) では追加ボタン・DnD が出る", () => {
		seedDoc([makeSlide(1, "a"), makeSlide(2, "b")]);
		render(false);
		expect(container.querySelector("[data-action='add']")).not.toBeNull();
		expect(container.querySelector("[data-sortable-id]")).not.toBeNull();
	});
});

describe("SlideListPanel 地面クリックで選択解除", () => {
	// 一覧モードでは選択中スライドに調整バー (SlidePlaybackPanel) が出るため、
	// 選択を降りる手段が必要。編集モードでは選択 = 編集対象なので解除しない。
	const clickOn = (el: Element | null): void => {
		expect(el).not.toBeNull();
		act(() => {
			el?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
		});
	};
	const ground = (): Element | null => container.querySelector("[data-slide-list-drop-zone]");

	it("一覧モード: サムネ以外の地面クリックで選択が解除される", () => {
		useSlideStore.getState().setSlides([makeSlide(1, "a"), makeSlide(2, "b")]);
		useSlideStore.getState().setSelectedIndex(1);
		render(false, true);

		clickOn(ground());
		expect(useSlideStore.getState().selectedIndex).toBe(-1);
	});

	it("スマホモードでも解除される (スマホは常に一覧モード)", () => {
		useSlideStore.getState().setSlides([makeSlide(1, "a")]);
		useSlideStore.getState().setSelectedIndex(0);
		render(true, true);

		clickOn(ground());
		expect(useSlideStore.getState().selectedIndex).toBe(-1);
	});

	// スマホモードで検証する。PC では dnd-kit が並べ替え要素に role="button" を付けるため
	// コントロール除外側にも引っかかり、サムネ除外が効いているかを判別できない。
	it("スマホモード: サムネのクリックでは解除されない (選択が即座に消えない)", () => {
		useSlideStore.getState().setSlides([makeSlide(1, "a"), makeSlide(2, "b")]);
		useSlideStore.getState().setSelectedIndex(0);
		render(true, true);

		clickOn(container.querySelector('[data-slide-index="1"]'));
		expect(useSlideStore.getState().selectedIndex).toBe(1);
	});

	it("PCモード: サムネのクリックでも解除されない", () => {
		useSlideStore.getState().setSlides([makeSlide(1, "a"), makeSlide(2, "b")]);
		useSlideStore.getState().setSelectedIndex(0);
		render(false, true);

		clickOn(container.querySelector('[data-slide-index="1"]'));
		expect(useSlideStore.getState().selectedIndex).toBe(1);
	});

	// 回帰: パネル全体に onClick を張った当初、サムネ外にある前後移動ボタンのクリックまで
	// 地面と見なして「押した瞬間に選択が解除される」状態になっていた。
	it("パネル内のボタンのクリックでは解除されない", () => {
		useSlideStore.getState().setSlides([makeSlide(1, "a"), makeSlide(2, "b")]);
		useSlideStore.getState().setSelectedIndex(0);
		render(false, false); // 前後移動ボタンは編集モード (listMode=false) に出る

		clickOn(container.querySelector("[data-action='select-next']"));
		expect(useSlideStore.getState().selectedIndex).toBe(1);
	});

	it("編集モードでは地面クリックで解除されない (選択 = 編集対象)", () => {
		useSlideStore.getState().setSlides([makeSlide(1, "a"), makeSlide(2, "b")]);
		// setEditingIndex(1) は selectedIndex も 1 に合わせる = 編集モード。
		useSlideStore.getState().setEditingIndex(1);
		render(false, false);

		clickOn(ground());
		expect(useSlideStore.getState().selectedIndex).toBe(1);
	});
});

describe("SlideListPanel listMode (複数行ギャラリー)", () => {
	it("listMode=false は単一行 (nowrap)、listMode=true は複数行 (wrap)", () => {
		useSlideStore.getState().setSlides([makeSlide(1, "a"), makeSlide(2, "b")]);
		render(false, false);
		const row1 = container.querySelector<HTMLElement>("[data-slide-count]");
		expect(row1?.style.flexWrap).toBe("nowrap");

		render(false, true);
		const row2 = container.querySelector<HTMLElement>("[data-slide-count]");
		expect(row2?.style.flexWrap).toBe("wrap");
	});
});

describe("SlideListPanel 選択スライドの中央スクロール (編集ストリップ遷移)", () => {
	// jsdom に scrollTo が無いので spy を生やす。中央化 effect は !listMode (ストリップ) 時のみ走る。
	let restoreScrollTo: (() => void) | undefined;
	let scrollToSpy: ReturnType<typeof vi.fn>;
	beforeEach(() => {
		scrollToSpy = vi.fn();
		const had = Object.getOwnPropertyDescriptor(HTMLElement.prototype, "scrollTo");
		Object.defineProperty(HTMLElement.prototype, "scrollTo", {
			configurable: true,
			writable: true,
			value: scrollToSpy,
		});
		restoreScrollTo = () => {
			if (had) Object.defineProperty(HTMLElement.prototype, "scrollTo", had);
			else delete (HTMLElement.prototype as unknown as Record<string, unknown>).scrollTo;
		};
	});
	afterEach(() => restoreScrollTo?.());

	it("listMode (一覧) では中央スクロールせず、!listMode (編集ストリップ) へ遷移で中央スクロールが走る", () => {
		useSlideStore
			.getState()
			.setSlides([makeSlide(1, "a"), makeSlide(2, "b"), makeSlide(3, "c"), makeSlide(4, "d")]);
		useSlideStore.getState().setSelectedIndex(3);

		// listMode (ギャラリー): 水平中央化はしない
		render(false, true);
		expect(scrollToSpy).not.toHaveBeenCalled();

		// !listMode (編集ストリップ) へ遷移: selectedIndex 不変でも listMode 変化で中央スクロールが走る
		render(false, false);
		expect(scrollToSpy).toHaveBeenCalled();
	});
});

describe("SlideListPanel viewport リサイズ追随 (編集ストリップ・根本対策)", () => {
	// 編集ストリップで viewport の寸法が変わった (フルスクリーン解除/ウィンドウリサイズ/回転等) とき、
	// 編集中スライドが見切れていれば寄せ直す。ResizeObserver の発火を捕捉モックで再現して検証。
	let restoreScrollTo: (() => void) | undefined;
	let restoreRO: (() => void) | undefined;
	let restoreRect: (() => void) | undefined;
	let scrollToSpy: ReturnType<typeof vi.fn>;
	// RO コールバックは (entries, observer) 形。dnd-kit/Mantine も同じグローバル RO を使うため
	// 発火時は必ず空配列 [] を渡す (entries を iterate する消費側を壊さない)。
	let roCallbacks: Array<(entries: unknown[], observer: unknown) => void>;

	beforeEach(() => {
		roCallbacks = [];
		scrollToSpy = vi.fn();
		// scrollTo を spy 化
		const hadScroll = Object.getOwnPropertyDescriptor(HTMLElement.prototype, "scrollTo");
		Object.defineProperty(HTMLElement.prototype, "scrollTo", {
			configurable: true,
			writable: true,
			value: scrollToSpy,
		});
		restoreScrollTo = () => {
			if (hadScroll) Object.defineProperty(HTMLElement.prototype, "scrollTo", hadScroll);
			else delete (HTMLElement.prototype as unknown as Record<string, unknown>).scrollTo;
		};

		// ResizeObserver を捕捉モックに差し替え。observe で初回 1 回発火 (実 RO 互換 = source の
		// first スキップが消費)。以後はテストから roCallbacks を手動発火 = リサイズ相当。
		const hadRO = (globalThis as unknown as { ResizeObserver?: unknown }).ResizeObserver;
		class MockRO {
			cb: (entries: unknown[], observer: unknown) => void;
			constructor(cb: (entries: unknown[], observer: unknown) => void) {
				this.cb = cb;
				roCallbacks.push(cb);
			}
			observe(): void {
				this.cb([], this); // 初回発火 (空 entries)
			}
			unobserve(): void {}
			disconnect(): void {}
		}
		(globalThis as unknown as { ResizeObserver: unknown }).ResizeObserver = MockRO;
		restoreRO = () => {
			(globalThis as unknown as { ResizeObserver: unknown }).ResizeObserver = hadRO;
		};

		// jsdom は getBoundingClientRect が全て 0。viewport=幅100、選択 thumb=left200(右に見切れ) を
		// 返すよう stub し、「見切れ → 寄せる」判定を成立させる。
		const hadRect = Object.getOwnPropertyDescriptor(Element.prototype, "getBoundingClientRect");
		Object.defineProperty(Element.prototype, "getBoundingClientRect", {
			configurable: true,
			writable: true,
			value(this: HTMLElement) {
				const isThumb = this.hasAttribute?.("data-slide-index");
				const left = isThumb ? 200 : 0;
				const width = isThumb ? 50 : 100;
				return { left, top: 0, width, height: 50, right: left + width, bottom: 50, x: left, y: 0 };
			},
		});
		restoreRect = () => {
			if (hadRect) Object.defineProperty(Element.prototype, "getBoundingClientRect", hadRect);
		};
	});
	afterEach(() => {
		restoreRect?.();
		restoreRO?.();
		restoreScrollTo?.();
	});

	it("ストリップで viewport リサイズ時、見切れた編集中スライドを横方向に寄せ直す", () => {
		useSlideStore
			.getState()
			.setSlides([makeSlide(1, "a"), makeSlide(2, "b"), makeSlide(3, "c"), makeSlide(4, "d")]);
		useSlideStore.getState().setSelectedIndex(3);
		render(false, false); // strip
		scrollToSpy.mockClear(); // 選択時 center + RO 初回発火分をクリア

		// リサイズ発火 (フルスクリーン解除等に相当)
		act(() => roCallbacks.forEach((cb) => cb([], null)));

		expect(scrollToSpy).toHaveBeenCalled();
		// 横方向 (left) かつ即時 (auto) で寄せる
		const arg = scrollToSpy.mock.calls.at(-1)?.[0];
		expect(arg).toHaveProperty("left");
		expect(arg?.behavior).toBe("auto");
	});

	it("一覧 (listMode) では viewport リサイズで追随しない (縦は対象外)", () => {
		useSlideStore
			.getState()
			.setSlides([makeSlide(1, "a"), makeSlide(2, "b"), makeSlide(3, "c"), makeSlide(4, "d")]);
		useSlideStore.getState().setSelectedIndex(3);
		render(false, true); // gallery
		scrollToSpy.mockClear();

		act(() => roCallbacks.forEach((cb) => cb([], null)));

		expect(scrollToSpy).not.toHaveBeenCalled();
	});
});
