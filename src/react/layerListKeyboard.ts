export type LayerListKeyboardAction =
	| { type: "none"; preventDefault: false }
	| { type: "select"; position: number; preventDefault: true }
	| { type: "rename"; position: number; preventDefault: true }
	| { type: "delete"; position: number; preventDefault: true };

type LayerListKeyboardInput = {
	key: string;
	canEdit: boolean;
	layerPosition: number;
	layerCount: number;
};

const clampPosition = (position: number, count: number): number => {
	if (count <= 0) return -1;
	return Math.max(0, Math.min(count - 1, position));
};

export function getLayerListKeyboardAction(
	input: LayerListKeyboardInput
): LayerListKeyboardAction {
	if (!input.canEdit) return { type: "none", preventDefault: false };
	const position = clampPosition(input.layerPosition, input.layerCount);
	if (position === -1) return { type: "none", preventDefault: false };

	switch (input.key) {
		case "Enter":
		case " ":
			return { type: "select", position, preventDefault: true };
		case "Home":
			return { type: "select", position: 0, preventDefault: true };
		case "End":
			return { type: "select", position: input.layerCount - 1, preventDefault: true };
		case "ArrowUp":
			return {
				type: "select",
				position: clampPosition(position - 1, input.layerCount),
				preventDefault: true,
			};
		case "ArrowDown":
			return {
				type: "select",
				position: clampPosition(position + 1, input.layerCount),
				preventDefault: true,
			};
		case "F2":
			return { type: "rename", position, preventDefault: true };
		case "Delete":
		case "Backspace":
			return { type: "delete", position, preventDefault: true };
	}

	return { type: "none", preventDefault: false };
}