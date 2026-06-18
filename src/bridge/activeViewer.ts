import type { Viewer } from "../Viewer";

let active: Viewer | null = null;

export function setActiveViewer(viewer: Viewer | null): void {
	active = viewer;
}

export function getActiveViewer(): Viewer | null {
	return active;
}
