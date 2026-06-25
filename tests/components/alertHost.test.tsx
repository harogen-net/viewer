import { MantineProvider } from "@mantine/core";
import type { FC } from "react";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { AlertHost } from "../../src/components/common/AlertHost";
import { useAlert, type UseAlert } from "../../src/hooks/useAlert";
import { useAlertStore } from "../../src/state/alertStore";

// 汎用モーダル (useAlert + AlertHost) のテスト。window.alert/confirm/prompt の Promise 置換。

let api: UseAlert;
let container: HTMLDivElement;
let root: Root;

const Probe: FC = () => {
	api = useAlert();
	return <AlertHost />;
};

beforeEach(() => {
	useAlertStore.getState().clear();
	container = document.createElement("div");
	document.body.appendChild(container);
	root = createRoot(container);
	act(() => {
		root.render(
			<MantineProvider>
				<Probe />
			</MantineProvider>
		);
	});
});

afterEach(() => {
	act(() => root.unmount());
	container.remove();
	useAlertStore.getState().clear();
});

// Mantine Modal は portal (document.body) に描画されるため document 全体から検索する。
const q = (sel: string): HTMLElement | null => document.querySelector<HTMLElement>(sel);
const click = (el: HTMLElement | null): void => {
	act(() => {
		el?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
	});
};

describe("useAlert + AlertHost", () => {
	it("confirm: OK で true、メッセージを表示", async () => {
		let result: boolean | undefined;
		act(() => {
			api.confirm("削除しますか?").then((r) => {
				result = r;
			});
		});
		expect(q("[data-alert-message]")?.textContent).toContain("削除しますか?");
		click(q("[data-alert-ok]"));
		await act(async () => {});
		expect(result).toBe(true);
		// 解決後はリクエストが畳まれる
		expect(useAlertStore.getState().request).toBeNull();
	});

	it("confirm: キャンセルで false", async () => {
		let result: boolean | undefined;
		act(() => {
			api.confirm("ok?").then((r) => {
				result = r;
			});
		});
		click(q("[data-alert-cancel]"));
		await act(async () => {});
		expect(result).toBe(false);
	});

	it("prompt: 入力 + OK で文字列、キャンセルで null", async () => {
		let result: string | null | undefined;
		act(() => {
			api.prompt("名前", "init").then((r) => {
				result = r;
			});
		});
		const input = q("[data-alert-input]") as HTMLInputElement | null;
		expect(input?.value).toBe("init");
		act(() => {
			if (input) {
				const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
				setter?.call(input, "edited");
				input.dispatchEvent(new Event("input", { bubbles: true }));
			}
		});
		click(q("[data-alert-ok]"));
		await act(async () => {});
		expect(result).toBe("edited");
	});

	it("prompt: キャンセルで null", async () => {
		let result: string | null | undefined = "x";
		act(() => {
			api.prompt("名前").then((r) => {
				result = r;
			});
		});
		click(q("[data-alert-cancel]"));
		await act(async () => {});
		expect(result).toBeNull();
	});

	it("alert: OK のみ (cancel ボタンなし) で resolve", async () => {
		let done = false;
		act(() => {
			api.alert("保存しました").then(() => {
				done = true;
			});
		});
		expect(q("[data-alert-cancel]")).toBeNull(); // alert はキャンセル無し
		click(q("[data-alert-ok]"));
		await act(async () => {});
		expect(done).toBe(true);
	});
});
