import { describe, expect, it } from "vitest";
import { resolveViewerMode, ViewerMode } from "../../src/state/viewerModeStore";

// 起動モード解決 (URL ?mode=view → 閲覧、それ以外 → 編集) の純関数テスト。

describe("resolveViewerMode", () => {
	it("?mode=view は閲覧モード", () => {
		expect(resolveViewerMode("?mode=view")).toBe(ViewerMode.VIEW);
		expect(resolveViewerMode("?foo=1&mode=view")).toBe(ViewerMode.VIEW);
	});

	it("指定なし / mode=edit / 他は編集モード (既定)", () => {
		expect(resolveViewerMode("")).toBe(ViewerMode.EDIT);
		expect(resolveViewerMode("?mode=edit")).toBe(ViewerMode.EDIT);
		expect(resolveViewerMode("?new=1")).toBe(ViewerMode.EDIT);
		expect(resolveViewerMode("?mode=other")).toBe(ViewerMode.EDIT);
	});
});
