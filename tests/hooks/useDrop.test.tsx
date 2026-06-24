import type { DragEvent as ReactDragEvent, FC } from "react";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { useDrop, type UseDropOptions, type UseDropResult } from "../../src/hooks/useDrop";

// v4 Group D D-11: useDrop の drop 振り分けロジック単体テスト。
// imageId 経路優先 / image ファイル natural-sort / 非画像除外 / isOver 状態 / disabled を検証。
// (実 DnD イベントは jsdom で dataTransfer を伴わないため、handler を mock event で直接呼ぶ。)

let api: UseDropResult;
let root: Root;
let div: HTMLDivElement;

const Probe: FC<UseDropOptions> = (opts) => {
	api = useDrop(opts);
	return null;
};

const render = (opts: UseDropOptions = {}): void => {
	act(() => root.render(<Probe {...opts} />));
};

beforeEach(() => {
	div = document.createElement("div");
	document.body.appendChild(div);
	root = createRoot(div);
});

afterEach(() => {
	act(() => root.unmount());
	div.remove();
});

// DnD イベントの最小 mock (handler が触る prop のみ)。
interface MockDragInit {
	imageId?: string;
	files?: File[];
	relatedInside?: boolean;
}
// テスト用の最小 mock event (ReactDragEvent 全体は満たさず、handler が触る prop のみ)。
const mockEvent = (init: MockDragInit = {}): ReactDragEvent => {
	const node = document.createElement("div");
	const child = document.createElement("span");
	node.appendChild(child);
	return {
		preventDefault: () => {},
		dataTransfer: {
			dropEffect: "",
			effectAllowed: "",
			getData: (type: string) => (type === "imageId" ? (init.imageId ?? "") : ""),
			files: init.files ?? [],
		},
		currentTarget: node,
		relatedTarget: init.relatedInside ? child : document.body,
	} as unknown as ReactDragEvent;
};

const imgFile = (name: string): File => new File(["x"], name, { type: "image/png" });

describe("useDrop (v4 Group D D-11)", () => {
	it("imageId drop は onImageId を呼び、onFile は呼ばない", async () => {
		const seenIds: string[] = [];
		const seenFiles: File[] = [];
		render({ onImageId: (id) => void seenIds.push(id), onFile: (f) => void seenFiles.push(f) });
		await act(async () => {
			await api.dropProps.onDrop(mockEvent({ imageId: "sha-abc" }));
		});
		expect(seenIds).toEqual(["sha-abc"]);
		expect(seenFiles).toEqual([]);
	});

	it("imageId と files 両方ある場合は imageId を優先 (onFile 不呼)", async () => {
		const seenIds: string[] = [];
		const seenFiles: File[] = [];
		render({ onImageId: (id) => void seenIds.push(id), onFile: (f) => void seenFiles.push(f) });
		await act(async () => {
			await api.dropProps.onDrop(mockEvent({ imageId: "sha-xyz", files: [imgFile("a.png")] }));
		});
		expect(seenIds).toEqual(["sha-xyz"]);
		expect(seenFiles).toEqual([]);
	});

	it("file drop は image/* のみ natural-sort 順で onFile を呼ぶ", async () => {
		const seen: string[] = [];
		const text = new File(["x"], "note.txt", { type: "text/plain" });
		render({ onFile: (f) => void seen.push(f.name) });
		await act(async () => {
			await api.dropProps.onDrop(
				mockEvent({ files: [imgFile("img10.png"), text, imgFile("img2.png"), imgFile("img1.png")] })
			);
		});
		// 非画像 (note.txt) は除外、img1 < img2 < img10 の natural 順
		expect(seen).toEqual(["img1.png", "img2.png", "img10.png"]);
	});

	it("dragover で isOver=true、zone 外への dragleave で false", () => {
		render({});
		expect(api.isOver).toBe(false);
		act(() => api.dropProps.onDragOver(mockEvent()));
		expect(api.isOver).toBe(true);
		// relatedTarget が zone 外 (document.body) → 解除
		act(() => api.dropProps.onDragLeave(mockEvent()));
		expect(api.isOver).toBe(false);
	});

	it("子要素間の dragleave (relatedTarget が zone 内) では isOver を維持", () => {
		render({});
		act(() => api.dropProps.onDragOver(mockEvent()));
		expect(api.isOver).toBe(true);
		act(() => api.dropProps.onDragLeave(mockEvent({ relatedInside: true })));
		expect(api.isOver).toBe(true);
	});

	it("disabled の間は dragover で isOver を立てず、drop も無視", async () => {
		const seenIds: string[] = [];
		const seenFiles: File[] = [];
		render({
			disabled: true,
			onImageId: (id) => void seenIds.push(id),
			onFile: (f) => void seenFiles.push(f),
		});
		act(() => api.dropProps.onDragOver(mockEvent()));
		expect(api.isOver).toBe(false);
		await act(async () => {
			await api.dropProps.onDrop(mockEvent({ imageId: "sha-abc", files: [imgFile("a.png")] }));
		});
		expect(seenIds).toEqual([]);
		expect(seenFiles).toEqual([]);
	});
});
