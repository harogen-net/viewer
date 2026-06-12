import { useState } from "react";
import { ViewerCommands } from "../bridge/ViewerCommands";
import { useViewerEditCanvasState, useViewerHistory, useViewerMode } from "../bridge/useViewerBridge";

export function CanvasMenu() {
	const { canUndo, canRedo } = useViewerHistory();
	const { mode } = useViewerMode();
	const editCanvasState = useViewerEditCanvasState();
	const [directionOpen, setDirectionOpen] = useState(false);
	const isEditMode = mode === "edit";

	return (
		<>
			<div>
				<button
					className="undo"
					data-desc="undo operation"
					data-react-controlled="true"
					disabled={!canUndo}
					onClick={() => ViewerCommands.undo()}>
					<i className="fas fa-arrow-circle-left"></i>
				</button>
				<button
					className="redo"
					data-desc="redo operation"
					data-react-controlled="true"
					disabled={!canRedo}
					onClick={() => ViewerCommands.redo()}>
					<i className="fas fa-arrow-circle-right"></i>
				</button>
			</div>
			<div>
				<button
					className="zoomOut"
					data-desc="zoom out"
					data-react-controlled="true"
					disabled={!isEditMode}
					onClick={() => ViewerCommands.zoomOutCanvas()}>
					<i className="fas fa-search-minus"></i>
				</button>
				<button
					className="showAll"
					data-desc="set canvas to default scale"
					data-react-controlled="true"
					disabled={!isEditMode}
					onClick={() => ViewerCommands.resetCanvasZoom()}>
					<i className="far fa-window-maximize"></i>
				</button>
				<button
					className="zoomIn"
					data-desc="zoom in"
					data-react-controlled="true"
					disabled={!isEditMode}
					onClick={() => ViewerCommands.zoomInCanvas()}>
					<i className="fas fa-search-plus"></i>
				</button>
			</div>
			<div>
				<button
					className="cut"
					data-desc="cut selected image"
					data-react-controlled="true"
					onClick={() => ViewerCommands.cutSelectedLayer()}>
					<i className="fas fa-cut"></i>
				</button>
				<button
					className="copy"
					data-desc="copy selected image"
					data-react-controlled="true"
					onClick={() => ViewerCommands.copySelectedLayer()}>
					<i className="fas fa-copy"></i>
				</button>
				<button
					className="paste"
					data-desc="paste copyed image"
					data-react-controlled="true"
					onClick={() => ViewerCommands.pasteLayer()}>
					<i className="fas fa-paste"></i>
				</button>
			</div>
			<div className="buttonGroup">
				<button
					className="fit"
					data-desc="fit selected image to canvas"
					data-react-controlled="true"
					onClick={() => ViewerCommands.fitSelectedLayer()}>
					<i className="fas fa-expand"></i>
				</button>
				<button
					className="rotateL"
					data-desc="rotate selected image counterclockwise"
					data-react-controlled="true"
					onClick={() => ViewerCommands.rotateSelectedLayerLeft()}>
					<i className="fas fa-undo" data-desc="rotate selected image clockwise"></i>
				</button>
				<button
					className="rotateR"
					data-desc="rotate selected image clockwise"
					data-react-controlled="true"
					onClick={() => ViewerCommands.rotateSelectedLayerRight()}>
					<i className="fas fa-redo"></i>
				</button>
				<div className="pulldown">
					<button
						className="pulldownOpener toAnyWhere"
						data-target="direction"
						data-desc="move selected layer to..."
						data-react-controlled="true"
						onClick={() => setDirectionOpen((v) => !v)}>
						<i className="fas fa-arrows-alt"></i>
					</button>
					<ul id="direction" style={{ display: directionOpen ? "block" : "none" }}>
						<li>
							<button
								className="toTop at t"
								data-desc="move selected layer to top"
								data-react-controlled="true"
								onClick={() => {
									setDirectionOpen(false);
									ViewerCommands.arrangeSelectedLayerTop();
								}}>
								<i className="fas fa-arrow-up"></i>
							</button>
						</li>
						<li>
							<button
								className="toBottom at b"
								data-desc="move selected layer to bottom"
								data-react-controlled="true"
								onClick={() => {
									setDirectionOpen(false);
									ViewerCommands.arrangeSelectedLayerBottom();
								}}>
								<i className="fas fa-arrow-down"></i>
							</button>
						</li>
						<li>
							<button
								className="toLeft at l"
								data-desc="move selected layer to left"
								data-react-controlled="true"
								onClick={() => {
									setDirectionOpen(false);
									ViewerCommands.arrangeSelectedLayerLeft();
								}}>
								<i className="fas fa-arrow-left"></i>
							</button>
						</li>
						<li>
							<button
								className="toRight at r"
								data-desc="move selected layer to right"
								data-react-controlled="true"
								onClick={() => {
									setDirectionOpen(false);
									ViewerCommands.arrangeSelectedLayerRight();
								}}>
								<i className="fas fa-arrow-right"></i>
							</button>
						</li>
					</ul>
				</div>
			</div>
			<div>
				<button
					className="slideDownload"
					data-react-controlled="true"
					onClick={() => ViewerCommands.downloadSelectedSlide()}>
					<i className="fas fa-file-download"></i>
				</button>
			</div>
			<div>
				<button
					className="text"
					data-react-controlled="true"
					disabled={!isEditMode}
					onClick={() => {
						const text = window.prompt("insert text layer:");
						if (text == null) return;
						ViewerCommands.addTextLayer(text);
					}}>
					<i className="fas fa-font"></i>
				</button>
			</div>
			<div>
				<button
					className="same"
					data-react-controlled="true"
					data-desc="toggle rect edit"
					aria-pressed={editCanvasState.rectEdit}
					disabled={!isEditMode}
					onClick={() => ViewerCommands.toggleRectEdit()}>
					<i className="fas fa-th-large"></i>
				</button>
				<button
					className="spread"
					data-desc="spread selected image"
					data-react-controlled="true"
					onClick={() => ViewerCommands.spreadSelectedLayer()}>
					<i className="far fa-clone"></i>
					<i className="fas fa-exchange-alt" style={{ fontSize: "70%" }}></i>
				</button>
			</div>
			<div>
				<span className="name">[スライド名]</span>
			</div>
			<button
				className="close"
				data-react-controlled="true"
				onClick={() => ViewerCommands.enterSelectMode()}>
				<i className="fas fa-times"></i>
			</button>
		</>
	);
}

export const LegacyCanvasMenu = CanvasMenu;
