import { setImagesContainerElement } from "../runtime/reactDomRegistry";

export function ImagesPanel() {
	return (
		<div
			id="images-panel-container"
			className="container"
			data-react-controlled="true"
			ref={(element) => setImagesContainerElement(element)}
			style={{ display: "none" }}></div>
	);
}

