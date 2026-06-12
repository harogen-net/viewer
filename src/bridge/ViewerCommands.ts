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
	enterSelectMode(): void {
		getViewer()?.commandEnterSelectMode();
	},
	enterEditMode(): void {
		getViewer()?.commandEnterEditMode();
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
	exportImages(): void {
		getViewer()?.commandExportImages();
	},
	setSlideShowDuration(duration: number): void {
		getViewer()?.commandSetSlideShowDuration(duration);
	},
	setSlideShowInterval(interval: number): void {
		getViewer()?.commandSetSlideShowInterval(interval);
	},
	setBackgroundColor(color: string): void {
		getViewer()?.commandSetBackgroundColor(color);
	},
	setFullscreen(enabled: boolean): void {
		getViewer()?.commandSetFullscreen(enabled);
	},
	setMirrorH(enabled: boolean): void {
		getViewer()?.commandSetMirrorH(enabled);
	},
	setMirrorV(enabled: boolean): void {
		getViewer()?.commandSetMirrorV(enabled);
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
	undo(): void {
		getViewer()?.commandUndo();
	},
	redo(): void {
		getViewer()?.commandRedo();
	},
	rotateSelectedLayerLeft(): void {
		getViewer()?.commandRotateSelectedLayerLeft();
	},
	rotateSelectedLayerRight(): void {
		getViewer()?.commandRotateSelectedLayerRight();
	},
	toggleSelectedLayerMirrorH(): void {
		getViewer()?.commandToggleSelectedLayerMirrorH();
	},
	toggleSelectedLayerMirrorV(): void {
		getViewer()?.commandToggleSelectedLayerMirrorV();
	},
	fitSelectedLayer(): void {
		getViewer()?.commandFitSelectedLayer();
	},
	arrangeSelectedLayerTop(): void {
		getViewer()?.commandArrangeSelectedLayerTop();
	},
	arrangeSelectedLayerRight(): void {
		getViewer()?.commandArrangeSelectedLayerRight();
	},
	arrangeSelectedLayerBottom(): void {
		getViewer()?.commandArrangeSelectedLayerBottom();
	},
	arrangeSelectedLayerLeft(): void {
		getViewer()?.commandArrangeSelectedLayerLeft();
	},
	moveSelectedLayerUp(): void {
		getViewer()?.commandMoveSelectedLayerUp();
	},
	moveSelectedLayerDown(): void {
		getViewer()?.commandMoveSelectedLayerDown();
	},
	moveSelectedLayerToTop(): void {
		getViewer()?.commandMoveSelectedLayerToTop();
	},
	moveSelectedLayerToBottom(): void {
		getViewer()?.commandMoveSelectedLayerToBottom();
	},
	copySelectedLayer(): void {
		getViewer()?.commandCopySelectedLayer();
	},
	cutSelectedLayer(): void {
		getViewer()?.commandCutSelectedLayer();
	},
	pasteLayer(): void {
		getViewer()?.commandPasteLayer();
	},
	addTextLayer(text: string): void {
		getViewer()?.commandAddTextLayer(text);
	},
	copySelectedLayerTransform(): void {
		getViewer()?.commandCopySelectedLayerTransform();
	},
	pasteLayerTransform(): void {
		getViewer()?.commandPasteLayerTransform();
	},
	removeSelectedLayer(): void {
		getViewer()?.commandRemoveSelectedLayer();
	},
	nudgeSelectedLayerLeft(): void {
		getViewer()?.commandNudgeSelectedLayerLeft();
	},
	nudgeSelectedLayerRight(): void {
		getViewer()?.commandNudgeSelectedLayerRight();
	},
	nudgeSelectedLayerUp(): void {
		getViewer()?.commandNudgeSelectedLayerUp();
	},
	nudgeSelectedLayerDown(): void {
		getViewer()?.commandNudgeSelectedLayerDown();
	},
	scaleSelectedLayerUp(): void {
		getViewer()?.commandScaleSelectedLayerUp();
	},
	scaleSelectedLayerDown(): void {
		getViewer()?.commandScaleSelectedLayerDown();
	},
	adjustSelectedLayerRotationLeft(): void {
		getViewer()?.commandAdjustSelectedLayerRotationLeft();
	},
	adjustSelectedLayerRotationRight(): void {
		getViewer()?.commandAdjustSelectedLayerRotationRight();
	},
	resetSelectedLayerRotation(): void {
		getViewer()?.commandResetSelectedLayerRotation();
	},
	increaseSelectedLayerOpacity(): void {
		getViewer()?.commandIncreaseSelectedLayerOpacity();
	},
	decreaseSelectedLayerOpacity(): void {
		getViewer()?.commandDecreaseSelectedLayerOpacity();
	},
	resetSelectedLayerOpacity(): void {
		getViewer()?.commandResetSelectedLayerOpacity();
	},
	setSelectedLayerPosition(x: number, y: number): void {
		getViewer()?.commandSetSelectedLayerPosition(x, y);
	},
	setSelectedLayerScale(scale: number): void {
		getViewer()?.commandSetSelectedLayerScale(scale);
	},
	setSelectedLayerRotation(rotation: number): void {
		getViewer()?.commandSetSelectedLayerRotation(rotation);
	},
	setSelectedLayerOpacity(opacity: number): void {
		getViewer()?.commandSetSelectedLayerOpacity(opacity);
	},
	adjustSelectedImageClip(
		side: "top" | "right" | "bottom" | "left",
		delta: number
	): void {
		getViewer()?.commandAdjustSelectedImageClip(side, delta);
	},
	resetSelectedImageClip(): void {
		getViewer()?.commandResetSelectedImageClip();
	},
	getSavedFileTitles(): readonly SlideTitle[] {
		return getViewer()?.getSavedFileTitles() ?? [];
	},
};
