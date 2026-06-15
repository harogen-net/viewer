export type ImageDeleteRequest = {
	imageId: string;
	name: string;
} | null;

export function getImageDeleteRequestState(
	requested: ImageDeleteRequest,
	canEdit: boolean,
	imagesPanelOpen: boolean
): ImageDeleteRequest {
	if (!canEdit || !imagesPanelOpen) return null;
	return requested?.imageId ? requested : null;
}
