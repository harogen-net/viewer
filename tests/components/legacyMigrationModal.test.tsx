import { MantineProvider } from "@mantine/core";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// 移行の確認 UI (docs/document-id-plan.md「設計変更」)。
// 移行は取り消せないため、**二段階の確認**を通すまで実行しない。probe / 実行は mock で差し替え、
// ここでは「どういう条件で何が起きるか」の配線だけを見る (移行そのものは
// useStorage.migration.test.tsx が実データで検証する)。

const { probeMock, runMock } = vi.hoisted(() => ({
	probeMock: vi.fn(),
	runMock: vi.fn(),
}));
vi.mock("../../src/hooks/useStorage", () => ({
	probeLegacyDocs: probeMock,
	runLegacyMigration: runMock,
}));

import { LegacyMigrationModal } from "../../src/components/panels/LegacyMigrationModal";
import { MigrationStatus, useMigrationStore } from "../../src/state/migrationStore";

let container: HTMLDivElement;
let root: Root;

const render = async (): Promise<void> => {
	await act(async () => {
		root.render(
			<MantineProvider>
				<LegacyMigrationModal />
			</MantineProvider>
		);
	});
	await act(async () => {
		await Promise.resolve();
	});
};

const q = (sel: string): HTMLElement | null => document.body.querySelector<HTMLElement>(sel);
const click = (el: HTMLElement | null): void => {
	act(() => el?.dispatchEvent(new MouseEvent("click", { bubbles: true })));
};
const step = (): string | null => q("[data-migration-modal]")?.getAttribute("data-migration-step") ?? null;

beforeEach(() => {
	probeMock.mockReset();
	runMock.mockReset();
	runMock.mockResolvedValue(0);
	useMigrationStore.setState({
		status: MigrationStatus.UNKNOWN,
		legacyCount: 0,
		legacyTitles: [],
		progress: 0,
		error: null,
	});
	container = document.createElement("div");
	document.body.appendChild(container);
	root = createRoot(container);
});

afterEach(() => {
	act(() => root.unmount());
	container.remove();
});

describe("旧形式が無いとき", () => {
	it("何も表示せず、状態は NONE になる", async () => {
		probeMock.mockResolvedValue({ count: 0, titles: [] });
		await render();
		expect(useMigrationStore.getState().status).toBe(MigrationStatus.NONE);
		expect(q("[data-migration-modal]")).toBeNull();
		expect(q("[data-migration-resume-bar]")).toBeNull();
	});

	// probe が失敗しても PENDING にしない: PENDING のままだとストレージが不活性になり、
	// アプリが何もできなくなる (旧データは残るので次回起動でやり直せる)。
	it("probe が失敗しても移行不要として扱う", async () => {
		probeMock.mockRejectedValue(new Error("boom"));
		await render();
		expect(useMigrationStore.getState().status).toBe(MigrationStatus.NONE);
	});
});

describe("旧形式があるとき", () => {
	beforeEach(() => {
		probeMock.mockResolvedValue({ count: 3, titles: ["旧A", "旧B", "旧C"] });
	});

	it("1 段目に件数と対象文書名を出す (打ち切らない)", async () => {
		await render();
		expect(useMigrationStore.getState().status).toBe(MigrationStatus.PENDING);
		expect(step()).toBe("1");
		const titles = q("[data-migration-titles]");
		expect(titles?.textContent).toContain("旧A");
		expect(titles?.textContent).toContain("旧C");
	});

	it("1 段目では実行しない (「移行に進む」は 2 段目へ進むだけ)", async () => {
		await render();
		click(q("[data-migration-next]"));
		expect(step()).toBe("2");
		expect(runMock).not.toHaveBeenCalled();
	});

	it("2 段目から戻れる", async () => {
		await render();
		click(q("[data-migration-next]"));
		click(q("[data-migration-back]"));
		expect(step()).toBe("1");
		expect(runMock).not.toHaveBeenCalled();
	});

	it("2 段目で実行して初めて移行が走り、完了で DONE になる", async () => {
		runMock.mockResolvedValue(3);
		await render();
		click(q("[data-migration-next]"));
		click(q("[data-migration-run]"));
		expect(runMock).toHaveBeenCalledTimes(1);
		await act(async () => {
			await Promise.resolve();
		});
		expect(useMigrationStore.getState().status).toBe(MigrationStatus.DONE);
		expect(q("[data-migration-modal]")).toBeNull();
	});

	// 「後で」でバックアップを取りに行けるようにするのが目的なので、閉じても PENDING のまま
	// (= 読み取り専用) にし、戻る導線を残す。
	it("「後で」で閉じても PENDING のままで、再開バーから戻れる", async () => {
		await render();
		click(q("[data-migration-later]"));
		expect(q("[data-migration-modal]")).toBeNull();
		expect(useMigrationStore.getState().status).toBe(MigrationStatus.PENDING);

		const bar = q("[data-migration-resume-bar]");
		expect(bar).not.toBeNull();
		expect(bar?.textContent).toContain("3");

		click(q("[data-migration-resume]"));
		expect(step()).toBe("1");
	});

	it("失敗したら FAILED を出し、データが残っていることを伝える", async () => {
		runMock.mockRejectedValue(new Error("write failed"));
		await render();
		click(q("[data-migration-next]"));
		click(q("[data-migration-run]"));
		await act(async () => {
			await Promise.resolve();
		});
		expect(useMigrationStore.getState().status).toBe(MigrationStatus.FAILED);
		expect(step()).toBe("failed");
		expect(q("[data-migration-modal]")?.textContent).toContain("失われていません");
		expect(q("[data-migration-reload]")).not.toBeNull();
	});
});
