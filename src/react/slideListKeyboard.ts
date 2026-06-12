export type SlideListKeyboardAction =
	| { type: "none"; preventDefault: false }
	| { type: "select"; index: number; preventDefault: true }
	| { type: "move"; direction: -1 | 1; index: number; preventDefault: true }
	| { type: "delete"; index: number; preventDefault: true };

type SlideListKeyboardInput = {
	key: string;
	metaKey?: boolean;
	ctrlKey?: boolean;
	canEdit: boolean;
	slideIndex: number;
	slideCount: number;
};

const clampIndex = (index: number, count: number): number => {
	if (count <= 0) return -1;
	return Math.max(0, Math.min(count - 1, index));
};

export function getSlideListKeyboardAction(input: SlideListKeyboardInput): SlideListKeyboardAction {
	const index = clampIndex(input.slideIndex, input.slideCount);
	if (index === -1) return { type: "none", preventDefault: false };

	switch (input.key) {
		case "Enter":
		case " ":
			return { type: "select", index, preventDefault: true };
		case "Home":
			return { type: "select", index: 0, preventDefault: true };
		case "End":
			return { type: "select", index: input.slideCount - 1, preventDefault: true };
		case "ArrowUp":
		case "ArrowLeft":
			if ((input.metaKey || input.ctrlKey) && input.canEdit) {
				return { type: "move", direction: -1, index, preventDefault: true };
			}
			return { type: "select", index: clampIndex(index - 1, input.slideCount), preventDefault: true };
		case "ArrowDown":
		case "ArrowRight":
			if ((input.metaKey || input.ctrlKey) && input.canEdit) {
				return { type: "move", direction: 1, index, preventDefault: true };
			}
			return { type: "select", index: clampIndex(index + 1, input.slideCount), preventDefault: true };
		case "Delete":
		case "Backspace":
			return input.canEdit
				? { type: "delete", index, preventDefault: true }
				: { type: "none", preventDefault: false };
	}

	return { type: "none", preventDefault: false };
}