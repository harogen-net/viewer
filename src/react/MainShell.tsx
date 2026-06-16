import { useEffect, useMemo, useRef, useState } from "react";
import { useViewerEditLayerState, useViewerHistory, useViewerMode, useViewerSlides } from "../bridge/useViewerBridge";
import { ViewerCommands } from "../bridge/ViewerCommands";
import { FeatureGate, getFeatureGate } from "../runtime/featureGate";
import { getMainShellKeyboardAction } from "./mainShellKeyboard";
import { getSlideListDropAction, getSlideListKeyboardAction } from "./slideListKeyboard";

function isTypingTarget(): boolean {
	const activeElement = document.activeElement as HTMLElement | null;
	const tag = activeElement?.tagName;
	return tag === "INPUT" || tag === "TEXTAREA" || Boolean(activeElement?.isContentEditable);
}

type MainShellProps = {
	gate?: FeatureGate;
};

type MainSlideSnapshot = {
	key: string;
	index: number;
	label: string;
	selected: boolean;
	joining: boolean;
	disabled: boolean;
	durationRatio: number;
};

function MainSlideList({ gate }: { gate: FeatureGate }) {
	const { slides: rawSlides, selectedIndex } = useViewerSlides();
	const [draggingSlideIndex, setDraggingSlideIndex] = useState<number | null>(null);
	const [slideDropIndex, setSlideDropIndex] = useState<number | null>(null);
	const pendingFocusKey = useRef<string | null>(null);
	const rowRefs = useRef(new Map<string, HTMLButtonElement>());

	const slides = useMemo<MainSlideSnapshot[]>(
		() => rawSlides.map((slide, index) => ({
			key: slide.uuid || String(slide.id),
			index,
			label: String(index + 1),
			selected: index === selectedIndex,
			joining: Boolean(slide.joining),
			disabled: Boolean(slide.disabled),
			durationRatio: typeof slide.durationRatio === "number" ? slide.durationRatio : 1,
		})),
		[rawSlides, selectedIndex]
	);

	useEffect(() => {
		const focusKey = pendingFocusKey.current;
		if (!focusKey) return;
		pendingFocusKey.current = null;
		rowRefs.current.get(focusKey)?.focus();
	}, [slides]);

	const focusSlideAfterRender = (key: string | undefined) => {
		if (!key) return;
		pendingFocusKey.current = key;
	};

	const hasDroppedImage = (event: React.DragEvent<HTMLElement>) => {
		return Array.from(event.dataTransfer.types).includes("imageId");
	};

	const handleSlideKeyDown = (slide: MainSlideSnapshot, event: React.KeyboardEvent<HTMLButtonElement>) => {
		const action = getSlideListKeyboardAction({
			key: event.key,
			metaKey: event.metaKey,
			ctrlKey: event.ctrlKey,
			canEdit: gate.canEdit,
			slideIndex: slide.index,
			slideCount: slides.length,
		});
		if (action.preventDefault) event.preventDefault();

		switch (action.type) {
			case "select":
				focusSlideAfterRender(slides[action.index]?.key);
				ViewerCommands.selectSlideByIndex(action.index);
				break;
			case "move":
				focusSlideAfterRender(slide.key);
				ViewerCommands.selectSlideByIndex(action.index);
				if (action.direction < 0) {
					ViewerCommands.moveSelectedSlideBackward();
				} else {
					ViewerCommands.moveSelectedSlideForward();
				}
				break;
			case "delete":
				focusSlideAfterRender(slides[action.index + 1]?.key ?? slides[action.index - 1]?.key);
				ViewerCommands.selectSlideByIndex(action.index);
				ViewerCommands.deleteSelectedSlide();
				break;
		}
	};

	const handleSlideDragStart = (slide: MainSlideSnapshot, event: React.DragEvent<HTMLButtonElement>) => {
		if (!gate.canEdit || slides.length < 2) return;
		setDraggingSlideIndex(slide.index);
		setSlideDropIndex(slide.index);
		event.dataTransfer.effectAllowed = "move";
		event.dataTransfer.setData("text/plain", String(slide.index));
	};

	const handleSlideDragOver = (slide: MainSlideSnapshot, event: React.DragEvent<HTMLButtonElement>) => {
		if (gate.canEdit && hasDroppedImage(event)) {
			event.preventDefault();
			event.dataTransfer.dropEffect = "copy";
			setSlideDropIndex(slide.index);
			return;
		}

		const action = getSlideListDropAction({
			canEdit: gate.canEdit,
			fromIndex: draggingSlideIndex,
			toIndex: slide.index,
			slideCount: slides.length,
		});
		if (action.preventDefault) {
			event.preventDefault();
			event.dataTransfer.dropEffect = "move";
			setSlideDropIndex(action.toIndex);
		}
	};

	const handleSlideDrop = (slide: MainSlideSnapshot, event: React.DragEvent<HTMLButtonElement>) => {
		const droppedImageId = event.dataTransfer.getData("imageId");
		if (gate.canEdit && droppedImageId) {
			event.preventDefault();
			setDraggingSlideIndex(null);
			setSlideDropIndex(null);
			ViewerCommands.addImageSlide(droppedImageId, slide.index);
			return;
		}

		const action = getSlideListDropAction({
			canEdit: gate.canEdit,
			fromIndex: draggingSlideIndex,
			toIndex: slide.index,
			slideCount: slides.length,
		});
		setDraggingSlideIndex(null);
		setSlideDropIndex(null);
		if (!action.preventDefault) return;
		event.preventDefault();
		focusSlideAfterRender(slides[action.fromIndex]?.key);
		ViewerCommands.selectSlideByIndex(action.fromIndex);
		ViewerCommands.moveSelectedSlideToIndex(action.toIndex);
	};

	const handleSlideDragEnd = () => {
		setDraggingSlideIndex(null);
		setSlideDropIndex(null);
	};

	return (
		<div className="mainSlideList" aria-label="Slide list">
			{slides.length === 0 ? (
				<div className="mainSlideList-empty">No slides</div>
			) : (
				slides.map((slide) => (
					<button
						key={slide.key}
						type="button"
						className={[
							"mainSlideList-item",
							slide.selected ? "selected" : "",
							slide.joining ? "joining" : "",
							slide.disabled ? "disabled" : "",
							draggingSlideIndex === slide.index ? "dragging" : "",
							slideDropIndex === slide.index ? "dropTarget" : "",
						].filter(Boolean).join(" ")}
						aria-current={slide.selected ? "true" : undefined}
						aria-disabled={slide.disabled ? "true" : undefined}
						aria-grabbed={draggingSlideIndex === slide.index ? "true" : undefined}
						draggable={gate.canEdit && slides.length > 1}
						ref={(node) => {
							if (node) {
								rowRefs.current.set(slide.key, node);
							} else {
								rowRefs.current.delete(slide.key);
							}
						}}
						onKeyDown={(event) => handleSlideKeyDown(slide, event)}
						onDragStart={(event) => handleSlideDragStart(slide, event)}
						onDragOver={(event) => handleSlideDragOver(slide, event)}
						onDrop={(event) => handleSlideDrop(slide, event)}
						onDragEnd={handleSlideDragEnd}
						onClick={() => ViewerCommands.selectSlideByIndex(slide.index)}
						onDoubleClick={() => gate.canEdit && ViewerCommands.enterEditMode()}>
						<span className="mainSlideList-index">{slide.label}</span>
						<span className="mainSlideList-meta">
							{slide.joining ? "J" : ""}{slide.disabled ? " off" : ""}{slide.durationRatio !== 1 ? ` x${slide.durationRatio}` : ""}
						</span>
					</button>
				))
			)}
		</div>
	);
}

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
			<div className="list">
				<MainSlideList gate={gate} />
			</div>
		</>
	);
}

