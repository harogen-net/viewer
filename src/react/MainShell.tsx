import { useEffect } from "react";
import { useViewerEditSelection, useViewerHistory, useViewerMode } from "../bridge/useViewerBridge";
import { ViewerCommands } from "../bridge/ViewerCommands";
import { CanvasMenu } from "./CanvasMenu";
import { ListContextMenus } from "./ListContextMenus";
import { getMainShellKeyboardAction } from "./mainShellKeyboard";
import {
	CopyPasteControls,
	ImageRefControls,
	LayerControls,
	PropertyControls,
	SwapControls,
	TextEditControls,
} from "./SideControls";

function isTypingTarget(): boolean {
	const activeElement = document.activeElement as HTMLElement | null;
	const tag = activeElement?.tagName;
	return tag === "INPUT" || tag === "TEXTAREA" || Boolean(activeElement?.isContentEditable);
}

export function MainShell() {
	const { mode } = useViewerMode();
	const { hasSelection } = useViewerEditSelection();
	const { canUndo, canRedo } = useViewerHistory();

	useEffect(() => {
		const handleKeyDown = (e: KeyboardEvent) => {
			const action = getMainShellKeyboardAction({
				code: e.code,
				metaKey: e.metaKey,
				ctrlKey: e.ctrlKey,
				shiftKey: e.shiftKey,
				mode,
				hasSelection,
				canUndo,
				canRedo,
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
	}, [mode, hasSelection, canUndo, canRedo]);
	return (
		<>
			<div className="canvas">
				<div className="menu">
					<CanvasMenu />
				</div>
				<div className="sideMenu">
					<div className="property">
						<div>
							<PropertyControls />
						</div>
						<div className="copypaste">
							<CopyPasteControls />
						</div>
						<div className="imageRef">
							<ImageRefControls />
						</div>
						<div className="textEdit">
							<TextEditControls />
						</div>
						<div className="swap">
							<SwapControls />
						</div>
					</div>
					<div className="layer">
						<LayerControls />
					</div>
				</div>
			</div>
			<div className="list">
				<ListContextMenus />
			</div>
		</>
	);
}

export const LegacyMainShell = MainShell;
