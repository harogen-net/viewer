import { MantineProvider } from "@mantine/core";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { ImageLibraryPanel } from "../../src/components/panels/ImageLibraryPanel";
import type { Slide } from "../../src/types/Slide";
import { useHistoryStore } from "../../src/state/historyStore";
import { useImageLibraryStore } from "../../src/state/imageLibraryStore";
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
		expect(document.body.textContent).toContain("ファイルをここにドロップ");
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

	it("各 tile に data-image-id 属性 + 削除ボタンが付く", () => {
		seedImages({ "id-a": { dataURL: "data:image/png;base64,A", name: "a.png" } });
		render(true);
		const tile = document.body.querySelector<HTMLElement>(
			'[data-image-tile][data-image-id="id-a"]'
		);
		expect(tile).not.toBeNull();
		expect(tile?.querySelector("[data-image-delete]")).not.toBeNull();
	});

	it("ファイル追加ボタン (data-image-add-button) が描画される", () => {
		render(true);
		expect(document.body.querySelector("[data-image-add-button]")).not.toBeNull();
	});

	it("Drop zone コンテナ (data-image-library-drop-zone) が描画される", () => {
		render(true);
		expect(document.body.querySelector("[data-image-library-drop-zone]")).not.toBeNull();
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

	it("各 tile に 配置 / 差し替え ボタンが付く (クリック自動配置は廃止)", () => {
		seedImages({ "id-a": { dataURL: "data:image/png;base64,A" } });
		render(true);
		const tile = document.body.querySelector<HTMLElement>(
			'[data-image-tile][data-image-id="id-a"]'
		);
		expect(tile?.querySelector("[data-image-place]")).not.toBeNull();
		expect(tile?.querySelector("[data-image-replace]")).not.toBeNull();
		// tile 本体に click ハンドラ由来の actionable フラグは無い (ドラッグ元のみ)。
		expect(tile?.getAttribute("data-actionable")).toBeNull();
	});

	it("差し替え用の隠し file input が描画される (画像対画像差し替え)", () => {
		seedImages({ "id-a": { dataURL: "data:image/png;base64,A" } });
		render(true);
		expect(document.body.querySelector("[data-image-replace-input]")).not.toBeNull();
	});

	it("配置ボタンはスライド未選択で disabled、選択で enabled", () => {
		seedImages({ "id-a": { dataURL: "data:image/png;base64,A" } });
		// スライド未選択
		render(true);
		expect(document.body.querySelector<HTMLButtonElement>("[data-image-place]")?.disabled).toBe(
			true
		);
		// スライド選択
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
		expect(document.body.querySelector<HTMLButtonElement>("[data-image-place]")?.disabled).toBe(
			false
		);
	});

	it("各 tile に DL ボタン (data-image-download) が付く", () => {
		seedImages({ "id-a": { dataURL: "data:image/png;base64,A" } });
		render(true);
		const tile = document.body.querySelector<HTMLElement>(
			'[data-image-tile][data-image-id="id-a"]'
		);
		expect(tile?.querySelector("[data-image-download]")).not.toBeNull();
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
});
