import { MantineProvider } from "@mantine/core";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ImageLibraryPanel } from "../../src/components/panels/ImageLibraryPanel";
import { useHistoryStore } from "../../src/state/historyStore";
import { useImageLibraryStore } from "../../src/state/imageLibraryStore";
import { useLayerStore } from "../../src/state/layerStore";
import { useSlideStore } from "../../src/state/slideStore";
import { useViewerDocumentStore } from "../../src/state/viewerDocumentStore";

// ライブラリ画像のドラッグ中に Drawer を下へ引っ込める状態機械のテスト。
//
// 実際の HTML5 DnD (ゴースト / dropEffect / 下地への貫通) は jsdom では再現できないため、
// ここで押さえるのは「どのイベントで引っ込め、どのイベントで戻すか」の判定だけ。
// ドロップ内容の振り分けは tests/hooks/useDrop.test.tsx が担当する。
//
// 最重要は「dragstart 直後の pointercancel で引っ込めが解除されないこと」。
// Chrome はネイティブドラッグ開始時に pointercancel を発火するため、これを終了扱いに
// すると開始直後に自分で状態を巻き戻し、ドロップ先にイベントが永久に届かなくなる
// (この機能が長く動かなかった原因)。

let container: HTMLDivElement;
let root: Root;
let closeCalls: number;

const IMAGE_ID = "sha-drag";

beforeEach(() => {
	useSlideStore.getState().setSlides([]);
	useImageLibraryStore.setState({
		imageById: { [IMAGE_ID]: { dataURL: "data:image/png;base64,AA", name: "a.png" } },
	});
	useLayerStore.getState().setLayers([]);
	useHistoryStore.getState().clear();
	useViewerDocumentStore.setState({ meta: null, modified: false });
	closeCalls = 0;
	container = document.createElement("div");
	document.body.appendChild(container);
	root = createRoot(container);
});

afterEach(() => {
	act(() => root.unmount());
	container.remove();
});

const render = (opened = true): void => {
	act(() => {
		root.render(
			<MantineProvider>
				<ImageLibraryPanel
					opened={opened}
					onClose={() => {
						closeCalls += 1;
					}}
				/>
			</MantineProvider>
		);
	});
};

// dragstart → setDragging(true) は次 tick に回している (ドラッグゴースト確定待ち) ので、
// 判定前に macrotask を 1 つ挟む。
const flushTick = async (): Promise<void> => {
	await act(async () => {
		await new Promise((resolve) => setTimeout(resolve, 0));
	});
};

const tileImg = (): HTMLElement => {
	const el = document.body.querySelector<HTMLElement>(
		`[data-image-tile][data-image-id="${IMAGE_ID}"] img`
	);
	if (!el) throw new Error("tile img が見つからない");
	return el;
};

// jsdom の Event には dataTransfer が無く、タイル側の onDragStart (setData) が落ちるので
// 最小限のスタブを載せる。中身は本テストの対象外 (useDrop.test.tsx が担当)。
const fire = (target: EventTarget, type: string): void => {
	const e = new Event(type, { bubbles: true });
	Object.defineProperty(e, "dataTransfer", {
		value: {
			setData: () => {},
			getData: () => "",
			effectAllowed: "",
			dropEffect: "",
			files: [],
		},
	});
	act(() => void target.dispatchEvent(e));
};

// 引っ込め中だけ出る中止ガイド (= dragging 状態の可視化) の有無。
const retracted = (): boolean =>
	document.body.querySelector("[data-image-drag-cancel-hint]") !== null;

// Drawer の .inner に載せた translateY (引っ込め量)。非ドラッグ時は空。
const innerTransform = (): string => {
	const panel = document.body.querySelector<HTMLElement>("[data-image-library-panel]");
	const inner = panel?.querySelector<HTMLElement>("div[style*='translateY']");
	return inner?.style.transform ?? "";
};

describe("ImageLibraryPanel ドラッグ中の引っ込め", () => {
	it("タイル発源の dragstart で Drawer を下へ引っ込める", async () => {
		render();
		expect(retracted()).toBe(false);
		fire(tileImg(), "dragstart");
		// ゴースト確定前 (同 tick) はまだ動かさない
		expect(retracted()).toBe(false);
		await flushTick();
		expect(retracted()).toBe(true);
		expect(innerTransform()).toMatch(/translateY\(/);
	});

	it("dragstart 直後の pointercancel では引っ込めを解除しない (Chrome の回帰ガード)", async () => {
		render();
		fire(tileImg(), "dragstart");
		// Chrome はドラッグ開始時にこれを撃つ。終了扱いにすると引っ込めが永久に起きない。
		fire(tileImg(), "pointercancel");
		fire(tileImg(), "pointerup");
		fire(tileImg(), "mouseup");
		await flushTick();
		expect(retracted()).toBe(true);
	});

	it("タイル以外から始まった dragstart は無視する", async () => {
		render();
		fire(container, "dragstart");
		await flushTick();
		expect(retracted()).toBe(false);
	});

	it("ドロップせずに dragend したら引っ込めを戻し、パネルは閉じない", async () => {
		render();
		fire(tileImg(), "dragstart");
		await flushTick();
		expect(retracted()).toBe(true);
		fire(tileImg(), "dragend");
		await flushTick();
		expect(retracted()).toBe(false);
		expect(closeCalls).toBe(0);
	});

	it("パネル外へ drop → dragend でパネルを閉じる (結果を見せる)", async () => {
		render();
		fire(tileImg(), "dragstart");
		await flushTick();
		fire(container, "drop"); // 下地の drop zone に着地した想定
		expect(closeCalls).toBe(0); // 片付けは dragend でまとめて行う
		fire(tileImg(), "dragend");
		await flushTick();
		expect(closeCalls).toBe(1);
	});

	it("引っ込めた Drawer 自身へ戻す drop は中止 (閉じずに元の位置へ)", async () => {
		render();
		fire(tileImg(), "dragstart");
		await flushTick();
		fire(tileImg(), "drop"); // パネル内 = 中止
		fire(tileImg(), "dragend");
		await flushTick();
		expect(closeCalls).toBe(0);
		expect(retracted()).toBe(false);
	});

	it("dragend が来なくても次の pointerdown で引っ込めから復帰する", async () => {
		render();
		fire(tileImg(), "dragstart");
		await flushTick();
		expect(retracted()).toBe(true);
		// dragend なしで放置 (stuck) → 次に画面を触ったら戻す
		fire(container, "pointerdown");
		await flushTick();
		expect(retracted()).toBe(false);
		expect(closeCalls).toBe(0);
	});

	it("ドラッグ開始時の pointerdown では引っ込めを取り消さない", async () => {
		render();
		// 実機の順序: pointerdown → (しきい値超え) → dragstart
		fire(tileImg(), "pointerdown");
		fire(tileImg(), "dragstart");
		await flushTick();
		expect(retracted()).toBe(true);
	});

	it("アンマウント後は document リスナが残らない", async () => {
		render();
		const spy = vi.spyOn(window, "setTimeout");
		act(() => root.unmount());
		fire(document.body, "dragstart");
		expect(spy).not.toHaveBeenCalled();
		spy.mockRestore();
		// afterEach の unmount が二重にならないよう再マウントしておく
		root = createRoot(container);
	});
});
