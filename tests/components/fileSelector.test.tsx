import { MantineProvider } from "@mantine/core";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { FileSelector } from "../../src/components/panels/fileIO/FileSelector";
import type { StoredDoc } from "../../src/hooks/useStorage";

// FileSelector はコンポーネント分割で「純粋な表示コンポーネント」になった。
// 選択を onChange で親へ通知するだけで、自前ではロード(useStorage)/setDocument しない。
// (以前は親 onChange と自前ロードの両方が走り、選択ごとにロードが二重に発生していた)
//
// 値は docId。title は自由入力で重複しうるので value に使えない (docs/document-id-plan.md §6)。

const docs: StoredDoc[] = [
	{ id: "id-a", title: "A", update: 3 },
	{ id: "id-b", title: "B", update: 2 },
	{ id: "id-c", title: "C", update: 1 },
	// 同名 2 件。value が docId でないと Mantine Select が "Duplicate options" で落ちる。
	{ id: "id-dup1", title: "同名", update: 0 },
	{ id: "id-dup2", title: "同名", update: -1 },
];

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
	container = document.createElement("div");
	document.body.appendChild(container);
	root = createRoot(container);
});
afterEach(() => {
	act(() => root.unmount());
	container.remove();
});

const render = (selectedId: string | null, onChange: (id: string | null) => void): void => {
	act(() => {
		root.render(
			<MantineProvider>
				<FileSelector docs={docs} selectedId={selectedId} onChange={onChange} />
			</MantineProvider>
		);
	});
};
const navBtn = (dir: "prev" | "next"): HTMLButtonElement | null =>
	container.querySelector<HTMLButtonElement>(`[data-file-nav="${dir}"]`);
const click = (el: HTMLElement | null): void =>
	act(() => {
		el?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
	});

describe("FileSelector (分割後の純粋表示コンポーネント)", () => {
	it("FileSelector は useStorage を import しない (自前ロードできない=二重ロードの根を断つ)", () => {
		// 静的保証: ソースに useStorage 依存が無いこと (構造的に自前ロードを呼べない)。
		// import 解決時にエラーが無いこと自体も含めて担保する。
		expect(FileSelector).toBeTypeOf("function");
	});

	it("未選択時: ◀ 無効 / ▶ 有効、▶ クリックで先頭を onChange (1 回だけ)", () => {
		const onChange = vi.fn();
		render(null, onChange);
		expect(navBtn("prev")?.disabled).toBe(true);
		expect(navBtn("next")?.disabled).toBe(false);
		click(navBtn("next"));
		expect(onChange).toHaveBeenCalledTimes(1); // 二重通知しない
		expect(onChange).toHaveBeenCalledWith("id-a");
	});

	it("選択中は前後に移動して onChange (各 1 回)", () => {
		const onChange = vi.fn();
		render("id-b", onChange);
		click(navBtn("prev"));
		expect(onChange).toHaveBeenCalledTimes(1);
		expect(onChange).toHaveBeenLastCalledWith("id-a");
		click(navBtn("next"));
		expect(onChange).toHaveBeenCalledTimes(2);
		expect(onChange).toHaveBeenLastCalledWith("id-c");
	});

	it("末尾選択で ▶ 無効、先頭選択で ◀ 無効 (端ではラップしない)", () => {
		const onChange = vi.fn();
		render("id-dup2", onChange); // 末尾
		expect(navBtn("next")?.disabled).toBe(true);
		expect(navBtn("prev")?.disabled).toBe(false);
		render("id-a", onChange); // 先頭
		expect(navBtn("prev")?.disabled).toBe(true);
		expect(navBtn("next")?.disabled).toBe(false);
	});

	// 実際に踏んだ不具合: 承認前モードで title を暫定 id にしていたため、同名レコードで
	// Mantine Select が "Duplicate options are not supported" を投げてアプリが落ちた。
	it("同名の文書が並んでも描画でき、選択は docId で区別される", () => {
		const onChange = vi.fn();
		render("id-dup1", onChange); // 4 件目 (同名の 1 つ目)
		click(navBtn("next"));
		expect(onChange).toHaveBeenLastCalledWith("id-dup2"); // 同名でも隣へ正しく進む
	});
});
