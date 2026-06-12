let imagesContainerElement: HTMLDivElement | null = null;

export function setImagesContainerElement(element: HTMLDivElement | null): void {
	imagesContainerElement = element;
}

export function getImagesContainerElement(): HTMLDivElement | null {
	return imagesContainerElement;
}

type SaveFormat = "png" | "hvz" | "hvd";
let saveFormat: SaveFormat = "png";

export function setSaveFormat(format: SaveFormat): void {
	saveFormat = format;
}

export function getSaveFormat(): SaveFormat {
	return saveFormat;
}
