import { MantineProvider } from "@mantine/core";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { ImageLibraryPanel } from "../../src/components/panels/ImageLibraryPanel";
import type { Slide } from "../../src/types/Slide";
import { useHistoryStore } from "../../src/state/historyStore";
import { useImageLibraryStore } from "../../src/state/imageLibraryStore";
import { useLayerStore } from "../../src/state/layerStore";
import { useSlideStore } from "../../src/state/slideStore";
import { useViewerDocumentStore } from "../../src/state/viewerDocumentStore";

// v4 Group D D-6a: ImageLibraryPanel UI レンダリング テスト。
// 削除確認 dialog の click → 遷移 → cascade は Mantine Modal の jsdom 制約で
// 安定再現困難なため、本ファイルでは UI の存在確認に絞る。削除ロジックは
// useImageLibraryMutation.test.tsx 側で hook 単体テストとして十分検証している。

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
	useSlideStore.getState().setSlides([]);
	useImageLibraryStore.setState({ imageById: {} });
	useLayerStore.getState().setLayers([]); // selectedLayer も null に戻す
	useHistoryStore.getState().clear();
	useViewerDocumentStore.setState({ meta: null, modified: false });
	container = document.createElement("div");
	document.body.appendChild(container);
	root = createRoot(container);
});

afterEach(() => {
	act(() => root.unmount());
	container.remove();
});

const render = (opened: boolean): void => {
	act(() => {
		root.render(
			<MantineProvider>
				<ImageLibraryPanel opened={opened} onClose={() => {}} />
			</MantineProvider>
		);
	});
};

const seedImages = (entries: Record<string, { dataURL: string; name?: string }>): void => {
	useImageLibraryStore.setState({ imageById: entries });
};

// tile の … メニューを開く (項目は portal 内に描画される)。
const openTileMenu = (id: string): void => {
	const trigger = document.body.querySelector<HTMLElement>(
		`[data-image-tile][data-image-id="${id}"] [data-image-menu]`
	);
	act(() => trigger?.dispatchEvent(new MouseEvent("click", { bubbles: true })));
};

// imageId を参照する ImageLayer を 1 枚持つ slide (未使用判定テスト用)。
const slideUsingImage = (imageId: string): Slide => ({
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
			imageId,
			clipRect: [0, 0, 0, 0],
			isText: false,
		},
	],
});

