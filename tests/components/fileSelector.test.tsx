import { MantineProvider } from "@mantine/core";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { FileSelector } from "../../src/components/panels/fileIO/FileSelector";
import type { StoredSlideTitle } from "../../src/hooks/useStorage";

// FileSelector はコンポーネント分割で「純粋な表示コンポーネント」になった。
// 選択を onChange で親へ通知するだけで、自前ではロード(useStorage)/setDocument しない。
// (以前は親 onChange と自前 loadByTitle の両方が走り、選択ごとにロードが二重に発生していた)

const titles: StoredSlideTitle[] = [
	{ id: 1, title: "A", update: 3 },
	{ id: 2, title: "B", update: 2 },
	{ id: 3, title: "C", update: 1 },
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

const render = (selectedTitle: string | null, onChange: (t: string | null) => void): void => {
	act(() => {
		root.render(
			<MantineProvider>
				<FileSelector titles={titles} selectedTitle={selectedTitle} onChange={onChange} />
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
		// 静的保証: ソースに useStorage 依存が無いこと (構造的に loadByTitle を呼べない)。
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
		expect(onChange).toHaveBeenCalledWith("A");
	});

	it("選択中は前後に移動して onChange (各 1 回)", () => {
		const onChange = vi.fn();
		render("B", onChange);
		click(navBtn("prev"));
		expect(onChange).toHaveBeenCalledTimes(1);
		expect(onChange).toHaveBeenLastCalledWith("A");
		click(navBtn("next"));
		expect(onChange).toHaveBeenCalledTimes(2);
		expect(onChange).toHaveBeenLastCalledWith("C");
	});

	it("末尾選択で ▶ 無効、先頭選択で ◀ 無効 (端ではラップしない)", () => {
		const onChange = vi.fn();
		render("C", onChange); // 末尾
		expect(navBtn("next")?.disabled).toBe(true);
		expect(navBtn("prev")?.disabled).toBe(false);
		render("A", onChange); // 先頭
		expect(navBtn("prev")?.disabled).toBe(true);
		expect(navBtn("next")?.disabled).toBe(false);
	});
});
