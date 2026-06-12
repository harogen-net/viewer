import { useEffect } from "react";
import { ViewerCommands } from "../bridge/ViewerCommands";
import { useViewerEditSelection, useViewerHistory, useViewerMode } from "../bridge/useViewerBridge";
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

	// Keyboard shortcuts: Delete / Backspace to remove selected layer
	useEffect(() => {
		const handleKeyDown = (e: KeyboardEvent) => {
			if (mode !== "edit" || !hasSelection) return;
			const tag = (document.activeElement as HTMLElement)?.tagName;
			if (tag === "INPUT" || tag === "TEXTAREA") return;

			if (e.code === "Delete" || e.code === "Backspace") {
				e.preventDefault();
				ViewerCommands.removeSelectedLayer();
			}
		};

		document.addEventListener("keydown", handleKeyDown);
		return () => document.removeEventListener("keydown", handleKeyDown);
	}, [mode, hasSelection]);

	// Keyboard shortcuts: Arrow keys to nudge selected layer (1px; +Shift = 10px)
	useEffect(() => {
		const handleKeyDown = (e: KeyboardEvent) => {
			if (mode !== "edit" || !hasSelection) return;
			// Skip if focus is inside a text input / textarea to avoid hijacking typing
			const tag = (document.activeElement as HTMLElement)?.tagName;
			if (tag === "INPUT" || tag === "TEXTAREA") return;

			switch (e.code) {
				case "ArrowLeft":
					e.preventDefault();
					ViewerCommands.nudgeSelectedLayerLeft();
					break;
				case "ArrowRight":
					e.preventDefault();
					ViewerCommands.nudgeSelectedLayerRight();
					break;
				case "ArrowUp":
					e.preventDefault();
					ViewerCommands.nudgeSelectedLayerUp();
					break;
				case "ArrowDown":
					e.preventDefault();
					ViewerCommands.nudgeSelectedLayerDown();
					break;
			}
		};

		document.addEventListener("keydown", handleKeyDown);
		return () => document.removeEventListener("keydown", handleKeyDown);
	}, [mode, hasSelection]);
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

