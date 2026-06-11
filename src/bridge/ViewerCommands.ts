import { SlideTitle } from "../storage/storageTypes";
import { Viewer } from "../Viewer";

function getViewer(): Viewer | null {
	return Viewer.shared ?? null;
}

export const ViewerCommands = {
	newSlide(): void {
		getViewer()?.commandNewSlide();
	},
	cloneSelectedSlide(): void {
		getViewer()?.commandCloneSelectedSlide();
	},
	deleteSelectedSlide(): void {
		getViewer()?.commandDeleteSelectedSlide();
	},
	selectPreviousSlide(): void {
		getViewer()?.commandSelectPreviousSlide();
	},
	selectNextSlide(): void {
		getViewer()?.commandSelectNextSlide();
	},
	selectSlideByIndex(index: number): void {
		getViewer()?.commandSelectSlideByIndex(index);
	},
	newDocument(): void {
		getViewer()?.commandNewDocument();
	},
	saveDocument(): void {
		getViewer()?.commandSaveDocument();
	},
	exportDocument(): void {
		getViewer()?.commandExportDocument();
	},
	openImportDialog(): void {
		getViewer()?.commandOpenImportDialog();
	},
	loadSavedFile(fileId: string): void {
		getViewer()?.commandLoadSavedFile(fileId);
	},
	selectSavedFile(fileId: string | null): void {
		getViewer()?.commandSelectSavedFile(fileId);
	},
	loadSelectedSavedFile(): void {
		getViewer()?.commandLoadSelectedSavedFile();
	},
	deleteSavedFile(fileId: string): void {
		getViewer()?.commandDeleteSavedFile(fileId);
	},
	deleteSelectedSavedFile(): void {
		getViewer()?.commandDeleteSelectedSavedFile();
	},
	selectNextSavedFile(): void {
		getViewer()?.commandSelectNextSavedFile();
	},
	selectPreviousSavedFile(): void {
		getViewer()?.commandSelectPreviousSavedFile();
	},
	startSlideshow(): void {
		getViewer()?.commandStartSlideshow();
	},
	getSavedFileTitles(): readonly SlideTitle[] {
		return getViewer()?.getSavedFileTitles() ?? [];
	},
};
