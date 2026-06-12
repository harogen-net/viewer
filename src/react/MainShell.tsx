import { useEffect } from "react";
import { CanvasMenu } from "./CanvasMenu";
import { ListContextMenus } from "./ListContextMenus";
import {
    CopyPasteControls,
    ImageRefControls,
    LayerControls,
    PropertyControls,
    SwapControls,
    TextEditControls,
} from "./SideControls";
import { ViewerCommands } from "../bridge/ViewerCommands";
import { useViewerMode } from "../bridge/useViewerBridge";
import { useViewerEditSelection } from "../bridge/useViewerBridge";
import { useViewerHistory } from "../bridge/useViewerBridge";

export function MainShell() {
	const { mode } = useViewerMode();
	const { hasSelection } = useViewerEditSelection();
	const { canUndo, canRedo } = useViewerHistory();

	// Keyboard shortcuts: Ctrl/Cmd + X/C/V for cut/copy/paste
	useEffect(() => {
		const handleKeyDown = (e: KeyboardEvent) => {
			if (mode !== "edit" || !hasSelection) return;

			const isMeta = e.metaKey || e.ctrlKey;
			if (!isMeta) return;

			switch (e.code) {
				case "KeyC":
					e.preventDefault();
					ViewerCommands.copySelectedLayer();
					break;
				case "KeyX":
					e.preventDefault();
					ViewerCommands.cutSelectedLayer();
					break;
				case "KeyV":
					e.preventDefault();
					ViewerCommands.pasteLayer();
					break;
			}
		};

		document.addEventListener("keydown", handleKeyDown);
		return () => document.removeEventListener("keydown", handleKeyDown);
	}, [mode, hasSelection]);

	// Keyboard shortcuts: Ctrl/Cmd + Z for undo, Ctrl/Cmd + Shift + Z or Ctrl/Cmd + Y for redo
	useEffect(() => {
		const handleKeyDown = (e: KeyboardEvent) => {
			const isMeta = e.metaKey || e.ctrlKey;
			if (!isMeta) return;

			switch (e.code) {
				case "KeyZ":
					e.preventDefault();
					if (e.shiftKey) {
						// Ctrl/Cmd + Shift + Z for redo
						if (canRedo) ViewerCommands.redo();
					} else {
						// Ctrl/Cmd + Z for undo
						if (canUndo) ViewerCommands.undo();
					}
					break;
				case "KeyY":
					// Ctrl/Cmd + Y for redo (Windows convention)
					if (!e.shiftKey) {
						e.preventDefault();
						if (canRedo) ViewerCommands.redo();
					}
					break;
			}
		};

		document.addEventListener("keydown", handleKeyDown);
		return () => document.removeEventListener("keydown", handleKeyDown);
	}, [canUndo, canRedo]);

	// Keyboard shortcuts: Escape to exit edit mode (enter select mode)
	useEffect(() => {
		const handleKeyDown = (e: KeyboardEvent) => {
			if (e.code === "Escape" && mode === "edit") {
				e.preventDefault();
				ViewerCommands.enterSelectMode();
			}
		};

		document.addEventListener("keydown", handleKeyDown);
		return () => document.removeEventListener("keydown", handleKeyDown);
	}, [mode]);
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

