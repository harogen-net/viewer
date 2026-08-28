import { MantineProvider } from "@mantine/core";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { SlideListPanel } from "../../src/components/panels/SlideListPanel";
import { useHistoryStore } from "../../src/state/historyStore";
import { useListToolStore } from "../../src/state/listToolStore";
import { useSlideStore } from "../../src/state/slideStore";
import { useViewerDocumentStore } from "../../src/state/viewerDocumentStore";
import type { Slide } from "../../src/types/Slide";
import type { ViewerDocument } from "../../src/types/ViewerDocument";

// 一括切替モード (docs/bulk-toggle-mode-plan.md)。
// 一覧モードのサブ状態で、スライドをクリックするだけで有効/無効が切り替わり、
// それ以外の変更はできない。履歴はモード中まとめて 1 件。

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

const makeDoc = (slides: Slide[]): ViewerDocument => ({
	title: "t",
	width: 800,
	height: 600,
	createTime: 0,
	editTime: 0,
	slides,
});

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
	useSlideStore.getState().setSlides([]);
	useViewerDocumentStore.getState().setDocument(null);
	useListToolStore.setState({ bulkToggleActive: false, bulkToggleBefore: null });
	container = document.createElement("div");
	document.body.appendChild(container);
	root = createRoot(container);
});

afterEach(() => {
	act(() => root.unmount());
	container.remove();
});

const render = (mobileMode = false): void => {
	act(() => {
		root.render(
			<MantineProvider>
				<SlideListPanel mobileMode={mobileMode} listMode />
			</MantineProvider>
		);
	});
};

/** 文書を読み込んだ状態で描画する (savedSlides の baseline が要るので setDocument 経由)。 */
const seed = (slides: Slide[], mobileMode = false): void => {
	useViewerDocumentStore.getState().setDocument(makeDoc(slides));
	render(mobileMode);
};

const thumbs = (): HTMLElement[] =>
	Array.from(container.querySelectorAll<HTMLElement>("[data-slide-index]"));
const clickThumb = (i: number): void => {
	act(() => thumbs()[i].dispatchEvent(new MouseEvent("click", { bubbles: true })));
};
const modeSwitch = (): HTMLInputElement => {
	const el = container.querySelector<HTMLInputElement>('input[data-action="bulk-toggle-mode"]');
	if (!el) throw new Error("一括切替スイッチが見つからない");
	return el;
};
const setMode = (on: boolean): void => {
	const sw = modeSwitch();
	if (sw.checked === on) return;
	act(() => sw.click());
};
const disabledFlags = (): boolean[] =>
	useSlideStore.getState().slides.map((s) => s.disabled);
const historyCount = (): number => useHistoryStore.getState().past.length;
const control = (i: number, name: string): Element | null =>
	thumbs()[i].querySelector(`[data-thumb-control="${name}"]`);

describe("一括切替モード - 出入り", () => {
	it("一覧モードにスイッチがあり、押すとモードに入る / 抜ける", () => {
		seed([makeSlide(1, "a")]);
		expect(useListToolStore.getState().bulkToggleActive).toBe(false);
		setMode(true);
		expect(useListToolStore.getState().bulkToggleActive).toBe(true);
		setMode(false);
		expect(useListToolStore.getState().bulkToggleActive).toBe(false);
	});

	it("Esc で抜ける", () => {
		seed([makeSlide(1, "a")]);
		setMode(true);
		act(() => {
			window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
		});
		expect(useListToolStore.getState().bulkToggleActive).toBe(false);
	});

	it("モード中でなければ Esc は何もしない (常時 keydown を掴んでいない)", () => {
		seed([makeSlide(1, "a")]);
		act(() => {
			window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
		});
		expect(useListToolStore.getState().bulkToggleActive).toBe(false);
		expect(historyCount()).toBe(0);
	});
});

describe("一括切替モード - クリックでのトグル", () => {
	it("クリックで disabled が反転し、選択は動かない", () => {
		seed([makeSlide(1, "a"), makeSlide(2, "b")]);
		useSlideStore.getState().setSelectedIndex(1);
		setMode(true);

		clickThumb(0);
		expect(disabledFlags()).toEqual([true, false]);
		// 選択は据え置き (クリックは選択ではなく値の反転)
		expect(useSlideStore.getState().selectedIndex).toBe(1);

		clickThumb(0);
		expect(disabledFlags()).toEqual([false, false]);
	});

	it("モード外のクリックは従来どおり選択で、disabled は変わらない", () => {
		seed([makeSlide(1, "a"), makeSlide(2, "b")]);
		clickThumb(1);
		expect(useSlideStore.getState().selectedIndex).toBe(1);
		expect(disabledFlags()).toEqual([false, false]);
	});
});

describe("一括切替モード - 履歴", () => {
	it("モード中は履歴を積まず、抜けたときに 1 件だけ残る", () => {
		seed([makeSlide(1, "a"), makeSlide(2, "b"), makeSlide(3, "c")]);
		setMode(true);

		clickThumb(0);
		clickThumb(1);
		clickThumb(2);
		// モード中は 0 件 (3 件積まない)
		expect(historyCount()).toBe(0);
		expect(disabledFlags()).toEqual([true, true, true]);

		setMode(false);
		expect(historyCount()).toBe(1);
	});

	it("触って元に戻して抜けたら履歴は残らず、未保存フラグも立たない", () => {
		seed([makeSlide(1, "a"), makeSlide(2, "b")]);
		setMode(true);
		clickThumb(0);
		clickThumb(0); // 戻す
		setMode(false);

		expect(disabledFlags()).toEqual([false, false]);
		expect(historyCount()).toBe(0);
		expect(useViewerDocumentStore.getState().modified).toBe(false);
	});

	it("何も触らずに抜けても履歴は残らない", () => {
		seed([makeSlide(1, "a")]);
		setMode(true);
		setMode(false);
		expect(historyCount()).toBe(0);
		expect(useViewerDocumentStore.getState().modified).toBe(false);
	});

	it("まとめた 1 件を undo すると突入前の状態へ戻る", () => {
		seed([makeSlide(1, "a"), makeSlide(2, "b")]);
		setMode(true);
		clickThumb(0);
		clickThumb(1);
		setMode(false);
		expect(disabledFlags()).toEqual([true, true]);

		const entry = useHistoryStore.getState().past[0];
		expect(entry.before.slides.map((s) => s.disabled)).toEqual([false, false]);
	});
});

