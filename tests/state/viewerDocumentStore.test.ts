import { beforeEach, describe, expect, it } from "vitest";
import { useViewerDocumentStore } from "../../src/state/viewerDocumentStore";
import { createNewViewerDocument } from "../../src/utils/viewerDocumentFactory";

// markSaved: 保存完了マーク (title 同期 + modified=false、history/slides は触らない)。

const makeMeta = (title: string) => {
	const { slides: _slides, ...meta } = createNewViewerDocument();
	return { ...meta, title };
};

beforeEach(() => {
	useViewerDocumentStore.setState({ meta: null, modified: false, progress: null });
});

describe("viewerDocumentStore.markSaved", () => {
	it("meta.title を保存名へ同期し modified を false にする", () => {
		useViewerDocumentStore.setState({ meta: makeMeta("(new)"), modified: true });
		useViewerDocumentStore.getState().markSaved("2026-06-25_120000");
		const s = useViewerDocumentStore.getState();
		expect(s.meta?.title).toBe("2026-06-25_120000");
		expect(s.modified).toBe(false);
	});

	it("meta が null でも modified を false に戻す (meta は null のまま)", () => {
		useViewerDocumentStore.setState({ meta: null, modified: true });
		useViewerDocumentStore.getState().markSaved("x");
		const s = useViewerDocumentStore.getState();
		expect(s.meta).toBeNull();
		expect(s.modified).toBe(false);
	});
});
