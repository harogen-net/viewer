import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import {
	useViewerEditSelection,
	useViewerHistory,
	useViewerMode,
	useViewerSlideSnapshots,
} from "../bridge/useViewerBridge";
import { getLayerActions } from "../hooks/useLayer";
import { getSlideActions, useSlide } from "../hooks/useSlide";
import type { LayerSnapshot, SlideSnapshot } from "../model/snapshot";
import { FeatureGate, getFeatureGate } from "../runtime/featureGate";
import { ImageManager } from "../utils/ImageManager";
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

type MainSlideListItem = {
	key: string;
	index: number;
	slide: SlideSnapshot;
	label: string;
	selected: boolean;
	joining: boolean;
	disabled: boolean;
	durationRatio: number;
};

type MainSlidePreviewProps = {
	slide: SlideSnapshot;
};

const getLayerPreviewStyle = (layer: LayerSnapshot): CSSProperties => {
	const style: CSSProperties = {
		position: "absolute",
		left: 0,
		top: 0,
		transform: "matrix(" + layer.matrix.join(",") + ")",
		opacity: layer.opacity,
		display: layer.visible ? undefined : "none",
	};

	if (Number.isFinite(layer.originWidth) && layer.originWidth > 0) {
		style.width = layer.originWidth;
	}
	if (Number.isFinite(layer.originHeight) && layer.originHeight > 0) {
		style.height = layer.originHeight;
	}

	return style;
};

const MainSlidePreviewLayer = ({ layer }: { layer: LayerSnapshot }) => {
	if (layer.type === "image") {
		const src = ImageManager.instance?.getSrcById(layer.imageId);
		if (!src) return null;
		return (
			<img
				className="mainSlideList-previewImage"
				src={src}
				style={getLayerPreviewStyle(layer)}
				draggable={false}
			/>
		);
	}

	if (layer.type === "text") {
		return (
			<span className="mainSlideList-previewText" style={getLayerPreviewStyle(layer)}>
				{layer.text}
			</span>
		);
	}

	return null;
};

const MainSlidePreview = ({ slide }: MainSlidePreviewProps) => {
	const width = slide.width || 1;
	const height = slide.height || 1;
	const scale = Math.min(148 / width, 84 / height);
	const offsetX = (148 - width * scale) / 2;
	const offsetY = (84 - height * scale) / 2;

	return (
		<span className="mainSlideList-preview" aria-hidden="true">
			<span
				className="mainSlideList-previewScene"
				style={{
					width,
					height,
					transform: `matrix(${scale},0,0,${scale},${offsetX},${offsetY})`,
				}}>
				{slide.layers.map((layer) => (
					<MainSlidePreviewLayer key={layer.uuid} layer={layer} />
				))}
			</span>
		</span>
	);
};

const MainSlideList = ({ gate }: { gate: FeatureGate }) => {
	const { slides: rawSlides, selectedIndex, revision } = useViewerSlideSnapshots();
	const { actions: slideActions } = useSlide();
	const [draggingSlideIndex, setDraggingSlideIndex] = useState<number | null>(null);
	const [slideDropIndex, setSlideDropIndex] = useState<number | null>(null);
	const pendingFocusKey = useRef<string | null>(null);
	const rowRefs = useRef(new Map<string, HTMLButtonElement>());

	const slides = useMemo<MainSlideListItem[]>(
		() =>
			rawSlides.map((slide, index) => ({
				key: slide.uuid || String(slide.id),
				index,
				slide,
				label: String(index + 1),
				selected: index === selectedIndex,
				joining: Boolean(slide.joining),
				disabled: Boolean(slide.disabled),
				durationRatio: typeof slide.durationRatio === "number" ? slide.durationRatio : 1,
			})),
		[rawSlides, selectedIndex, revision]
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

	const handleSlideKeyDown = (
		slide: MainSlideListItem,
		event: React.KeyboardEvent<HTMLButtonElement>
	) => {
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
				slideActions.selectByIndex(action.index);
				break;
			case "move":
				focusSlideAfterRender(slide.key);
				slideActions.selectByIndex(action.index);
				if (action.direction < 0) {
					slideActions.moveSelectedBackward();
				} else {
					slideActions.moveSelectedForward();
				}
				break;
			case "delete":
				focusSlideAfterRender(slides[action.index + 1]?.key ?? slides[action.index - 1]?.key);
				slideActions.selectByIndex(action.index);
				slideActions.deleteSelected();
				break;
		}
	};

	const handleSlideDragStart = (
		slide: MainSlideListItem,
		event: React.DragEvent<HTMLButtonElement>
	) => {
		if (!gate.canEdit || slides.length < 2) return;
		setDraggingSlideIndex(slide.index);
		setSlideDropIndex(slide.index);
		event.dataTransfer.effectAllowed = "move";
		event.dataTransfer.setData("text/plain", String(slide.index));
	};

	const handleSlideDragOver = (
		slide: MainSlideListItem,
		event: React.DragEvent<HTMLButtonElement>
	) => {
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

	const handleSlideDrop = (slide: MainSlideListItem, event: React.DragEvent<HTMLButtonElement>) => {
		const droppedImageId = event.dataTransfer.getData("imageId");
		if (gate.canEdit && droppedImageId) {
			event.preventDefault();
			setDraggingSlideIndex(null);
			setSlideDropIndex(null);
			slideActions.addImageSlide(droppedImageId, slide.index);
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
		slideActions.selectByIndex(action.fromIndex);
		slideActions.moveSelectedToIndex(action.toIndex);
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
						]
							.filter(Boolean)
							.join(" ")}
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
						onClick={() => slideActions.selectByIndex(slide.index)}
						onDoubleClick={() => gate.canEdit && slideActions.enterEditMode()}>
						<MainSlidePreview slide={slide.slide} />
						<span className="mainSlideList-index">{slide.label}</span>
						<span className="mainSlideList-meta">
							{slide.joining ? "J" : ""}
							{slide.disabled ? " off" : ""}
							{slide.durationRatio !== 1 ? ` x${slide.durationRatio}` : ""}
						</span>
					</button>
				))
			)}
		</div>
	);
};

export function MainShell({ gate = getFeatureGate("browser") }: MainShellProps) {
	const { mode } = useViewerMode();
	const { hasSelection, canPasteLayer } = useViewerEditSelection();
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
					getLayerActions()?.copyLayer();
					break;
				case "cut":
					getLayerActions()?.cutLayer();
					break;
				case "paste":
					getLayerActions()?.pasteLayer();
					break;
				case "undo":
					getLayerActions()?.undo();
					break;
				case "redo":
					getLayerActions()?.redo();
					break;
				case "enterSelectMode":
					getSlideActions()?.enterSelectMode();
					break;
				case "removeSelectedLayer":
					getLayerActions()?.remove();
					break;
				case "nudgeLeft":
					getLayerActions()?.nudgeLeft();
					break;
				case "nudgeRight":
					getLayerActions()?.nudgeRight();
					break;
				case "nudgeUp":
					getLayerActions()?.nudgeUp();
					break;
				case "nudgeDown":
					getLayerActions()?.nudgeDown();
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
