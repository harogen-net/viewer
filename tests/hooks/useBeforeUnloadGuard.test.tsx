import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { useBeforeUnloadGuard } from "../../src/hooks/useBeforeUnloadGuard";
import { useViewerDocumentStore } from "../../src/state/viewerDocumentStore";

// 未保存変更がある時だけ beforeunload を抑止する (タブ閉じ/リロード警告)。

let root: Root;
let div: HTMLDivElement;

const mount = (): void => {
	div = document.createElement("div");
	document.body.appendChild(div);
	root = createRoot(div);
	const Host = (): null => {
		useBeforeUnloadGuard();
		return null;
	};
	act(() => root.render(<Host />));
};

// beforeunload を発火し、preventDefault が呼ばれたか (= 離脱抑止) を返す。
const fireBeforeUnload = (): boolean => {
	const ev = new Event("beforeunload", { cancelable: true });
	act(() => {
		window.dispatchEvent(ev);
	});
	return ev.defaultPrevented;
};

beforeEach(() => {
	useViewerDocumentStore.setState({ modified: false });
	mount();
});

afterEach(() => {
	act(() => root.unmount());
	div.remove();
	useViewerDocumentStore.setState({ modified: false });
});

describe("useBeforeUnloadGuard", () => {
	it("modified=false では離脱を抑止しない", () => {
		expect(fireBeforeUnload()).toBe(false);
	});

	it("modified=true では離脱を抑止する", () => {
		act(() => {
			useViewerDocumentStore.setState({ modified: true });
		});
		expect(fireBeforeUnload()).toBe(true);
	});

	it("modified を false に戻すと抑止しなくなる (listener 解除)", () => {
		act(() => {
			useViewerDocumentStore.setState({ modified: true });
		});
		expect(fireBeforeUnload()).toBe(true);
		act(() => {
			useViewerDocumentStore.setState({ modified: false });
		});
		expect(fireBeforeUnload()).toBe(false);
	});

	it("unmount 後は抑止しない (cleanup)", () => {
		act(() => {
			useViewerDocumentStore.setState({ modified: true });
		});
		act(() => root.unmount());
		expect(fireBeforeUnload()).toBe(false);
		// afterEach の unmount を二重に呼ばないよう、ダミーへ差し替え
		mount();
	});
});
