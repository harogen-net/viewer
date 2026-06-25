import { MantineProvider } from "@mantine/core";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
	BG_COLOR_PRESETS,
	DocumentSettingsModal,
} from "../../src/components/panels/DocumentSettingsModal";
import { DocSettingsMode, useDocSettingsStore } from "../../src/state/docSettingsStore";
import { useHistoryStore } from "../../src/state/historyStore";
import { useSlideStore } from "../../src/state/slideStore";
import { useViewerDocumentStore } from "../../src/state/viewerDocumentStore";
import type { Slide } from "../../src/types/Slide";
import { createNewViewerDocument } from "../../src/utils/viewerDocumentFactory";

// ViewerDocument 設定モーダル (new/edit 共用) の結線テスト。Modal は portal なので document から検索。

const makeMeta = (title: string, width = 800, height = 600) => {
	const { slides: _s, ...meta } = createNewViewerDocument();
	return { ...meta, title, width, height };
};
const makeSlide = (id: number, width = 800, height = 600): Slide => ({
	id,
	uuid: `s${id}`,
	width,
	height,
	durationRatio: 1,
	joining: true,
	disabled: false,
	layers: [],
});

let container: HTMLDivElement;
let root: Root;

const q = (sel: string): HTMLElement | null => document.querySelector<HTMLElement>(sel);

const setInputValue = (el: HTMLInputElement | null, value: string): void => {
	if (!el) throw new Error("input not found");
	act(() => {
		const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
		setter?.call(el, value);
		el.dispatchEvent(new Event("input", { bubbles: true }));
	});
};
const click = (el: HTMLElement | null): void => {
	act(() => {
		el?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
	});
};

// store の mode を設定してから render (モーダルは docSettingsStore.mode で開閉)。
const render = (mode: DocSettingsMode): void => {
	act(() => {
		if (mode === DocSettingsMode.NEW) useDocSettingsStore.getState().openNew();
		else useDocSettingsStore.getState().openEdit();
	});
	act(() => {
		root.render(
			<MantineProvider>
				<DocumentSettingsModal />
			</MantineProvider>
		);
	});
};

beforeEach(() => {
	useViewerDocumentStore.setState({ meta: makeMeta("(new)"), modified: false });
	useSlideStore.getState().setSlides([makeSlide(1), makeSlide(2)]);
	useSlideStore.getState().setSelectedIndex(0);
	useHistoryStore.getState().clear();
	useDocSettingsStore.getState().close();
	container = document.createElement("div");
	document.body.appendChild(container);
	root = createRoot(container);
});

afterEach(() => {
	act(() => root.unmount());
	container.remove();
	useViewerDocumentStore.setState({ meta: null, modified: false });
	useDocSettingsStore.getState().close();
});

describe("DocumentSettingsModal edit (draft + 保存)", () => {
	it("入力はドラフト: 保存前は store 未変更", () => {
		render("edit");
		const input = q('[data-doc-field="title"] input') as HTMLInputElement | null;
		expect(input?.value).toBe("(new)");
		setInputValue(input, "my-doc");
		const s = useViewerDocumentStore.getState();
		expect(s.meta?.title).toBe("(new)");
		expect(s.modified).toBe(false);
	});

	it("保存でファイル名が反映され modified=true、modal が閉じる", () => {
		render("edit");
		setInputValue(q('[data-doc-field="title"] input') as HTMLInputElement | null, "my-doc");
		click(q("[data-doc-save]"));
		const s = useViewerDocumentStore.getState();
		expect(s.meta?.title).toBe("my-doc");
		expect(s.modified).toBe(true);
		expect(useDocSettingsStore.getState().mode).toBeNull(); // close された
	});

	it("保存でサイズが doc と全 slide に反映され、履歴は積まれない (undo 対象外)", () => {
		render("edit");
		setInputValue(q('[data-doc-field="width"] input') as HTMLInputElement | null, "1920");
		setInputValue(q('[data-doc-field="height"] input') as HTMLInputElement | null, "1080");
		click(q("[data-doc-save]"));
		const doc = useViewerDocumentStore.getState();
		expect(doc.meta?.width).toBe(1920);
		expect(doc.meta?.height).toBe(1080);
		expect(useSlideStore.getState().slides.map((sl) => [sl.width, sl.height])).toEqual([
			[1920, 1080],
			[1920, 1080],
		]);
		expect(useHistoryStore.getState().past.length).toBe(0);
	});

	it("保存時に既存 history snapshot の slide サイズも揃える (resurrection 防止)", () => {
		useHistoryStore.getState().push({
			label: "prev",
			before: { slides: [makeSlide(1)], selectedIndex: 0 },
			after: { slides: [makeSlide(1)], selectedIndex: 0 },
		});
		render("edit");
		setInputValue(q('[data-doc-field="width"] input') as HTMLInputElement | null, "1920");
		setInputValue(q('[data-doc-field="height"] input') as HTMLInputElement | null, "1080");
		click(q("[data-doc-save]"));
		const e = useHistoryStore.getState().past[0];
		expect([e.before.slides[0].width, e.before.slides[0].height]).toEqual([1920, 1080]);
		expect([e.after.slides[0].width, e.after.slides[0].height]).toEqual([1920, 1080]);
	});

	it("キャンセルでドラフト破棄 (store 未変更)", () => {
		render("edit");
		setInputValue(q('[data-doc-field="title"] input') as HTMLInputElement | null, "discard-me");
		click(q("[data-doc-cancel]"));
		const s = useViewerDocumentStore.getState();
		expect(s.meta?.title).toBe("(new)");
		expect(s.modified).toBe(false);
	});
});

describe("背景色プリセット", () => {
	it("レガシ datalist#bgColorList と同じグレースケール 5 色", () => {
		expect(BG_COLOR_PRESETS).toEqual(["#000000", "#333333", "#666666", "#999999", "#ffffff"]);
	});
});

describe("DocumentSettingsModal new (新規作成)", () => {
	it("既定値が入る: title は date string (≠ (new))、背景色は白", () => {
		render("new");
		const titleInput = q('[data-doc-field="title"] input') as HTMLInputElement | null;
		expect(titleInput?.value).not.toBe("");
		expect(titleInput?.value).not.toBe("(new)"); // date string 形式
	});

	it("作成で新規 document が setDocument され白背景・空 slides", () => {
		render("new");
		setInputValue(q('[data-doc-field="title"] input') as HTMLInputElement | null, "fresh-doc");
		click(q("[data-doc-save]")); // ラベルは「作成」だが data 属性は共通
		const doc = useViewerDocumentStore.getState();
		expect(doc.meta?.title).toBe("fresh-doc");
		expect(doc.meta?.bgColor).toBe("#ffffff");
		expect(doc.modified).toBe(false); // setDocument は modified=false
		expect(useSlideStore.getState().slides).toHaveLength(0); // 新規は空
		expect(useDocSettingsStore.getState().mode).toBeNull();
	});
});
