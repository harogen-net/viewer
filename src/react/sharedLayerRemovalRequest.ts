export type SharedLayerRemovalRequest = {
	layerName: string;
} | null;

export function getSharedLayerRemovalRequestState(
	requested: SharedLayerRemovalRequest,
	canEdit: boolean,
	hasSelection: boolean
): SharedLayerRemovalRequest {
	if (!canEdit || !hasSelection) return null;
	if (!requested) return null;
	return { layerName: requested.layerName.trim() || "selected layer" };
}
