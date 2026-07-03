import { MantineProvider } from "@mantine/core";
import type { FC } from "react";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { SensitiveUnlockModal } from "../../src/components/common/SensitiveUnlockModal";
import {
	useSensitivePassword,
	type UseSensitivePassword,
} from "../../src/hooks/useSensitivePassword";
import { useSensitiveSessionStore } from "../../src/state/sensitiveSessionStore";

// Phase 3: セッションパスワード store + 解錠モーダルの結合テスト (useAlert + AlertHost と同型)。

let api: UseSensitivePassword;
let container: HTMLDivElement;
let root: Root;

const Probe: FC = () => {
	api = useSensitivePassword();
	return <SensitiveUnlockModal />;
};

const reset = () => useSensitiveSessionStore.setState({ password: null, request: null });

beforeEach(() => {
	reset();
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
	reset();
});

// Mantine Modal は portal (document.body) に描画されるため document 全体から検索する。
const q = (sel: string): HTMLElement | null => document.querySelector<HTMLElement>(sel);
const input = (): HTMLInputElement | null => document.querySelector<HTMLInputElement>("input");
const click = (el: HTMLElement | null): void => {
	act(() => {
		el?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
	});
};
const typeInto = (el: HTMLInputElement | null, v: string): void => {
	act(() => {
		if (!el) return;
		const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
		setter?.call(el, v);
		el.dispatchEvent(new Event("input", { bubbles: true }));
	});
};

describe("useSensitivePassword + SensitiveUnlockModal", () => {
	it("未キャッシュ: モーダルで入力→解錠 で PW を返しキャッシュする", async () => {
		let result: string | null | undefined;
		act(() => {
			api.ensurePassword().then((r) => {
				result = r;
			});
		});
		expect(q("[data-sensitive-unlock]")).not.toBeNull(); // モーダルが開く
		typeInto(input(), "secret");
		click(q("[data-sensitive-ok]"));
		await act(async () => {});
		expect(result).toBe("secret");
		expect(useSensitiveSessionStore.getState().password).toBe("secret");
	});

	it("キャッシュ済み: モーダルを出さず即返す", async () => {
		useSensitiveSessionStore.setState({ password: "cached" });
		let result: string | null | undefined;
		act(() => {
			api.ensurePassword().then((r) => {
				result = r;
			});
		});
		await act(async () => {});
		expect(result).toBe("cached");
		expect(useSensitiveSessionStore.getState().request).toBeNull(); // 入力を求めない
	});

	it("キャンセル: null を返しキャッシュしない", async () => {
		let result: string | null | undefined = "x";
		act(() => {
			api.prompt().then((r) => {
				result = r;
			});
		});
		click(q("[data-sensitive-cancel]"));
		await act(async () => {});
		expect(result).toBeNull();
		expect(useSensitiveSessionStore.getState().password).toBeNull();
	});

	it("error 指定時はエラー文言を表示する (再入力導線)", () => {
		act(() => {
			void api.prompt({ error: "パスワードが正しくありません" });
		});
		expect(q("[data-sensitive-error]")?.textContent).toContain("パスワードが正しくありません");
	});

	it("clear でセッション PW を破棄する", () => {
		useSensitiveSessionStore.setState({ password: "x" });
		act(() => api.clear());
		expect(useSensitiveSessionStore.getState().password).toBeNull();
	});
});