describe("一括切替モード - 他の操作の抑止", () => {
	it("モード中はサムネ上の操作口が全て消える (チェックボックスも)", () => {
		seed([makeSlide(1, "a")]);
		// 通常時は編集コントロールが出ている
		expect(control(0, "enable-check")).not.toBeNull();
		expect(control(0, "join-arrow")).not.toBeNull();
		expect(control(0, "duration-resize")).not.toBeNull();
		expect(control(0, "edit")).not.toBeNull();

		setMode(true);
		// サムネ本体のクリックがトグルなので操作口は要らない。状態は暗転で読ませる
		expect(control(0, "enable-check")).toBeNull();
		expect(control(0, "join-arrow")).toBeNull();
		expect(control(0, "duration-resize")).toBeNull();
		expect(control(0, "edit")).toBeNull();
		expect(control(0, "delete")).toBeNull();
		expect(control(0, "duplicate")).toBeNull();
	});

	it("スマホでもモード中は同じ (元からチェックボックスなし、タップでトグル)", () => {
		seed([makeSlide(1, "a")], true);
		expect(control(0, "enable-check")).toBeNull();
		setMode(true);
		expect(control(0, "enable-check")).toBeNull();
		// タップでのトグルは効く
		clickThumb(0);
		expect(disabledFlags()).toEqual([true]);
	});

	it("モード中は新規スライド追加ボタンが消える", () => {
		seed([makeSlide(1, "a")]);
		const addBtn = (): Element | null =>
			container.querySelector('button[aria-label="スライド追加"]');
		expect(addBtn()).not.toBeNull();
		setMode(true);
		expect(addBtn()).toBeNull();
		setMode(false);
		expect(addBtn()).not.toBeNull();
	});

	it("空の一覧では案内文の「＋ で追加」もモード中は消える", () => {
		// canAdd 1 箇所で追加ボタンと案内文の両方が決まる。案内だけ残ると押せない的を案内することになる。
		seed([]);
		expect(container.textContent).toContain("＋ で追加");
		setMode(true);
		expect(container.textContent).not.toContain("＋ で追加");
	});

	const openCtx = (): void => {
		act(() => void thumbs()[0].dispatchEvent(new MouseEvent("contextmenu", { bubbles: true })));
	};
	const ctxMenu = (): Element | null =>
		document.body.querySelector('[data-context-menu="slide-list"]');

	it("モード中は並べ替えを止める (dnd-kit の sortable を disabled にする)", () => {
		seed([makeSlide(1, "a"), makeSlide(2, "b")]);
		const sortable = (): HTMLElement | null =>
			container.querySelector<HTMLElement>("[data-sortable-id]");
		// dnd-kit は disabled を aria-disabled として要素に出す (listeners も外れる)。
		expect(sortable()?.getAttribute("aria-disabled")).toBe("false");
		setMode(true);
		expect(sortable()?.getAttribute("aria-disabled")).toBe("true");
	});

	it("通常時は右クリックでメニューが出る (対照)", () => {
		seed([makeSlide(1, "a")]);
		openCtx();
		expect(ctxMenu()).not.toBeNull();
	});

	it("モード中は右クリックメニューを出さない", () => {
		seed([makeSlide(1, "a")]);
		setMode(true);
		openCtx();
		expect(ctxMenu()).toBeNull();
	});
});

describe("一括切替モード - サムネの作り直しを起こさない", () => {
	it("モードの ON/OFF で canvas 要素が同一のまま (再描画が全枚数で走らない)", () => {
		seed([makeSlide(1, "a"), makeSlide(2, "b")]);
		const canvasesBefore = thumbs().map((t) => t.querySelector("[data-thumb-canvas]"));

		setMode(true);
		const canvasesDuring = thumbs().map((t) => t.querySelector("[data-thumb-canvas]"));
		setMode(false);
		const canvasesAfter = thumbs().map((t) => t.querySelector("[data-thumb-canvas]"));

		// 参照が同一 = unmount/remount していない
		expect(canvasesDuring[0]).toBe(canvasesBefore[0]);
		expect(canvasesDuring[1]).toBe(canvasesBefore[1]);
		expect(canvasesAfter[0]).toBe(canvasesBefore[0]);
	});
});

describe("一括切替モード - 文書差し替え", () => {
	it("モード中に文書が差し替わったら打ち切り、前の文書を履歴に残さない", () => {
		seed([makeSlide(1, "a")]);
		setMode(true);
		clickThumb(0);
		expect(useListToolStore.getState().bulkToggleActive).toBe(true);

		// 別文書を読み込む
		act(() => {
			useViewerDocumentStore.getState().setDocument(makeDoc([makeSlide(9, "z")]));
		});

		expect(useListToolStore.getState().bulkToggleActive).toBe(false);
		expect(historyCount()).toBe(0);
	});
});
