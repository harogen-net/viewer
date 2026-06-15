import { useEffect } from "react";
import { useViewerEditLayerState, useViewerHistory, useViewerMode } from "../bridge/useViewerBridge";
import { ViewerCommands } from "../bridge/ViewerCommands";
import { FeatureGate, getFeatureGate } from "../runtime/featureGate";
import { getMainShellKeyboardAction } from "./mainShellKeyboard";

function isTypingTarget(): boolean {
	const activeElement = document.activeElement as HTMLElement | null;
	const tag = activeElement?.tagName;
	return tag === "INPUT" || tag === "TEXTAREA" || Boolean(activeElement?.isContentEditable);
}

type MainShellProps = {
	gate?: FeatureGate;
};

export function MainShell({ gate = getFeatureGate("browser") }: MainShellProps) {
	const { mode } = useViewerMode();
	const { hasSelection, canPasteLayer } = useViewerEditLayerState();
	const { canUndo, canRedo } = useViewerHistory();
	const canEdit = gate.canEdit;

	useEffect(() => {
		const handleKeyDown = (e: KeyboardEvent) => {
			const action = getMainShellKeyboardAction({
				code: e.code,
				metaKey: e.metaKey,
				ctrlKey: e.ctrlKey,
				shiftKey: e.shiftKey,
				mode,
				hasSelection,
				canPasteLayer,
				canUndo,
				canRedo,
				canEdit,
				isTypingTarget: isTypingTarget(),
			});
			if (action.preventDefault) e.preventDefault();

			switch (action.type) {
				case "copy":
					ViewerCommands.copySelectedLayer();
					break;
				case "cut":
					ViewerCommands.cutSelectedLayer();
					break;
				case "paste":
					ViewerCommands.pasteLayer();
					break;
				case "undo":
					ViewerCommands.undo();
					break;
				case "redo":
					ViewerCommands.redo();
					break;
				case "enterSelectMode":
					ViewerCommands.enterSelectMode();
					break;
				case "removeSelectedLayer":
					ViewerCommands.removeSelectedLayer();
					break;
				case "nudgeLeft":
					ViewerCommands.nudgeSelectedLayerLeft();
					break;
				case "nudgeRight":
					ViewerCommands.nudgeSelectedLayerRight();
					break;
				case "nudgeUp":
					ViewerCommands.nudgeSelectedLayerUp();
					break;
				case "nudgeDown":
					ViewerCommands.nudgeSelectedLayerDown();
					break;
			}
		};

		document.addEventListener("keydown", handleKeyDown);
		return () => document.removeEventListener("keydown", handleKeyDown);
	}, [mode, hasSelection, canPasteLayer, canUndo, canRedo, canEdit]);
	return (
		<>
			<div className="canvas" />
			<div className="list" />
		</>
	);
}