describe("ImageLibraryPanel (v4 Group D D-6a)", () => {
	it("opened=false では Drawer 中身 (グリッド/empty) が出ない", () => {
		render(false);
		expect(document.body.querySelector("[data-image-empty]")).toBeNull();
		expect(document.body.querySelector("[data-image-grid]")).toBeNull();
		expect(document.body.querySelector("[data-image-tile]")).toBeNull();
	});

	it("opened=true + 空 library で empty placeholder 表示", () => {
		render(true);
		expect(document.body.querySelector("[data-image-empty]")).not.toBeNull();
		expect(document.body.querySelector("[data-image-grid]")).toBeNull();
		expect(document.body.textContent).toContain("画像を追加");
	});

	it("列数スライダーは画像がある時だけ出る", () => {
		render(true); // 空
		expect(document.body.querySelector("[data-image-cols-slider]")).toBeNull();
		seedImages({ "id-a": { dataURL: "data:image/png;base64,A" } });
		render(true);
		expect(document.body.querySelector("[data-image-cols-slider]")).not.toBeNull();
	});

	it("画像 2 件で grid に 2 tile + 件数表示", () => {
		seedImages({
			"id-a": { dataURL: "data:image/png;base64,A", name: "a.png" },
			"id-b": { dataURL: "data:image/png;base64,B", name: "b.png" },
		});
		render(true);
		const tiles = document.body.querySelectorAll("[data-image-tile]");
		expect(tiles.length).toBe(2);
		expect(document.body.textContent).toContain("2 件");
	});

	it("各 tile に data-image-id 属性 + … 操作メニュートリガーが付く", () => {
		seedImages({ "id-a": { dataURL: "data:image/png;base64,A", name: "a.png" } });
		render(true);
		const tile = document.body.querySelector<HTMLElement>(
			'[data-image-tile][data-image-id="id-a"]'
		);
		expect(tile).not.toBeNull();
		expect(tile?.querySelector("[data-image-menu]")).not.toBeNull();
		// 削除は menu を開いて初めて出る (tile 直下には無い)。
		expect(tile?.querySelector("[data-image-delete]")).toBeNull();
		openTileMenu("id-a");
		expect(document.body.querySelector("[data-image-delete]")).not.toBeNull();
	});

	it("ファイル追加ボタン (data-image-add-button) が描画される", () => {
		render(true);
		expect(document.body.querySelector("[data-image-add-button]")).not.toBeNull();
	});

	it("ライブラリ自体へのドロップ受け入れは廃止 (drop-zone コンテナが無い)", () => {
		render(true);
		expect(document.body.querySelector("[data-image-library-drop-zone]")).toBeNull();
	});

	it("各画像のラベルに name が表示される", () => {
		seedImages({
			"id-a": { dataURL: "data:image/png;base64,A", name: "photo.png" },
		});
		render(true);
		expect(document.body.textContent).toContain("photo.png");
	});

	it("mode toggle (単体差替/まとめて差替タブ) は廃止され存在しない", () => {
		seedImages({ "id-a": { dataURL: "data:image/png;base64,A" } });
		render(true);
		expect(document.body.querySelector("[data-image-mode-control]")).toBeNull();
		expect(document.body.textContent).not.toContain("単体差替");
		expect(document.body.textContent).not.toContain("まとめて差替");
	});

	it("… メニューを開くと 配置 / 差し替え / DL / 削除 が出る", () => {
		seedImages({ "id-a": { dataURL: "data:image/png;base64,A" } });
		render(true);
		openTileMenu("id-a");
		expect(document.body.querySelector("[data-image-place]")).not.toBeNull();
		expect(document.body.querySelector("[data-image-replace]")).not.toBeNull();
		expect(document.body.querySelector("[data-image-download]")).not.toBeNull();
		expect(document.body.querySelector("[data-image-delete]")).not.toBeNull();
		// tile 本体に click ハンドラ由来の actionable フラグは無い (ドラッグ元のみ)。
		const tile = document.body.querySelector<HTMLElement>(
			'[data-image-tile][data-image-id="id-a"]'
		);
		expect(tile?.getAttribute("data-actionable")).toBeNull();
	});

	it("差し替え用の隠し file input が描画される (画像対画像差し替え)", () => {
		seedImages({ "id-a": { dataURL: "data:image/png;base64,A" } });
		render(true);
		expect(document.body.querySelector("[data-image-replace-input]")).not.toBeNull();
	});

	it("配置メニュー項目はスライド未選択で disabled", () => {
		seedImages({ "id-a": { dataURL: "data:image/png;base64,A" } });
		render(true);
		openTileMenu("id-a");
		// Mantine Menu.Item の disabled は data-disabled 属性で表現される。
		expect(
			document.body.querySelector("[data-image-place]")?.hasAttribute("data-disabled")
		).toBe(true);
	});

	it("配置メニュー項目はスライド選択で enabled", () => {
		seedImages({ "id-a": { dataURL: "data:image/png;base64,A" } });
		act(() => {
			useSlideStore.getState().setSlides([
				{
					id: 1,
					uuid: "s-1",
					width: 800,
					height: 600,
					durationRatio: 1,
					joining: false,
					disabled: false,
					layers: [],
				},
			]);
			useSlideStore.getState().setSelectedIndex(0);
		});
		render(true);
		openTileMenu("id-a");
		expect(
			document.body.querySelector("[data-image-place]")?.hasAttribute("data-disabled")
		).toBe(false);
	});

	it("未使用画像がある時「未使用を削除」ボタンが有効 (件数付き)", () => {
		act(() => useSlideStore.getState().setSlides([slideUsingImage("used")]));
		seedImages({ used: { dataURL: "data:a" }, orphan: { dataURL: "data:b" } });
		render(true);
		const btn = document.body.querySelector<HTMLButtonElement>("[data-image-prune-unused]");
		expect(btn).not.toBeNull();
		expect(btn?.disabled).toBe(false);
		expect(btn?.textContent).toContain("1"); // 未使用 1 件
	});

	it("全て使用中なら「未使用を削除」ボタンは無効", () => {
		act(() => useSlideStore.getState().setSlides([slideUsingImage("used")]));
		seedImages({ used: { dataURL: "data:a" } });
		render(true);
		expect(
			document.body.querySelector<HTMLButtonElement>("[data-image-prune-unused]")?.disabled
		).toBe(true);
	});

	// --- ライブラリ内画像で選択レイヤーを差し替え (タイル左上の差し替えアイコン) ---

	// imageId "cur" を参照する未ロック ImageLayer を選択中状態にする。
	const selectImageLayer = (opts?: { locked?: boolean }): Slide => {
		const slide = slideUsingImage("cur");
		slide.layers[0].locked = opts?.locked ?? false;
		act(() => {
			useSlideStore.getState().setSlides([slide]);
			useSlideStore.getState().setSelectedIndex(0);
			// setSelectedIndex は selectedLayer を null に戻すので、その後に選択レイヤーを設定する。
			useLayerStore.getState().setSelectedLayer(slide.layers[0]);
		});
		return slide;
	};

	const replaceBtn = (id: string): HTMLElement | null =>
		document.body.querySelector<HTMLElement>(
			`[data-image-tile][data-image-id="${id}"] [data-image-replace-selected]`
		);

	it("未ロック ImageLayer 選択中は、現在画像以外のタイルに差し替えアイコンが出る", () => {
		selectImageLayer();
		seedImages({ cur: { dataURL: "data:a" }, other: { dataURL: "data:b" } });
		render(true);
		// 現在画像のタイルには出ない (差し替え不要)、別画像のタイルには出る。
		expect(replaceBtn("cur")).toBeNull();
		expect(replaceBtn("other")).not.toBeNull();
	});

	it("選択レイヤーが無いときは差し替えアイコンが出ない", () => {
		// setSelectedIndex 未実行 = selectedLayer null。
		seedImages({ cur: { dataURL: "data:a" }, other: { dataURL: "data:b" } });
		render(true);
		expect(replaceBtn("cur")).toBeNull();
		expect(replaceBtn("other")).toBeNull();
	});

	it("選択レイヤーがロック中なら差し替えアイコンが出ない", () => {
		selectImageLayer({ locked: true });
		seedImages({ cur: { dataURL: "data:a" }, other: { dataURL: "data:b" } });
		render(true);
		expect(replaceBtn("other")).toBeNull();
	});

	it("差し替えアイコン押下で選択レイヤーの imageId がそのタイルの画像に変わる", () => {
		selectImageLayer();
		seedImages({ cur: { dataURL: "data:a" }, other: { dataURL: "data:b" } });
		render(true);
		const btn = replaceBtn("other");
		expect(btn).not.toBeNull();
		act(() => btn?.dispatchEvent(new MouseEvent("click", { bubbles: true })));
		// 選択レイヤー (index 0) の imageId が "cur" → "other" に差し替わる。transform は不問。
		const layer = useSlideStore.getState().slides[0].layers[0];
		expect(layer.type === "image" ? layer.imageId : null).toBe("other");
	});
});
