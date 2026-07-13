import { MantineProvider } from "@mantine/core";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { DocumentPickerGrid } from "../../src/components/panels/DocumentPickerModal";
import { type StorageApi, useStorage } from "../../src/hooks/useStorage";
import { useImageLibraryStore } from "../../src/state/imageLibraryStore";
import { useSensitiveSessionStore } from "../../src/state/sensitiveSessionStore";
import type { ViewerDocument } from "../../src/types/ViewerDocument";

// エンドツーエンド確認 (モックなし): 実 useStorage で sensitive を保存 → 実 listTitles →
// 実 DocumentPickerGrid に流し込み、🔒 バッジが出ることを通しで検証する。

let api: StorageApi;
let hookRoot: Root;
let hookDiv: HTMLDivElement;
let gridRoot: Root;
let gridDiv: HTMLDivElement;

const deleteDb = (): Promise<void> =>
	new Promise((res) => {
		const r = indexedDB.deleteDatabase("viewer");
		r.onsuccess = () => res();
		r.onerror = () => res();
		r.onblocked = () => res();
	});

const makeDoc = (title: string, isSensitive: boolean): ViewerDocument => ({
	title,
	width: 800,
	height: 600,
	createTime: 1,
	editTime: 2,
	isSensitive,
	slides: [{ id: 1, uuid: "s1", width: 800, height: 600, durationRatio: 1, joining: true, disabled: false, layers: [] }],
});

beforeEach(async () => {
	await deleteDb();
	useImageLibraryStore.setState({ imageById: {} });
	useSensitiveSessionStore.setState({ password: null });
	hookDiv = document.createElement("div");
	document.body.appendChild(hookDiv);
	hookRoot = createRoot(hookDiv);
	const Probe = (): null => {
		api = useStorage();
		return null;
	};
	act(() => {
		hookRoot.render(<Probe />);
	});
	gridDiv = document.createElement("div");
	document.body.appendChild(gridDiv);
	gridRoot = createRoot(gridDiv);
});

afterEach(() => {
	act(() => hookRoot.unmount());
	act(() => gridRoot.unmount());
	hookDiv.remove();
	gridDiv.remove();
	useSensitiveSessionStore.setState({ password: null });
});

describe("picker sensitive badge (end-to-end)", () => {
	it("sensitive を保存 → listTitles → グリッドで 🔒、非 sensitive は無し", async () => {
		useSensitiveSessionStore.setState({ password: "pw" });
		await act(async () => {
			await api.save(makeDoc("secret-doc", true), { override: true });
			await api.save(makeDoc("plain-doc", false), { override: true });
		});
		const titles = await api.listTitles();
		expect(titles.find((t) => t.title === "secret-doc")?.isSensitive).toBe(true);

		act(() => {
			gridRoot.render(
				<MantineProvider>
					<DocumentPickerGrid
						titles={titles}
						loadThumbnail={async () => null}
						selectedTitle={null}
						onPick={() => {}}
					/>
				</MantineProvider>
			);
		});
		expect(
			gridDiv.querySelector('[data-picker-item="secret-doc"] [data-picker-sensitive]')
		).not.toBeNull();
		expect(
			gridDiv.querySelector('[data-picker-item="plain-doc"] [data-picker-sensitive]')
		).toBeNull();
	});
});
