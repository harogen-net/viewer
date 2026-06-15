export type ListContextMenuKind = "slide" | "list";

export type ListContextMenuState = {
	kind: ListContextMenuKind;
	top: number;
	left: number;
} | null;

export function getListContextMenuState(
	requestedMenu: ListContextMenuState,
	canEdit: boolean
): ListContextMenuState {
	return canEdit ? requestedMenu : null;
}

export function canRunListContextMenuCommand(canEdit: boolean): boolean {
	return canEdit;
}
