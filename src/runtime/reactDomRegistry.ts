let imagesContainerElement: HTMLDivElement | null = null;

export function setImagesContainerElement(element: HTMLDivElement | null): void {
	imagesContainerElement = element;
}

export function getImagesContainerElement(): HTMLDivElement | null {
	return imagesContainerElement;
}
