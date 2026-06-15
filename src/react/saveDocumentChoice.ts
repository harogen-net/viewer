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
