import { describe, expect, it } from "vitest";
import {
	isPcMode,
	isWriteAllowed,
	LaunchMode,
	resolveLaunchMode,
	WriteCapability,
} from "../../src/state/launchModeStore";

// 起動モード (軸 A: PCモード / スマホモード) の解決と、書込可否の純関数テスト。
// 用語の定義は docs/mode-spec.md §1、判定順は §2.2。
// 優先順位: URL ?mode=mobile (最優先) → スマホ環境判定 → PCモード (既定)。

describe("resolveLaunchMode", () => {
	it("?mode=mobile はスマホ環境でなくてもスマホモード", () => {
		expect(resolveLaunchMode("?mode=mobile", false)).toBe(LaunchMode.MOBILE);
		expect(resolveLaunchMode("?foo=1&mode=mobile", false)).toBe(LaunchMode.MOBILE);
	});

	// 改名前のクエリ値。既存のブックマーク / 検証手順を壊さないよう受け続ける。
	it("?mode=view (旧名) もスマホモードとして受ける", () => {
		expect(resolveLaunchMode("?mode=view", false)).toBe(LaunchMode.MOBILE);
		expect(resolveLaunchMode("?foo=1&mode=view", false)).toBe(LaunchMode.MOBILE);
	});

	it("スマホ環境判定が true なら URL 指定なしでもスマホモード", () => {
		expect(resolveLaunchMode("", true)).toBe(LaunchMode.MOBILE);
		expect(resolveLaunchMode("?foo=1", true)).toBe(LaunchMode.MOBILE);
	});

	it("URL 指定なし・スマホ環境でない場合は PCモード", () => {
		expect(resolveLaunchMode("", false)).toBe(LaunchMode.PC);
		expect(resolveLaunchMode("?mode=pc", false)).toBe(LaunchMode.PC);
		expect(resolveLaunchMode("?new=1", false)).toBe(LaunchMode.PC);
		expect(resolveLaunchMode("?mode=other", false)).toBe(LaunchMode.PC);
	});

	it("クエリとスマホ環境判定が重複してもスマホモード", () => {
		expect(resolveLaunchMode("?mode=mobile", true)).toBe(LaunchMode.MOBILE);
	});
});

describe("isPcMode", () => {
	it("PCモードのみ true", () => {
		expect(isPcMode(LaunchMode.PC)).toBe(true);
		expect(isPcMode(LaunchMode.MOBILE)).toBe(false);
	});
});

describe("isWriteAllowed", () => {
	// スマホモードでも、スライドショーの見え方を変えるだけの操作は通す。
	// ここが崩れると「スマホで何も直せない」か「スマホから文書構造まで壊せる」のどちらかになる。
	it("PCモードはすべての操作種別を許可する", () => {
		expect(isWriteAllowed(LaunchMode.PC, WriteCapability.FULL)).toBe(true);
		expect(isWriteAllowed(LaunchMode.PC, WriteCapability.SLIDE_PLAYBACK)).toBe(true);
	});

	it("スマホモードは再生設定のみ許可し、書込全般は拒否する", () => {
		expect(isWriteAllowed(LaunchMode.MOBILE, WriteCapability.SLIDE_PLAYBACK)).toBe(true);
		expect(isWriteAllowed(LaunchMode.MOBILE, WriteCapability.FULL)).toBe(false);
	});
});
