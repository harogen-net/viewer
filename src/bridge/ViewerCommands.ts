import { getLayerActions } from "../hooks/useLayer";
import { getSlideActions } from "../hooks/useSlide";
import { getViewerDocumentActions } from "../hooks/useViewerDocument";
import { SlideTitle } from "../storage/storageTypes";

export const ViewerCommands = {
	newSlide(): void {
		getSlideActions()?.newSlide();
	},
	cloneSelectedSlide(): void {
		getSlideActions()?.cloneSelected();
	},
	deleteSelectedSlide(): void {
		getSlideActions()?.deleteSelected();
	},
	moveSelectedSlideBackward(): void {
		getSlideActions()?.moveSelectedBackward();
	},
	moveSelectedSlideForward(): void {
		getSlideActions()?.moveSelectedForward();
	},
	moveSelectedSlideToIndex(toIndex: number): void {
		getSlideActions()?.moveSelectedToIndex(toIndex);
	},
	addImageSlide(imageId: string, toIndex?: number): void {
		getSlideActions()?.addImageSlide(imageId, toIndex);
	},
	toggleSelectedSlideJoining(): void {
		getSlideActions()?.toggleSelectedJoining();
	},
	toggleAllSlidesJoining(): void {
		getSlideActions()?.toggleAllJoining();
	},
	unjoinAllSlides(): void {
		getSlideActions()?.unjoinAll();
	},
	toggleSelectedSlideDisabled(): void {
		getSlideActions()?.toggleSelectedDisabled();
	},
	enableAllSlides(): void {
		getSlideActions()?.enableAll();
	},
	disableAllSlides(): void {
		getSlideActions()?.disableAll();
	},
	enableOnlySelectedSlide(): void {
		getSlideActions()?.enableOnlySelected();
	},
	deleteDisabledSlides(): void {
		getSlideActions()?.deleteDisabled();
	},
	setSelectedSlideDurationRatio(ratio: number): void {
		getSlideActions()?.setSelectedDurationRatio(ratio);
	},
	selectPreviousSlide(): void {
		getSlideActions()?.selectPrevious();
	},
	selectNextSlide(): void {
		getSlideActions()?.selectNext();
	},
	selectSlideByIndex(index: number): void {
		getSlideActions()?.selectByIndex(index);
	},
	enterSelectMode(): void {
		getSlideActions()?.enterSelectMode();
	},
	closeEditMode(): void {
		getSlideActions()?.closeEditMode();
	},
	enterEditMode(): void {
		getSlideActions()?.enterEditMode();
	},
	newDocument(confirmed = false): void {
		getViewerDocumentActions()?.newDocument(confirmed);
	},
	saveDocument(override?: boolean): void {
		getViewerDocumentActions()?.saveDocument(override);
	},
	exportDocument(): void {
		getViewerDocumentActions()?.exportDocument();
	},
	exportImages(): void {
		getViewerDocumentActions()?.exportImages();
	},
	downloadSelectedSlide(): void {
		getViewerDocumentActions()?.downloadSelectedSlide();
	},
	setSlideShowDuration(duration: number): void {
		getViewerDocumentActions()?.setSlideShowDuration(duration);
	},
	setSlideShowInterval(interval: number): void {
		getViewerDocumentActions()?.setSlideShowInterval(interval);
	},
	setBackgroundColor(color: string): void {
		getViewerDocumentActions()?.setBackgroundColor(color);
	},
	setFullscreen(enabled: boolean): void {
		getViewerDocumentActions()?.setFullscreen(enabled);
	},
	setMirrorH(enabled: boolean): void {
		getViewerDocumentActions()?.setMirrorH(enabled);
	},
	setMirrorV(enabled: boolean): void {
		getViewerDocumentActions()?.setMirrorV(enabled);
	},
	openImportDialog(confirmed = false): void {
		getViewerDocumentActions()?.openImportDialog(confirmed);
	},
	importFile(file: File): void {
		getViewerDocumentActions()?.importFile(file);
	},
	loadSavedFile(fileId: string): void {
		getViewerDocumentActions()?.loadSavedFile(fileId);
	},
	selectSavedFile(fileId: string | null): void {
		getViewerDocumentActions()?.selectSavedFile(fileId);
	},
	loadSelectedSavedFile(): void {
		getViewerDocumentActions()?.loadSelectedSavedFile();
	},
	deleteSavedFile(fileId: string): void {
		getViewerDocumentActions()?.deleteSavedFile(fileId);
	},
	deleteSelectedSavedFile(): void {
		getViewerDocumentActions()?.deleteSelectedSavedFile();
	},
	selectNextSavedFile(): void {
		getViewerDocumentActions()?.selectNextSavedFile();
	},
	selectPreviousSavedFile(): void {
		getViewerDocumentActions()?.selectPreviousSavedFile();
	},
	startSlideshow(): void {
		getViewerDocumentActions()?.startSlideshow();
	},
	stopSlideshow(): void {
		getViewerDocumentActions()?.stopSlideshow();
	},
	toggleSlideshowPause(): void {
		getViewerDocumentActions()?.toggleSlideshowPause();
	},
	showPreviousSlide(): void {
		getViewerDocumentActions()?.showPreviousSlide();
	},
	showNextSlide(): void {
		getViewerDocumentActions()?.showNextSlide();
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
		return getViewerDocumentActions()?.getSavedFileTitles() ?? [];
	},
};
