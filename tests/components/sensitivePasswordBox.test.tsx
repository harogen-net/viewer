import { MantineProvider } from "@mantine/core";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { DocumentPickerModal } from "../../src/components/panels/DocumentPickerModal";
import { useSensitiveSessionStore } from "../../src/state/sensitiveSessionStore";

// DocumentPickerModal 下部の PW ボックス。値は sensitiveSessionStore に保持し、
// コンポーネント再マウントでも消えない (リロードで消える) ことを検証する。

let container: HTMLDivElement;
let root: Root;

const render = (): void => {
	act(() => {
		root.render(
			<MantineProvider>
				<DocumentPickerModal
					opened
					onClose={() => {}}
					docs={[]}
					loadThumbnail={async () => null}
					selectedId={null}
					onPick={() => {}}
				/>
			</MantineProvider>
		);
	});
};

const pwInput = (): HTMLInputElement | null =>
	document.querySelector<HTMLInputElement>("[data-sensitive-pw-box] input") ??
	document.querySelector<HTMLInputElement>("input");

const type = (v: string): void => {
	act(() => {
		const el = pwInput();
		if (!el) return;
		const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
		setter?.call(el, v);
		el.dispatchEvent(new Event("input", { bubbles: true }));
	});
};

beforeEach(() => {
	useSensitiveSessionStore.setState({ password: null });
	container = document.createElement("div");
	document.body.appendChild(container);
	root = createRoot(container);
	render();
});

afterEach(() => {
	act(() => root.unmount());
	container.remove();
	useSensitiveSessionStore.setState({ password: null });
});

describe("SensitivePasswordBox", () => {
	it("入力すると store.password に反映される", () => {
		type("hunter2");
		expect(useSensitiveSessionStore.getState().password).toBe("hunter2");
	});

	it("空にすると null に正規化される", () => {
		type("x");
		type("");
		expect(useSensitiveSessionStore.getState().password).toBeNull();
	});

	it("store の値が box に表示される", () => {
		act(() => useSensitiveSessionStore.getState().setPassword("fromStore"));
		expect(pwInput()?.value).toBe("fromStore");
	});

	it("再マウントしても値が保持される (store 由来)", () => {
		type("keepme");
		// ピッカーを閉じる相当: unmount → 再 mount
		act(() => root.unmount());
		root = createRoot(container);
		render();
		expect(pwInput()?.value).toBe("keepme");
		expect(useSensitiveSessionStore.getState().password).toBe("keepme");
	});
});
