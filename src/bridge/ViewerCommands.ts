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
	moveSelectedSlideBackward(): void {
		getViewer()?.commandMoveSelectedSlideBackward();
	},
	moveSelectedSlideForward(): void {
		getViewer()?.commandMoveSelectedSlideForward();
	},
	moveSelectedSlideToIndex(toIndex: number): void {
		getViewer()?.commandMoveSelectedSlideToIndex(toIndex);
	},
	toggleSelectedSlideJoining(): void {
		getViewer()?.commandToggleSelectedSlideJoining();
	},
	toggleAllSlidesJoining(): void {
		getViewer()?.commandToggleAllSlidesJoining();
	},
	unjoinAllSlides(): void {
		getViewer()?.commandUnjoinAllSlides();
	},
	toggleSelectedSlideDisabled(): void {
		getViewer()?.commandToggleSelectedSlideDisabled();
	},
	enableAllSlides(): void {
		getViewer()?.commandEnableAllSlides();
	},
	disableAllSlides(): void {
		getViewer()?.commandDisableAllSlides();
	},
	enableOnlySelectedSlide(): void {
		getViewer()?.commandEnableOnlySelectedSlide();
	},
	deleteDisabledSlides(): void {
		getViewer()?.commandDeleteDisabledSlides();
	},
	setSelectedSlideDurationRatio(ratio: number): void {
		getViewer()?.commandSetSelectedSlideDurationRatio(ratio);
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
	closeEditMode(): void {
		getViewer()?.commandCloseEditMode();
	},
	enterEditMode(): void {
		getViewer()?.commandEnterEditMode();
	},
	newDocument(confirmed = false): void {
		getViewer()?.commandNewDocument(confirmed);
	},
	saveDocument(override?: boolean): void {
		getViewer()?.commandSaveDocument(override);
	},
	exportDocument(): void {
		getViewer()?.commandExportDocument();
	},
	exportImages(): void {
		getViewer()?.commandExportImages();
	},
	downloadSelectedSlide(): void {
		getViewer()?.commandDownloadSelectedSlide();
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
	openImportDialog(confirmed = false): void {
		getViewer()?.commandOpenImportDialog(confirmed);
	},
	importFile(file: File): void {
		getViewer()?.commandImportFile(file);
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
	stopSlideshow(): void {
		getViewer()?.commandStopSlideshow();
	},
	toggleSlideshowPause(): void {
		getViewer()?.commandToggleSlideshowPause();
	},
	showPreviousSlide(): void {
		getViewer()?.commandShowPreviousSlide();
	},
	showNextSlide(): void {
		getViewer()?.commandShowNextSlide();
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
	toggleSelectedLayerIsText(): void {
		getViewer()?.commandToggleSelectedLayerIsText();
	},
	spreadSelectedLayer(confirmed = false): void {
		getViewer()?.commandSpreadSelectedLayer(confirmed);
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
	moveSelectedLayerToIndex(toIndex: number): void {
		getViewer()?.commandMoveSelectedLayerToIndex(toIndex);
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
	removeSelectedLayer(confirmedSharedRemoval = false): void {
		getViewer()?.commandRemoveSelectedLayer(confirmedSharedRemoval);
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
	setSelectedImageClip(top: number, right: number, bottom: number, left: number): void {
		getViewer()?.commandSetSelectedImageClip(top, right, bottom, left);
	},
	resetSelectedImageClip(): void {
		getViewer()?.commandResetSelectedImageClip();
	},
	selectEditLayerByIndex(index: number): void {
		getViewer()?.commandSelectEditLayerByIndex(index);
	},
	toggleSelectedLayerVisible(): void {
		getViewer()?.commandToggleSelectedLayerVisible();
	},
	toggleSelectedLayerLocked(): void {
		getViewer()?.commandToggleSelectedLayerLocked();
	},
	toggleSelectedLayerShared(): void {
		getViewer()?.commandToggleSelectedLayerShared();
	},
	setSelectedLayerName(name: string): void {
		getViewer()?.commandSetSelectedLayerName(name);
	},
	setSelectedLayerText(text: string): void {
		getViewer()?.commandSetSelectedLayerText(text);
	},
	zoomInCanvas(): void {
		getViewer()?.commandZoomInCanvas();
	},
	zoomOutCanvas(): void {
		getViewer()?.commandZoomOutCanvas();
	},
	resetCanvasZoom(): void {
		getViewer()?.commandResetCanvasZoom();
	},
	setCanvasScale(scale: number): void {
		getViewer()?.commandSetCanvasScale(scale);
	},
	toggleRectEdit(): void {
		getViewer()?.commandToggleRectEdit();
	},
	setRectEdit(enabled: boolean): void {
		getViewer()?.commandSetRectEdit(enabled);
	},
	replaceSelectedImage(file: File, applyAllReferences: boolean): void {
		void getViewer()?.commandReplaceSelectedImage(file, applyAllReferences);
	},
	downloadSelectedImage(): void {
		getViewer()?.commandDownloadSelectedImage();
	},
	deleteImageById(imageId: string, confirmed = false): void {
		getViewer()?.commandDeleteImageById(imageId, confirmed);
	},
	getSavedFileTitles(): readonly SlideTitle[] {
		return getViewer()?.getSavedFileTitles() ?? [];
	},
};
