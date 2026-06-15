export type MainShellKeyboardActionType =
	| "none"
	| "copy"
	| "cut"
	| "paste"
	| "undo"
	| "redo"
	| "enterSelectMode"
	| "removeSelectedLayer"
	| "nudgeLeft"
	| "nudgeRight"
	| "nudgeUp"
	| "nudgeDown"
	| "preventOnly";

export type MainShellKeyboardAction = {
	type: MainShellKeyboardActionType;
	preventDefault: boolean;
};

export type MainShellKeyboardInput = {
	code: string;
	metaKey: boolean;
	ctrlKey: boolean;
	shiftKey: boolean;
	mode: "select" | "edit" | "slideshow";
	hasSelection: boolean;
	canUndo: boolean;
	canRedo: boolean;
	isTypingTarget: boolean;
};

const noneAction: MainShellKeyboardAction = { type: "none", preventDefault: false };

function shortcut(type: MainShellKeyboardActionType): MainShellKeyboardAction {
	return { type, preventDefault: true };
}

export function getMainShellKeyboardAction(input: MainShellKeyboardInput): MainShellKeyboardAction {
	if (input.isTypingTarget) return noneAction;
	const isEditMode = input.mode === "edit";
	if (!isEditMode) return noneAction;

	const isMeta = input.metaKey || input.ctrlKey;
	if (isMeta) {
		switch (input.code) {
			case "KeyC":
				return input.hasSelection ? shortcut("copy") : noneAction;
			case "KeyX":
				return input.hasSelection ? shortcut("cut") : noneAction;
			case "KeyV":
				return shortcut("paste");
			case "KeyZ":
				if (input.shiftKey) return input.canRedo ? shortcut("redo") : shortcut("preventOnly");
				return input.canUndo ? shortcut("undo") : shortcut("preventOnly");
			case "KeyY":
				if (input.shiftKey) return noneAction;
				return input.canRedo ? shortcut("redo") : shortcut("preventOnly");
		}
	}

	if (input.code === "Escape") return shortcut("enterSelectMode");
	if (!input.hasSelection) return noneAction;

	switch (input.code) {
		case "Delete":
		case "Backspace":
			return shortcut("removeSelectedLayer");
		case "ArrowLeft":
			return shortcut("nudgeLeft");
		case "ArrowRight":
			return shortcut("nudgeRight");
		case "ArrowUp":
			return shortcut("nudgeUp");
		case "ArrowDown":
			return shortcut("nudgeDown");
	}

	return noneAction;
}