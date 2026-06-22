import { MantineProvider } from "@mantine/core";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { ImageLibraryPanel } from "../../src/components/panels/ImageLibraryPanel";
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
			</MantineProvider>,
		);
	});
};

const seedImages = (entries: Record<string, { dataURL: string; name?: string }>): void => {
	useImageLibraryStore.setState({ imageById: entries });
};

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
			'[data-image-tile][data-image-id="id-a"]',
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
});
