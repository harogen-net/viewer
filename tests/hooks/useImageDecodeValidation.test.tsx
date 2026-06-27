import type { FC } from "react";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { useImageLibraryMutation } from "../../src/hooks/useImageLibraryMutation";
import { useImageLibraryStore } from "../../src/state/imageLibraryStore";

// 未対応画像 (HEIC 等、MIME は image/* でもブラウザがデコード不能) を addImageFile で
// 弾く検証。このファイルは「<img> が必ず onerror になる」環境を全体に適用するため、
// 通常の load 発火 (tests/setup) とは別ファイルに隔離する。

let origSrc: PropertyDescriptor | undefined;

beforeEach(() => {
	origSrc = Object.getOwnPropertyDescriptor(HTMLImageElement.prototype, "src");
	// src セット時に load ではなく error を発火 (デコード失敗を再現)。
	Object.defineProperty(HTMLImageElement.prototype, "src", {
		configurable: true,
		enumerable: true,
		get() {
			return "";
		},
		set() {
			queueMicrotask(() => this.dispatchEvent(new Event("error")));
		},
	});
	useImageLibraryStore.setState({ imageById: {} });
});

afterEach(() => {
	if (origSrc) Object.defineProperty(HTMLImageElement.prototype, "src", origSrc);
	useImageLibraryStore.setState({ imageById: {} });
});

const dataUrl =
	"data:image/heic;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVQYV2NgAAIAAAUAAeImBZsAAAAASUVORK5CYII=";

let api: ReturnType<typeof useImageLibraryMutation>;
const Probe: FC = () => {
	api = useImageLibraryMutation();
	return null;
};

let container: HTMLDivElement;
let root: Root;
const mount = (): void => {
	container = document.createElement("div");
	document.body.appendChild(container);
	root = createRoot(container);
	act(() => root.render(<Probe />));
};

afterEach(() => {
	if (root) act(() => root.unmount());
	container?.remove();
});

describe("画像デコード検証 (HEIC 等の未対応形式)", () => {
	it("addImageDataUrl: デコード不能なら reject し library に登録しない", async () => {
		mount();
		await expect(api.addImageDataUrl(dataUrl, "broken.heic")).rejects.toThrow();
		expect(Object.keys(useImageLibraryStore.getState().imageById).length).toBe(0);
	});

	it("addImageFile: デコード不能なら reject (差し替え/配置に進まない)", async () => {
		mount();
		const file = new File([new Uint8Array([1, 2, 3])], "x.heic", { type: "image/heic" });
		await expect(api.addImageFile(file)).rejects.toThrow();
		expect(Object.keys(useImageLibraryStore.getState().imageById).length).toBe(0);
	});
});
