import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// FileIOToolbar / FileIOSubMenu が共有する非同期アクション補助の制御フロー検証。
// useToast / useAlert を差し替えて hook 単体の挙動 (例外捕捉・破棄ガード) を確認する。
const { errorMock, confirmMock } = vi.hoisted(() => ({
	errorMock: vi.fn(),
	confirmMock: vi.fn(),
}));
vi.mock("../../src/hooks/useToast", () => ({
	useToast: () => ({ show: vi.fn(), success: vi.fn(), error: errorMock, info: vi.fn() }),
}));
vi.mock("../../src/hooks/useAlert", () => ({
	useAlert: () => ({ alert: vi.fn(), confirm: confirmMock, prompt: vi.fn(), choice: vi.fn() }),
}));

import { useFileIOCommon } from "../../src/components/panels/fileIO/useFileIOCommon";
import { useViewerDocumentStore } from "../../src/state/viewerDocumentStore";

let root: Root;
let div: HTMLDivElement;
let api: ReturnType<typeof useFileIOCommon>;

const mount = (): void => {
	div = document.createElement("div");
	document.body.appendChild(div);
	root = createRoot(div);
	const Host = (): null => {
		api = useFileIOCommon();
		return null;
	};
	act(() => root.render(<Host />));
};

beforeEach(() => {
	errorMock.mockReset();
	confirmMock.mockReset();
	useViewerDocumentStore.setState({ modified: false });
	mount();
});

afterEach(() => {
	act(() => root.unmount());
	div.remove();
	useViewerDocumentStore.setState({ modified: false });
});

describe("useFileIOCommon", () => {
	describe("wrap", () => {
		it("正常時は action を実行し error toast を出さない", async () => {
			const action = vi.fn(async () => {});
			await act(async () => {
				await api.wrap(action)();
			});
			expect(action).toHaveBeenCalledOnce();
			expect(errorMock).not.toHaveBeenCalled();
		});

		it("action が throw したら error toast を出す (再 throw しない)", async () => {
			const action = vi.fn(async () => {
				throw new Error("boom");
			});
			await act(async () => {
				await api.wrap(action)();
			});
			expect(errorMock).toHaveBeenCalledOnce();
			expect(errorMock.mock.calls[0][0]).toContain("boom");
		});
	});

	describe("confirmDiscardIfModified", () => {
		it("未変更なら確認なしで true", async () => {
			useViewerDocumentStore.setState({ modified: false });
			let result: boolean | undefined;
			await act(async () => {
				result = await api.confirmDiscardIfModified();
			});
			expect(result).toBe(true);
			expect(confirmMock).not.toHaveBeenCalled();
		});

		it("変更ありなら alert.confirm の結果を返す", async () => {
			useViewerDocumentStore.setState({ modified: true });
			confirmMock.mockResolvedValueOnce(false);
			let result: boolean | undefined;
			await act(async () => {
				result = await api.confirmDiscardIfModified();
			});
			expect(confirmMock).toHaveBeenCalledOnce();
			expect(result).toBe(false);
		});
	});
});
