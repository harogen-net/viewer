export type TextLayerInputRequest = {
	open: boolean;
} | null;

export function getTextLayerInputRequestState(
	requested: TextLayerInputRequest,
	canEdit: boolean,
	isEditMode: boolean
): TextLayerInputRequest {
	if (!canEdit || !isEditMode) return null;
	if (!requested?.open) return null;
	return { open: true };
}
