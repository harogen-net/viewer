import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { AppShell } from "../../src/components/AppShell";
import { APP_LOCK_RECORD_VERSION, useAppLockStore } from "../../src/state/appLockStore";
import { useViewerDocumentStore } from "../../src/state/viewerDocumentStore";
import { useViewerModeStore, ViewerMode } from "../../src/state/viewerModeStore";
import type { AppLockRecord } from "../../src/types/AppLock";
import { AppLockStatus } from "../../src/types/AppLock";

// この機能の核となる回帰テスト:
// 「ロック中は AppMain をマウントしない」= 認証前にアプリ本体の副作用を一切走らせない。
// 条件分岐で個別に止めるのではなくツリーごと不在にしている、という構造を守る。

const dummyRecord = (): AppLockRecord => ({
	version: APP_LOCK_RECORD_VERSION,
	verifier: {
		security: {
			version: 1,
			kdf: "PBKDF2",
			kdfIterations: 150_000,
			salt: "c2FsdA==",
			cipher: "AES-GCM",
			iv: "aXZpdg==",
		},
		ciphertext: "Y2lwaGVy",
	},
	userHandle: "dXNlcg==",
	credentialId: null,
	failureCount: 0,
});

let container: HTMLDivElement;
let root: Root;

const render = (): void => {
	act(() => {
		root.render(<AppShell />);
	});
};

beforeEach(() => {
	container = document.createElement("div");
	document.body.appendChild(container);
	root = createRoot(container);
	// 起動時の自動 document 生成が走るかどうかを見たいので EDIT モード + document 未ロード。
	useViewerModeStore.setState({ mode: ViewerMode.EDIT, isMobileEnv: false });
	useViewerDocumentStore.getState().setDocument(null);
});

afterEach(() => {
	act(() => root.unmount());
	container.remove();
	useAppLockStore.setState({
		status: AppLockStatus.DISABLED,
		record: null,
		failureCount: 0,
		busy: false,
		lastFailure: null,
		lockoutUntil: 0,
	});
	useViewerDocumentStore.getState().setDocument(null);
});

describe("AppShell ロックゲート", () => {
	it("LOCKED ではアプリ本体を一切描画しない", () => {
		useAppLockStore.setState({ status: AppLockStatus.LOCKED, record: dummyRecord() });
		render();
		expect(document.querySelector("[data-app-lock]")).not.toBeNull();
		expect(document.querySelector("[data-top-bar]")).toBeNull();
		expect(document.querySelector("[data-slide-list-area]")).toBeNull();
		expect(document.querySelector("[data-viewer-mode]")).toBeNull();
	});

	it("LOCKED では起動時の document 自動生成が走らない (副作用ゼロ)", () => {
		useAppLockStore.setState({ status: AppLockStatus.LOCKED, record: dummyRecord() });
		render();
		expect(useViewerDocumentStore.getState().meta).toBeNull();
	});

	it("DISABLED では従来どおりアプリ本体を描画し、document を自動生成する", () => {
		useAppLockStore.setState({ status: AppLockStatus.DISABLED, record: null });
		render();
		expect(document.querySelector("[data-app-lock]")).toBeNull();
		expect(document.querySelector("[data-top-bar]")).not.toBeNull();
		expect(useViewerDocumentStore.getState().meta).not.toBeNull();
	});

	it("UNLOCKED でもアプリ本体を描画する", () => {
		useAppLockStore.setState({ status: AppLockStatus.UNLOCKED, record: dummyRecord() });
		render();
		expect(document.querySelector("[data-app-lock]")).toBeNull();
		expect(document.querySelector("[data-top-bar]")).not.toBeNull();
	});

	it("解錠するとアプリ本体がマウントされる", () => {
		useAppLockStore.setState({ status: AppLockStatus.LOCKED, record: dummyRecord() });
		render();
		expect(document.querySelector("[data-top-bar]")).toBeNull();
		act(() => {
			useAppLockStore.getState().unlock();
		});
		expect(document.querySelector("[data-app-lock]")).toBeNull();
		expect(document.querySelector("[data-top-bar]")).not.toBeNull();
	});
});
