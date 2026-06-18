import { getLayerActions } from "../hooks/useLayer";
import { SlideTitle } from "../storage/storageTypes";
import { getActiveViewer } from "./activeViewer";

function getViewer() {
	return getActiveViewer();
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
	addImageSlide(imageId: string, toIndex?: number): void {
		getViewer()?.commandAddImageSlide(imageId, toIndex);
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
		getLayerActions()?.undo();
	},
	redo(): void {
		getLayerActions()?.redo();
	},
	rotateSelectedLayerLeft(): void {
		getLayerActions()?.rotateLeft();
	},
	rotateSelectedLayerRight(): void {
		getLayerActions()?.rotateRight();
	},
	toggleSelectedLayerMirrorH(): void {
		getLayerActions()?.toggleMirrorH();
	},
	toggleSelectedLayerMirrorV(): void {
		getLayerActions()?.toggleMirrorV();
	},
	toggleSelectedLayerIsText(): void {
		getLayerActions()?.toggleIsText();
	},
	spreadSelectedLayer(confirmed = false): void {
		getLayerActions()?.spread(confirmed);
	},
	fitSelectedLayer(): void {
		getLayerActions()?.fit();
	},
	arrangeSelectedLayerTop(): void {
		getLayerActions()?.arrangeTop();
	},
	arrangeSelectedLayerRight(): void {
		getLayerActions()?.arrangeRight();
	},
	arrangeSelectedLayerBottom(): void {
		getLayerActions()?.arrangeBottom();
	},
	arrangeSelectedLayerLeft(): void {
		getLayerActions()?.arrangeLeft();
	},
	moveSelectedLayerUp(): void {
		getLayerActions()?.moveUp();
	},
	moveSelectedLayerDown(): void {
		getLayerActions()?.moveDown();
	},
	moveSelectedLayerToTop(): void {
		getLayerActions()?.moveToTop();
	},
	moveSelectedLayerToBottom(): void {
		getLayerActions()?.moveToBottom();
	},
	moveSelectedLayerToIndex(toIndex: number): void {
		getLayerActions()?.moveToIndex(toIndex);
	},
	copySelectedLayer(): void {
		getLayerActions()?.copyLayer();
	},
	cutSelectedLayer(): void {
		getLayerActions()?.cutLayer();
	},
	pasteLayer(): void {
		getLayerActions()?.pasteLayer();
	},
	addTextLayer(text: string): void {
		getLayerActions()?.addTextLayer(text);
	},
	copySelectedLayerTransform(): void {
		getLayerActions()?.copyTransform();
	},
	pasteLayerTransform(): void {
		getLayerActions()?.pasteTransform();
	},
	removeSelectedLayer(confirmedSharedRemoval = false): void {
		getLayerActions()?.remove(confirmedSharedRemoval);
	},
	nudgeSelectedLayerLeft(): void {
		getLayerActions()?.nudgeLeft();
	},
	nudgeSelectedLayerRight(): void {
		getLayerActions()?.nudgeRight();
	},
	nudgeSelectedLayerUp(): void {
		getLayerActions()?.nudgeUp();
	},
	nudgeSelectedLayerDown(): void {
		getLayerActions()?.nudgeDown();
	},
	scaleSelectedLayerUp(): void {
		getLayerActions()?.scaleUp();
	},
	scaleSelectedLayerDown(): void {
		getLayerActions()?.scaleDown();
	},
	adjustSelectedLayerRotationLeft(): void {
		getLayerActions()?.adjustRotationLeft();
	},
	adjustSelectedLayerRotationRight(): void {
		getLayerActions()?.adjustRotationRight();
	},
	resetSelectedLayerRotation(): void {
		getLayerActions()?.resetRotation();
	},
	increaseSelectedLayerOpacity(): void {
		getLayerActions()?.increaseOpacity();
	},
	decreaseSelectedLayerOpacity(): void {
		getLayerActions()?.decreaseOpacity();
	},
	resetSelectedLayerOpacity(): void {
		getLayerActions()?.resetOpacity();
	},
	setSelectedLayerPosition(x: number, y: number): void {
		getLayerActions()?.setPosition(x, y);
	},
	setSelectedLayerScale(scale: number): void {
		getLayerActions()?.setScale(scale);
	},
	setSelectedLayerRotation(rotation: number): void {
		getLayerActions()?.setRotation(rotation);
	},
	setSelectedLayerOpacity(opacity: number): void {
		getLayerActions()?.setOpacity(opacity);
	},
	setSelectedImageClip(top: number, right: number, bottom: number, left: number): void {
		getLayerActions()?.setImageClip(top, right, bottom, left);
	},
	resetSelectedImageClip(): void {
		getLayerActions()?.resetImageClip();
	},
	selectEditLayerByIndex(index: number): void {
		getLayerActions()?.selectByIndex(index);
	},
	toggleSelectedLayerVisible(): void {
		getLayerActions()?.toggleVisible();
	},
	toggleSelectedLayerLocked(): void {
		getLayerActions()?.toggleLocked();
	},
	toggleSelectedLayerShared(): void {
		getLayerActions()?.toggleShared();
	},
	setSelectedLayerName(name: string): void {
		getLayerActions()?.setName(name);
	},
	setSelectedLayerText(text: string): void {
		getLayerActions()?.setText(text);
	},
	zoomInCanvas(): void {
		getLayerActions()?.zoomInCanvas();
	},
	zoomOutCanvas(): void {
		getLayerActions()?.zoomOutCanvas();
	},
	resetCanvasZoom(): void {
		getLayerActions()?.resetCanvasZoom();
	},
	setCanvasScale(scale: number): void {
		getLayerActions()?.setCanvasScale(scale);
	},
	toggleRectEdit(): void {
		getLayerActions()?.toggleRectEdit();
	},
	setRectEdit(enabled: boolean): void {
		getLayerActions()?.setRectEdit(enabled);
	},
	replaceSelectedImage(file: File, applyAllReferences: boolean): void {
		void getLayerActions()?.replaceImage(file, applyAllReferences);
	},
	downloadSelectedImage(): void {
		getLayerActions()?.downloadImage();
	},
	deleteImageById(imageId: string, confirmed = false): void {
		getLayerActions()?.deleteImageById(imageId, confirmed);
	},
	getSavedFileTitles(): readonly SlideTitle[] {
		return getViewer()?.getSavedFileTitles() ?? [];
	},
};
