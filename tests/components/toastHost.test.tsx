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

	it("close ボタンで該当トーストが退場 → フェードアウト後に消える", () => {
		vi.useFakeTimers();
		act(() => {
			api.info("消える");
		});
		expect(toastsInDom().length).toBe(1);
		const closeBtn = document.querySelector<HTMLButtonElement>("[data-toast] button");
		act(() => closeBtn?.dispatchEvent(new MouseEvent("click", { bubbles: true })));
		// 退場アニメ中はまだ DOM に残り、exiting フラグが立つ (即除去ではない)。
		expect(toastsInDom().length).toBe(1);
		expect(toastsInDom()[0].getAttribute("data-toast-exiting")).toBe("true");
		// フェードアウト (EXIT_MS=200ms) 完了で除去。
		act(() => vi.advanceTimersByTime(200));
		expect(toastsInDom().length).toBe(0);
	});

	it("duration 経過で退場開始し、フェードアウト後に自動消滅する", () => {
		vi.useFakeTimers();
		act(() => {
			api.success("auto", { duration: 1000 });
		});
		expect(toastsInDom().length).toBe(1);
		act(() => vi.advanceTimersByTime(1000));
		// duration 満了で退場開始 (まだ DOM に残る)。
		expect(toastsInDom().length).toBe(1);
		expect(toastsInDom()[0].getAttribute("data-toast-exiting")).toBe("true");
		act(() => vi.advanceTimersByTime(200)); // フェードアウト完了
		expect(toastsInDom().length).toBe(0);
	});

	it("error は既定 duration が長め (3000ms ではまだ残る)", () => {
		vi.useFakeTimers();
		act(() => {
			api.error("err");
		});
		act(() => vi.advanceTimersByTime(3000));
		expect(toastsInDom().length).toBe(1); // error 既定 5000ms なのでまだ残る
		expect(toastsInDom()[0].getAttribute("data-toast-exiting")).toBe("false"); // まだ退場していない
		act(() => vi.advanceTimersByTime(2000)); // 計 5000ms → 退場開始
		expect(toastsInDom()[0].getAttribute("data-toast-exiting")).toBe("true");
		act(() => vi.advanceTimersByTime(200)); // フェードアウト完了
		expect(toastsInDom().length).toBe(0);
	});

	it("容器は画面右下 (bottom/right) に固定配置される", () => {
		act(() => {
			api.success("pos");
		});
		const host = document.querySelector<HTMLElement>("[data-toast-host]");
		expect(host?.style.position).toBe("fixed");
		expect(host?.style.bottom).toBe("16px");
		expect(host?.style.right).toBe("16px");
		expect(host?.style.top).toBe(""); // top 配置ではない
	});
});
