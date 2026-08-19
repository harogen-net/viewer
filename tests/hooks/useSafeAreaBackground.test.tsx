import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { useSafeAreaBackground } from "../../src/hooks/useSafeAreaBackground";

// safe-area (ノッチ / ホームインジケータ) の塗り。
//
// 検証の主眼は「有効中に色が反映され、解除で元へ確実に戻る」こと。戻し漏れがあると
// スライドショーやロック画面を抜けた後もアプリ全体が黒いままになる。
// 色は引数で受けるので、特定の色 (黒) に依存した検証はしない。

const Probe = ({ active, color }: { active: boolean; color: string }): null => {
	useSafeAreaBackground(active, color);
	return null;
};

let container: HTMLDivElement;
let root: Root;

const render = (active: boolean, color = "#123456"): void => {
	act(() => {
		root.render(<Probe active={active} color={color} />);
	});
};

const html = (): HTMLElement => document.documentElement;
const themeMeta = (): HTMLMetaElement | null =>
	document.querySelector<HTMLMetaElement>('meta[name="theme-color"]');

beforeEach(() => {
	container = document.createElement("div");
	document.body.appendChild(container);
	root = createRoot(container);
	// 前のテストの残骸を消す (jsdom の document は共有される)。
	html().removeAttribute("data-safe-area-bg");
	html().style.removeProperty("--safe-area-bg");
	themeMeta()?.remove();
});

afterEach(() => {
	act(() => root.unmount());
	container.remove();
});

describe("useSafeAreaBackground", () => {
	it("active で属性・CSS 変数・theme-color に指定色が入る", () => {
		render(true, "#abcdef");
		expect(html().hasAttribute("data-safe-area-bg")).toBe(true);
		expect(html().style.getPropertyValue("--safe-area-bg")).toBe("#abcdef");
		expect(themeMeta()?.getAttribute("content")).toBe("#abcdef");
	});

	it("色は引数どおり反映される (黒に限定しない)", () => {
		render(true, "#111111");
		expect(html().style.getPropertyValue("--safe-area-bg")).toBe("#111111");
		expect(themeMeta()?.getAttribute("content")).toBe("#111111");
	});

	it("active=false では何も触らない", () => {
		render(false);
		expect(html().hasAttribute("data-safe-area-bg")).toBe(false);
		expect(html().style.getPropertyValue("--safe-area-bg")).toBe("");
		expect(themeMeta()).toBeNull();
	});

	// 戻し漏れると、抜けた後もアプリ全体が指定色のままになる。
	it("active=false へ戻すと属性・CSS 変数が消える", () => {
		render(true);
		render(false);
		expect(html().hasAttribute("data-safe-area-bg")).toBe(false);
		expect(html().style.getPropertyValue("--safe-area-bg")).toBe("");
	});

	it("meta を自分で作った場合はアンマウントで除去する", () => {
		expect(themeMeta()).toBeNull();
		render(true);
		expect(themeMeta()).not.toBeNull();
		act(() => root.unmount());
		expect(themeMeta()).toBeNull();
		// afterEach の unmount が二重にならないよう作り直す。
		root = createRoot(container);
	});

	it("既存の meta があれば元の値へ戻す (除去しない)", () => {
		const meta = document.createElement("meta");
		meta.setAttribute("name", "theme-color");
		meta.setAttribute("content", "#ffffff");
		document.head.appendChild(meta);

		render(true, "#000000");
		expect(themeMeta()?.getAttribute("content")).toBe("#000000");

		render(false);
		expect(themeMeta()).not.toBeNull();
		expect(themeMeta()?.getAttribute("content")).toBe("#ffffff");
		meta.remove();
	});

	it("色を変えると追従する", () => {
		render(true, "#111111");
		render(true, "#222222");
		expect(html().style.getPropertyValue("--safe-area-bg")).toBe("#222222");
		expect(themeMeta()?.getAttribute("content")).toBe("#222222");
	});
});
