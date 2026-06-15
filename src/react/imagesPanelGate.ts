export function getImagesPanelOpenState(requestedOpen: boolean, canEdit: boolean): boolean {
	return canEdit && requestedOpen;
}

export function canToggleImagesPanel(canEdit: boolean): boolean {
	return canEdit;
}
