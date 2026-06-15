export type SpreadLayerRequest = {
	layerName: string;
} | null;

export function getSpreadLayerRequestState(
	requested: SpreadLayerRequest,
	canEdit: boolean,
	hasSelection: boolean
): SpreadLayerRequest {
	if (!canEdit || !hasSelection) return null;
	if (!requested) return null;
	return { layerName: requested.layerName.trim() || "selected layer" };
}
