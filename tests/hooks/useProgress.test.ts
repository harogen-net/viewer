import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { createElement } from "react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { type UseProgress, useProgress } from "../../src/hooks/useProgress";
import { useViewerDocumentStore } from "../../src/state/viewerDocumentStore";

// useProgress.run の意味論を検証:
//   - report は 0..0.999 にクランプ (途中でバーを完了させない)
//   - タスク成功 (非 null) → progress=1 (100% まで伸ばして自然消滅)
//   - タスク null (キャンセル) / 例外 (エラー) → progress=null (明示的 Abort = 即消し)

let container: HTMLDivElement;
let root: Root;
let api: UseProgress;

const setup = (): void => {
	container = document.createElement("div");
	document.body.appendChild(container);
	root = createRoot(container);
	const Probe = (): null => {
		api = useProgress();
		return null;
	};
	act(() => root.render(createElement(Probe)));
};

const progress = () => useViewerDocumentStore.getState().progress;
const label = () => useViewerDocumentStore.getState().progressLabel;

beforeEach(() => {
	useViewerDocumentStore.setState({ progress: null, progressLabel: "" });
	setup();
});

afterEach(() => {
	act(() => root.unmount());
	container.remove();
});

describe("useProgress.run", () => {
	it("report は 0.999 上限にクランプされ、途中で完了 (>=1) しない", async () => {
		await act(async () => {
			await api.run("保存中…", async (report) => {
				report(0.5);
				expect(progress()).toBe(0.5);
				expect(label()).toBe("保存中…");
				report(1); // 完了させようとしても
				expect(progress()).toBe(0.999); // クランプされる
				return "ok";
			});
		});
	});

	it("タスク成功 (非 null) → progress=1 (自然消滅アニメへ)", async () => {
		await act(async () => {
			await api.run("書き出し中…", async (report) => {
				report(0.3);
				return "done";
			});
		});
		expect(progress()).toBe(1);
	});

	it("タスク null (キャンセル) → progress=null (即 Abort)", async () => {
		await act(async () => {
			await api.run("保存中…", async (report) => {
				report(0.4);
				return null; // キャンセル
			});
		});
		expect(progress()).toBeNull();
	});

	it("タスク例外 (エラー) → progress=null (即 Abort)、例外は再送出", async () => {
		let threw = false;
		await act(async () => {
			try {
				await api.run("保存中…", async () => {
					throw new Error("boom");
				});
			} catch {
				threw = true;
			}
		});
		expect(threw).toBe(true);
		expect(progress()).toBeNull();
	});
});
