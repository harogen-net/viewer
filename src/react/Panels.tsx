import { setImagesContainerElement } from "../runtime/reactDomRegistry";

export function PrefPanel() {
	// RuntimeShell handles config UI.
	return null;
}

export function ImagesPanel() {
	return (
		<div
			id="images-panel-container"
			className="container"
			ref={(element) => setImagesContainerElement(element)}
			style={{ display: "none" }}></div>
	);
}

export const LegacyPrefPanel = PrefPanel;
export const LegacyImagesPanel = ImagesPanel;

