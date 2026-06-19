// R5: 旧 *Request.ts / *Gate.ts / *Choice.ts の 6 ファイルを統合。export 名・シグネチャは保持。

export type ImageDeleteRequest = { imageId: string; name: string } | null;

export function getImageDeleteRequestState(
	requested: ImageDeleteRequest,
	canEdit: boolean,
	imagesPanelOpen: boolean
): ImageDeleteRequest {
	if (!canEdit || !imagesPanelOpen) return null;
	return requested?.imageId ? requested : null;
}

export function getImagesPanelOpenState(requestedOpen: boolean, canEdit: boolean): boolean {
	return canEdit && requestedOpen;
}

export function canToggleImagesPanel(canEdit: boolean): boolean {
	return canEdit;
}

export function canRequestSaveChoice(canSave: boolean, slideCount: number): boolean {
	return canSave && slideCount > 0;
}

export function getSaveChoiceOpenState(
	requestedOpen: boolean,
	canSave: boolean,
	slideCount: number
): boolean {
	return requestedOpen && canRequestSaveChoice(canSave, slideCount);
}

export type SharedLayerRemovalRequest = { layerName: string } | null;

export function getSharedLayerRemovalRequestState(
	requested: SharedLayerRemovalRequest,
	canEdit: boolean,
	hasSelection: boolean
): SharedLayerRemovalRequest {
	if (!canEdit || !hasSelection) return null;
	if (!requested) return null;
	return { layerName: requested.layerName.trim() || "selected layer" };
}

export type SpreadLayerRequest = { layerName: string } | null;

export function getSpreadLayerRequestState(
	requested: SpreadLayerRequest,
	canEdit: boolean,
	hasSelection: boolean
): SpreadLayerRequest {
	if (!canEdit || !hasSelection) return null;
	if (!requested) return null;
	return { layerName: requested.layerName.trim() || "selected layer" };
}

export type TextLayerInputRequest = { open: boolean } | null;

export function getTextLayerInputRequestState(
	requested: TextLayerInputRequest,
	canEdit: boolean,
	isEditMode: boolean
): TextLayerInputRequest {
	if (!canEdit || !isEditMode) return null;
	if (!requested?.open) return null;
	return { open: true };
}
