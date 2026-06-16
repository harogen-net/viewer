type SaveFormat = "png" | "hvz" | "hvd";
let saveFormat: SaveFormat = "png";

export function setSaveFormat(format: SaveFormat): void {
	saveFormat = format;
}

export function getSaveFormat(): SaveFormat {
	return saveFormat;
}
