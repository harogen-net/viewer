import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { useShellKeyboard } from "../../src/hooks/useShellKeyboard";
import { useClipboardStore } from "../../src/state/clipboardStore";
import { useHistoryStore } from "../../src/state/historyStore";
import { useLayerStore } from "../../src/state/layerStore";
import { useSlideStore } from "../../src/state/slideStore";
import { useViewerDocumentStore } from "../../src/state/viewerDocumentStore";
import type { ImageLayer, Layer } from "../../src/types/Layer";
import type { Slide } from "../../src/types/Slide";

// v4 Group D D-8: useShellKeyboard — Ctrl/Cmd+C/X/V を clipboard 操作にマップ。

const baseTransform = {
	transX: 0,
	transY: 0,
	scaleX: 1,
	scaleY: 1,
	rotation: 0,
	mirrorH: false,
	mirrorV: false,
};
const makeImageLayer = (id: number, uuid: string): ImageLayer => ({
	id,
	uuid,
	name: "",
	opacity: 1,
	locked: false,
	visible: true,
	shared: false,
	...baseTransform,
	type: "image",
	imageId: `img-${id}`,
	clipRect: [0, 0, 0, 0],
	isText: false,
});
const makeSlide = (layers: Layer[]): Slide => ({
	id: 1,
	uuid: "s1",
	width: 800,
	height: 600,
	durationRatio: 1,
	joining: true,
	disabled: false,
	layers,
});

let root: Root;
let div: HTMLDivElement;

const mount = (): void => {
	div = document.createElement("div");
	document.body.appendChild(div);
	root = createRoot(div);
	const Host = (): null => {
		useShellKeyboard();
		return null;
	};
	act(() => root.render(<Host />));
};

const dispatchKey = (key: string, opts: KeyboardEventInit = {}, target?: EventTarget): void => {
	const ev = new KeyboardEvent("keydown", { key, ctrlKey: true, bubbles: true, ...opts });
	if (target) {
		target.dispatchEvent(ev);
	} else {
		window.dispatchEvent(ev);
	}
};

beforeEach(() => {
	useSlideStore.getState().setSlides([makeSlide([makeImageLayer(1, "a")])]);
	useSlideStore.getState().setSelectedIndex(0);
	useLayerStore.getState().setSelectedLayer(makeImageLayer(1, "a"));
	useViewerDocumentStore.getState().setModified(false);
	useHistoryStore.getState().clear();
	useClipboardStore.getState().clear();
	mount();
});

afterEach(() => {
	act(() => root.unmount());
	div.remove();
	useClipboardStore.getState().clear();
});

describe("useShellKeyboard (v4 Group D D-8)", () => {
	it("Ctrl+C で copy (clipboard に積まれる)", () => {
		act(() => dispatchKey("c"));
		expect(useClipboardStore.getState().layer?.uuid).toBe("a");
	});

	it("Ctrl+V で paste (layer が追加される)", () => {
		act(() => dispatchKey("c"));
		act(() => dispatchKey("v"));
		expect(useSlideStore.getState().slides[0].layers).toHaveLength(2);
	});

	it("Ctrl+X で cut (clipboard に積まれ layer 削除)", () => {
		act(() => dispatchKey("x"));
		expect(useClipboardStore.getState().layer?.uuid).toBe("a");
		expect(useSlideStore.getState().slides[0].layers).toHaveLength(0);
	});

	it("修飾なしの c は無視 (ブラウザ既定を阻害しない)", () => {
		act(() => dispatchKey("c", { ctrlKey: false }));
		expect(useClipboardStore.getState().layer).toBeNull();
	});

	it("input 要素にフォーカス中は無視 (テキスト編集優先)", () => {
		const input = document.createElement("input");
		document.body.appendChild(input);
		act(() => dispatchKey("c", {}, input));
		expect(useClipboardStore.getState().layer).toBeNull();
		input.remove();
	});

	it("Cmd+C (metaKey) でも copy する", () => {
		act(() => dispatchKey("c", { ctrlKey: false, metaKey: true }));
		expect(useClipboardStore.getState().layer?.uuid).toBe("a");
	});
});
