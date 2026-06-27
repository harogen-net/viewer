import { MantineProvider } from "@mantine/core";
import type { FC } from "react";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ToastHost } from "../../src/components/common/ToastHost";
import { useToast, type UseToast } from "../../src/hooks/useToast";
import { useToastStore } from "../../src/state/toastStore";

// トースト (useToast + toastStore + ToastHost) のテスト。非ブロッキング・自動消滅・複数スタック。

let api: UseToast;
let container: HTMLDivElement;
let root: Root;

const Probe: FC = () => {
	api = useToast();
	return <ToastHost />;
};

beforeEach(() => {
	useToastStore.setState({ toasts: [] });
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
	useToastStore.setState({ toasts: [] });
	vi.useRealTimers();
});

const toastsInDom = (): NodeListOf<HTMLElement> =>
	document.querySelectorAll<HTMLElement>("[data-toast]");

describe("useToast + ToastHost", () => {
	it("show で 1 件描画され、メッセージと kind を反映", () => {
		act(() => {
			api.success("保存しました");
		});
		const toasts = toastsInDom();
		expect(toasts.length).toBe(1);
		expect(toasts[0].getAttribute("data-toast-kind")).toBe("success");
		expect(document.querySelector("[data-toast-message]")?.textContent).toBe("保存しました");
	});

	it("複数 show で複数スタック表示", () => {
		act(() => {
			api.success("a");
			api.error("b");
			api.info("c");
		});
		expect(toastsInDom().length).toBe(3);
	});

	it("close ボタンで該当トーストが消える", () => {
		act(() => {
			api.info("消える");
		});
		expect(toastsInDom().length).toBe(1);
		const closeBtn = document.querySelector<HTMLButtonElement>("[data-toast] button");
		act(() => closeBtn?.dispatchEvent(new MouseEvent("click", { bubbles: true })));
		expect(toastsInDom().length).toBe(0);
	});

	it("duration 経過で自動消滅する", () => {
		vi.useFakeTimers();
		act(() => {
			api.success("auto", { duration: 1000 });
		});
		expect(toastsInDom().length).toBe(1);
		act(() => vi.advanceTimersByTime(1000));
		expect(toastsInDom().length).toBe(0);
	});

	it("error は既定 duration が長め (3000ms ではまだ残る)", () => {
		vi.useFakeTimers();
		act(() => {
			api.error("err");
		});
		act(() => vi.advanceTimersByTime(3000));
		expect(toastsInDom().length).toBe(1); // error 既定 5000ms なのでまだ残る
		act(() => vi.advanceTimersByTime(2000));
		expect(toastsInDom().length).toBe(0);
	});
});
