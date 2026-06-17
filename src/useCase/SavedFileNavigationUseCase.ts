import { uiStore } from "../state/uiStore";
import type { DocumentStorageUseCase, StorageActionResult } from "./DocumentStorageUseCase";

/**
 * Saved-file selection / navigation operations.
 *
 * The selected saved file id is owned by `uiStore.storage.selectedId` (set in R2.0);
 * these helpers keep that store consistent with the storage adapter's title list and
 * provide thin orchestration on top of `DocumentStorageUseCase`.
 */
export type SavedFileNavigationUseCase = {
	/** Read the current selection from uiStore. */
	getSelectedId(): string | null;
	/** Normalize and write a saved-file id into uiStore.storage.selectedId. */
	setSelection(fileId: string | null): void;
	/** Find the index of a saved-file id within the current title list. -1 if absent. */
	findIndex(selectedId: string | null): number;
	/** Ensure a valid selection exists, falling back to the first title; returns the id chosen. */
	ensureSelected(): string | null;
	/** Move selection forward by one (clamped to last). No-op when the list is empty. */
	selectNext(): void;
	/** Move selection backward by one (clamped to first). No-op when the list is empty. */
	selectPrevious(): void;
	/** Load the currently selected saved file. Returns null when no selection is available. */
	loadSelected(): Promise<StorageActionResult> | null;
	/** Delete a saved file by id (and adjust selection beforehand to mirror legacy behavior). */
	deleteById(fileId: string): Promise<StorageActionResult> | null;
	/** Delete the currently selected saved file. */
	deleteSelected(): Promise<StorageActionResult> | null;
	/** Load a specific saved file by id. Updates selection first. */
	loadById(fileId: string): Promise<StorageActionResult> | null;
};

export function createSavedFileNavigationUseCase(
	storage: DocumentStorageUseCase
): SavedFileNavigationUseCase {
	const getTitles = () => storage.getTitles();

	const setSelection = (fileId: string | null): void => {
		const nextId = fileId == null || fileId === "-1" ? null : String(fileId);
		uiStore.getState().setStorageSelection(nextId);
	};

	const getSelectedId = (): string | null => uiStore.getState().storage.selectedId;

	const findIndex = (selectedId: string | null): number => {
		if (!selectedId) return -1;
		const titles = getTitles();
		return titles.findIndex((t) => String(t.id) === selectedId);
	};

	const ensureSelected = (): string | null => {
		const current = getSelectedId();
		if (current && findIndex(current) !== -1) {
			return current;
		}
		const titles = getTitles();
		if (titles.length === 0) {
			setSelection(null);
			return null;
		}
		const firstId = String(titles[0].id);
		setSelection(firstId);
		return firstId;
	};

	return {
		getSelectedId,
		setSelection,
		findIndex,
		ensureSelected,
		selectNext(): void {
			const titles = getTitles();
			if (titles.length === 0) return;
			let selectedIndex = findIndex(getSelectedId());
			if (selectedIndex === -1) selectedIndex = 0;
			const nextIndex = Math.min(selectedIndex + 1, titles.length - 1);
			setSelection(String(titles[nextIndex].id));
		},
		selectPrevious(): void {
			const titles = getTitles();
			if (titles.length === 0) return;
			let selectedIndex = findIndex(getSelectedId());
			if (selectedIndex === -1) selectedIndex = 0;
			const prevIndex = Math.max(selectedIndex - 1, 0);
			setSelection(String(titles[prevIndex].id));
		},
		loadSelected(): Promise<StorageActionResult> | null {
			const targetId = ensureSelected();
			if (!targetId) return null;
			return storage.loadResult(targetId);
		},
		loadById(fileId: string): Promise<StorageActionResult> | null {
			if (fileId == null || fileId === "-1") return null;
			setSelection(fileId);
			return storage.loadResult(fileId);
		},
		deleteById(fileId: string): Promise<StorageActionResult> | null {
			if (fileId == null || fileId === "-1") return null;
			setSelection(fileId);
			return storage.deleteResult(fileId);
		},
		deleteSelected(): Promise<StorageActionResult> | null {
			const id = getSelectedId();
			if (!id) return null;
			setSelection(id);
			return storage.deleteResult(id);
		},
	};
}
