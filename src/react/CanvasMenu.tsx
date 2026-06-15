import { useEffect, useState, type FormEvent, type KeyboardEvent } from "react";
import { ViewerCommands } from "../bridge/ViewerCommands";
import {
    useViewerEditCanvasState,
    useViewerEditSelection,
    useViewerHistory,
    useViewerMode,
    useViewerSlides,
} from "../bridge/useViewerBridge";

type CanvasMenuProps = {
	canEdit?: boolean;
};

export function CanvasMenu({ canEdit = true }: CanvasMenuProps) {
	const { canUndo, canRedo } = useViewerHistory();
	const { mode } = useViewerMode();
	const { hasSelection } = useViewerEditSelection();
	const { slides, selectedIndex } = useViewerSlides();
	const editCanvasState = useViewerEditCanvasState();
	const [directionOpen, setDirectionOpen] = useState(false);
	const [textOpen, setTextOpen] = useState(false);
	const [textInput, setTextInput] = useState("");
	const [spreadConfirmOpen, setSpreadConfirmOpen] = useState(false);
	const isEditMode = mode === "edit";
	const canEditMode = canEdit && isEditMode;
	const canEditSelection = canEditMode && hasSelection;
	const selectedSlide = selectedIndex >= 0 ? slides[selectedIndex] : null;
	const selectedSlideLabel = selectedSlide ? String(selectedSlide.id) : "";

	useEffect(() => {
		if (!canEditSelection) setDirectionOpen(false);
		if (!canEditSelection) setSpreadConfirmOpen(false);
	}, [canEditSelection]);

	useEffect(() => {
		if (canEditMode) return;
		setTextOpen(false);
		setTextInput("");
	}, [canEditMode]);

	const submitTextLayer = (event?: FormEvent<HTMLFormElement>) => {
		event?.preventDefault();
		if (!canEditMode) return;
		const text = textInput.trim();
		if (!text) return;
		ViewerCommands.addTextLayer(text);
		setTextInput("");
		setTextOpen(false);
	};

	const handleTextInputKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
		if (event.key !== "Escape") return;
		event.stopPropagation();
		setTextOpen(false);
		setTextInput("");
	};

	return (
		<>
			<div>
				<button
					className="undo"
					data-desc="undo operation"
					data-react-controlled="true"
					disabled={!canEditMode || !canUndo}
					onClick={() => ViewerCommands.undo()}>
					<i className="fas fa-arrow-circle-left"></i>
				</button>
				<button
					className="redo"
					data-desc="redo operation"
					data-react-controlled="true"
					disabled={!canEditMode || !canRedo}
					onClick={() => ViewerCommands.redo()}>
					<i className="fas fa-arrow-circle-right"></i>
				</button>
			</div>
			<div>
				<button
					className="zoomOut"
					data-desc="zoom out"
					data-react-controlled="true"
					disabled={!canEditMode}
					onClick={() => ViewerCommands.zoomOutCanvas()}>
					<i className="fas fa-search-minus"></i>
				</button>
				<button
					className="showAll"
					data-desc="set canvas to default scale"
					data-react-controlled="true"
					disabled={!canEditMode}
					onClick={() => ViewerCommands.resetCanvasZoom()}>
					<i className="far fa-window-maximize"></i>
				</button>
				<button
					className="zoomIn"
					data-desc="zoom in"
					data-react-controlled="true"
					disabled={!canEditMode}
					onClick={() => ViewerCommands.zoomInCanvas()}>
					<i className="fas fa-search-plus"></i>
				</button>
			</div>
			<div>
				<button
					className="cut"
					data-desc="cut selected image"
					data-react-controlled="true"
					disabled={!canEditSelection}
					onClick={() => ViewerCommands.cutSelectedLayer()}>
					<i className="fas fa-cut"></i>
				</button>
				<button
					className="copy"
					data-desc="copy selected image"
					data-react-controlled="true"
					disabled={!canEditSelection}
					onClick={() => ViewerCommands.copySelectedLayer()}>
					<i className="fas fa-copy"></i>
				</button>
				<button
					className="paste"
					data-desc="paste copyed image"
					data-react-controlled="true"
					disabled={!canEditMode}
					onClick={() => ViewerCommands.pasteLayer()}>
					<i className="fas fa-paste"></i>
				</button>
			</div>
			<div className="buttonGroup">
				<button
					className="fit"
					data-desc="fit selected image to canvas"
					data-react-controlled="true"
					disabled={!canEditSelection}
					onClick={() => ViewerCommands.fitSelectedLayer()}>
					<i className="fas fa-expand"></i>
				</button>
				<button
					className="rotateL"
					data-desc="rotate selected image counterclockwise"
					data-react-controlled="true"
					disabled={!canEditSelection}
					onClick={() => ViewerCommands.rotateSelectedLayerLeft()}>
					<i className="fas fa-undo" data-desc="rotate selected image clockwise"></i>
				</button>
				<button
					className="rotateR"
					data-desc="rotate selected image clockwise"
					data-react-controlled="true"
					disabled={!canEditSelection}
					onClick={() => ViewerCommands.rotateSelectedLayerRight()}>
					<i className="fas fa-redo"></i>
				</button>
				<div className="pulldown">
					<button
						className={`pulldownOpener toAnyWhere${directionOpen ? " on" : ""}`}
						data-target="direction"
						data-desc="move selected layer to..."
						data-react-controlled="true"
						aria-controls="direction"
						aria-expanded={directionOpen}
						disabled={!canEditSelection}
						onClick={() => setDirectionOpen((v) => !v)}>
						<i className="fas fa-arrows-alt"></i>
					</button>
					<ul id="direction" style={{ display: directionOpen ? "block" : "none" }}>
						<li>
							<button
								className="toTop at t"
								data-desc="move selected layer to top"
								data-react-controlled="true"
								disabled={!canEditSelection}
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
								disabled={!canEditSelection}
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
								disabled={!canEditSelection}
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
								disabled={!canEditSelection}
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
					className={`text${textOpen ? " on" : ""}`}
					data-react-controlled="true"
					aria-expanded={textOpen}
					disabled={!canEditMode}
					onClick={() => setTextOpen((open) => !open)}>
					<i className="fas fa-font"></i>
				</button>
				{textOpen && (
					<form className="textLayerForm" data-react-controlled="true" onSubmit={submitTextLayer}>
						<input
							type="text"
							value={textInput}
							autoFocus
							data-react-controlled="true"
							onChange={(event) => setTextInput(event.currentTarget.value)}
							onKeyDown={handleTextInputKeyDown}
						/>
						<button type="submit" data-react-controlled="true" disabled={!textInput.trim()}>
							<i className="fas fa-plus"></i>
						</button>
					</form>
				)}
			</div>
			<div>
				<button
					className={`same${editCanvasState.rectEdit ? " on" : ""}`}
					data-react-controlled="true"
					data-desc="toggle rect edit"
					aria-pressed={editCanvasState.rectEdit}
					disabled={!canEditMode}
					onClick={() => ViewerCommands.toggleRectEdit()}>
					<i className="fas fa-th-large"></i>
				</button>
				<button
					className={`spread${spreadConfirmOpen ? " on" : ""}`}
					data-desc="spread selected image"
					data-react-controlled="true"
					aria-expanded={spreadConfirmOpen}
					disabled={!canEditSelection}
					onClick={() => setSpreadConfirmOpen((open) => !open)}>
					<i className="far fa-clone"></i>
					<i className="fas fa-exchange-alt" style={{ fontSize: "70%" }}></i>
				</button>
				{spreadConfirmOpen && (
					<div className="spreadConfirm" data-react-controlled="true">
						<button
							type="button"
							className="confirmSpread"
							data-react-controlled="true"
							onClick={() => {
								setSpreadConfirmOpen(false);
								ViewerCommands.spreadSelectedLayer(true);
							}}>
							<i className="fas fa-check"></i>
						</button>
						<button
							type="button"
							className="cancelSpread"
							data-react-controlled="true"
							onClick={() => setSpreadConfirmOpen(false)}>
							<i className="fas fa-times"></i>
						</button>
					</div>
				)}
			</div>
			<div>
				<span className="name">{selectedSlideLabel}</span>
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
