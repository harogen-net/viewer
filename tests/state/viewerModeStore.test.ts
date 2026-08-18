import { describe, expect, it } from "vitest";
import {
	EditCapability,
	isCapabilityAllowed,
	isEditable,
	resolveViewerMode,
	ViewerMode,
} from "../../src/state/viewerModeStore";

// 起動モード解決の純関数テスト (docs/mode-spec.md §2.2)。
// 優先順位: URL ?mode=view (最優先) → mobile PWA 判定 → EDIT (既定)。

describe("resolveViewerMode", () => {
	it("?mode=view は mobile=false でも閲覧モード", () => {
		expect(resolveViewerMode("?mode=view", false)).toBe(ViewerMode.VIEW);
		expect(resolveViewerMode("?foo=1&mode=view", false)).toBe(ViewerMode.VIEW);
	});

	it("mobile=true (PWA 判定) は URL 指定なしでも閲覧モード", () => {
		expect(resolveViewerMode("", true)).toBe(ViewerMode.VIEW);
		expect(resolveViewerMode("?foo=1", true)).toBe(ViewerMode.VIEW);
	});

	it("URL 指定なし・mobile=false は編集モード", () => {
		expect(resolveViewerMode("", false)).toBe(ViewerMode.EDIT);
		expect(resolveViewerMode("?mode=edit", false)).toBe(ViewerMode.EDIT);
		expect(resolveViewerMode("?new=1", false)).toBe(ViewerMode.EDIT);
		expect(resolveViewerMode("?mode=other", false)).toBe(ViewerMode.EDIT);
	});

	it("?mode=view と mobile=true 双方でも VIEW (重複指定は VIEW)", () => {
		expect(resolveViewerMode("?mode=view", true)).toBe(ViewerMode.VIEW);
	});
});

describe("isEditable", () => {
	it("EDIT のみ true", () => {
		expect(isEditable(ViewerMode.EDIT)).toBe(true);
		expect(isEditable(ViewerMode.VIEW)).toBe(false);
	});
});

describe("isCapabilityAllowed", () => {
	// VIEW モード (スマホ) でも、スライドショーの見え方を変えるだけの操作は通す。
	// ここが崩れると「スマホで何も直せない」か「スマホから文書構造まで壊せる」のどちらかになる。
	it("EDIT モードはすべての操作種別を許可する", () => {
		expect(isCapabilityAllowed(ViewerMode.EDIT, EditCapability.FULL)).toBe(true);
		expect(isCapabilityAllowed(ViewerMode.EDIT, EditCapability.SLIDE_PLAYBACK)).toBe(true);
	});

	it("VIEW モードは再生設定のみ許可し、編集全般は拒否する", () => {
		expect(isCapabilityAllowed(ViewerMode.VIEW, EditCapability.SLIDE_PLAYBACK)).toBe(true);
		expect(isCapabilityAllowed(ViewerMode.VIEW, EditCapability.FULL)).toBe(false);
	});
});
