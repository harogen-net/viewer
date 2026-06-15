import { Badge, Button, Group, NativeSelect, Paper, ScrollArea, Stack, Switch, Text } from "@mantine/core";
import React, { useEffect, useMemo, useRef, useState } from "react";
import { ViewerCommands } from "../bridge/ViewerCommands";
import {
    useViewerEditCanvasState,
    useViewerEditLayerState,
    useViewerEditLayers,
    useViewerEditSelection,
    useViewerHistory,
    useViewerMode,
    useViewerModified,
    useViewerSavedFileSelection,
    useViewerSlides,
    useViewerSlideshowSettings,
    useViewerStorage,
} from "../bridge/useViewerBridge";
import { FeatureGate } from "../runtime/featureGate";
import { AppRuntimeMode } from "../runtime/mode";
import {
    getImagesContainerElement,
    getSaveFormat,
    setSaveFormat,
} from "../runtime/reactDomRegistry";
import { canToggleImagesPanel, getImagesPanelOpenState } from "./imagesPanelGate";
import { getLayerListDropAction, getLayerListKeyboardAction } from "./layerListKeyboard";
import {
    type ClipSide,
    getAdjustedClipValues,
    getAdjustedNumericValue,
    getClipValuesFromInputs,
    getInputStep,
    getWheelInputDelta,
} from "./numericInput";
import { getSlideListDropAction, getSlideListKeyboardAction } from "./slideListKeyboard";

const durationOptions = [
	{ value: "1", label: "0" },
	{ value: "500", label: "500" },
	{ value: "1000", label: "1000" },
	{ value: "2000", label: "2000" },
	{ value: "3000", label: "3000" },
	{ value: "4000", label: "4000" },
	{ value: "5000", label: "5000" },
];

const intervalOptions = [
	{ value: "500", label: "500" },
	{ value: "1000", label: "1000" },
	{ value: "2000", label: "2000" },
	{ value: "3000", label: "3000" },
	{ value: "4000", label: "4000" },
	{ value: "5000", label: "5000" },
	{ value: "6000", label: "6000" },
	{ value: "7000", label: "7000" },
	{ value: "8000", label: "8000" },
	{ value: "9000", label: "9000" },
	{ value: "10000", label: "10000" },
	{ value: "11000", label: "11000" },
	{ value: "12000", label: "12000" },
	{ value: "13000", label: "13000" },
	{ value: "14000", label: "14000" },
	{ value: "15000", label: "15000" },
];

const SLIDE_DURATION_RATIO_MIN = 0.2;
const SLIDE_DURATION_RATIO_MAX = 10;

type RuntimeShellProps = {
	mode: AppRuntimeMode;
	gate: FeatureGate;
};

type SlideSnapshot = {
	key: string;
	index: number;
	label: string;
	selected: boolean;
	joining: boolean;
	disabled: boolean;
	durationRatio: number;
};

type SavedFileSnapshot = {
	value: string;
	label: string;
};

export function RuntimeShell({ mode, gate }: RuntimeShellProps) {
	const { slides: rawSlides, selectedIndex } = useViewerSlides();
	const { titles } = useViewerStorage();
	const { selectedId: bridgedSelectedFileId } = useViewerSavedFileSelection();
	const slideShowSettings = useViewerSlideshowSettings();
	const history = useViewerHistory();
	const { modified } = useViewerModified();
	const { mode: viewerMode } = useViewerMode();
	const editCanvasState = useViewerEditCanvasState();
	const { hasSelection } = useViewerEditSelection();
	const { layers: editLayers } = useViewerEditLayers();
	const editLayerState = useViewerEditLayerState();

	const [slideCollapsed, setSlideCollapsed] = useState(false);
	const [fileCollapsed, setFileCollapsed] = useState(false);
	const [pos, setPos] = useState<{ x: number; y: number } | null>(null);
	const [posXInput, setPosXInput] = useState("");
	const [posYInput, setPosYInput] = useState("");
	const [scaleInput, setScaleInput] = useState("");
	const [rotationInput, setRotationInput] = useState("");
	const [opacityInput, setOpacityInput] = useState("");
	const [clipTopInput, setClipTopInput] = useState("");
	const [clipRightInput, setClipRightInput] = useState("");
	const [clipBottomInput, setClipBottomInput] = useState("");
	const [clipLeftInput, setClipLeftInput] = useState("");
	const [zoomInput, setZoomInput] = useState("");
	const [textLayerInput, setTextLayerInput] = useState("");
	const [layerNameInput, setLayerNameInput] = useState("");
	const [textContentInput, setTextContentInput] = useState("");
	const [replaceImageForAll, setReplaceImageForAll] = useState(false);
	const [imagesPanelOpen, setImagesPanelOpen] = useState(false);
	const [newDocumentConfirmOpen, setNewDocumentConfirmOpen] = useState(false);
	const [spreadConfirmOpen, setSpreadConfirmOpen] = useState(false);
	const [saveFormat, setSaveFormatState] = useState<"png" | "hvz" | "hvd">("png");
	const [durationRatioInput, setDurationRatioInput] = useState("");
	const [draggingSlideIndex, setDraggingSlideIndex] = useState<number | null>(null);
	const [slideDropIndex, setSlideDropIndex] = useState<number | null>(null);
	const [draggingLayerPosition, setDraggingLayerPosition] = useState<number | null>(null);
	const [layerDropPosition, setLayerDropPosition] = useState<number | null>(null);
	const [renamingLayerId, setRenamingLayerId] = useState<number | null>(null);
	const [renameLayerInput, setRenameLayerInput] = useState("");
	const canUseImagesPanel = canToggleImagesPanel(gate.canEdit);
	const effectiveImagesPanelOpen = getImagesPanelOpenState(imagesPanelOpen, canUseImagesPanel);
	const imageReplaceInputRef = useRef<HTMLInputElement | null>(null);
	const pendingSlideFocusKey = useRef<string | null>(null);
	const pendingLayerFocusKey = useRef<string | null>(null);
	const renameCanceledRef = useRef(false);
	const slideRowRefs = useRef(new Map<string, HTMLElement>());
	const layerRowRefs = useRef(new Map<string, HTMLElement>());
	const dragState = useRef<{
		startMouseX: number;
		startMouseY: number;
		startX: number;
		startY: number;
	} | null>(null);

	useEffect(() => {
		setSaveFormatState(getSaveFormat());
	}, []);

	useEffect(() => {
		const container = getImagesContainerElement();
		if (!container) return;
		container.style.display = effectiveImagesPanelOpen ? "block" : "none";
		if (effectiveImagesPanelOpen) {
			container.style.position = "fixed";
			container.style.right = "12px";
			container.style.bottom = "320px";
			container.style.zIndex = "2147483645";
			container.style.width = "320px";
			container.style.height = "220px";
			container.style.overflowY = "auto";
			container.style.padding = "4px";
			container.style.background = "rgba(248, 249, 250, 0.9)";
			container.style.border = "1px solid #dee2e6";
			container.style.borderRadius = "6px";
		}
	}, [effectiveImagesPanelOpen]);

	useEffect(() => {
		if (canUseImagesPanel) return;
		setImagesPanelOpen(false);
	}, [canUseImagesPanel]);

	useEffect(() => {
		if (gate.canEdit && modified) return;
		setNewDocumentConfirmOpen(false);
	}, [gate.canEdit, modified]);

	useEffect(() => {
		setPosXInput(editLayerState.x == null ? "" : String(Math.round(editLayerState.x)));
		setPosYInput(editLayerState.y == null ? "" : String(Math.round(editLayerState.y)));
		setScaleInput(editLayerState.scale == null ? "" : editLayerState.scale.toFixed(3));
		setRotationInput(
			editLayerState.rotation == null ? "" : String(Math.round(editLayerState.rotation))
		);
		setOpacityInput(editLayerState.opacity == null ? "" : editLayerState.opacity.toFixed(2));
		setClipTopInput(editLayerState.clipTop == null ? "" : String(Math.round(editLayerState.clipTop)));
		setClipRightInput(
			editLayerState.clipRight == null ? "" : String(Math.round(editLayerState.clipRight))
		);
		setClipBottomInput(
			editLayerState.clipBottom == null ? "" : String(Math.round(editLayerState.clipBottom))
		);
		setClipLeftInput(
			editLayerState.clipLeft == null ? "" : String(Math.round(editLayerState.clipLeft))
		);
		setLayerNameInput(editLayerState.name ?? "");
	}, [
		editLayerState.x,
		editLayerState.y,
		editLayerState.scale,
		editLayerState.rotation,
		editLayerState.opacity,
		editLayerState.clipTop,
		editLayerState.clipRight,
		editLayerState.clipBottom,
		editLayerState.clipLeft,
		editLayerState.name,
	]);

	useEffect(() => {
		setZoomInput(String(Math.round((editCanvasState.scale || 1) * 100)));
	}, [editCanvasState.scale]);

	useEffect(() => {
		setTextContentInput(editLayerState.textContent ?? "");
	}, [editLayerState.textContent]);

	const handleDragStart = (e: React.MouseEvent<HTMLDivElement>) => {
		const currentX = pos?.x ?? window.innerWidth - 292;
		const currentY = pos?.y ?? 12;
		dragState.current = {
			startMouseX: e.clientX,
			startMouseY: e.clientY,
			startX: currentX,
			startY: currentY,
		};
		const onMouseMove = (ev: MouseEvent) => {
			if (!dragState.current) return;
			setPos({
				x: dragState.current.startX + (ev.clientX - dragState.current.startMouseX),
				y: dragState.current.startY + (ev.clientY - dragState.current.startMouseY),
			});
		};
		const onMouseUp = () => {
			dragState.current = null;
			window.removeEventListener("mousemove", onMouseMove);
			window.removeEventListener("mouseup", onMouseUp);
		};
		window.addEventListener("mousemove", onMouseMove);
		window.addEventListener("mouseup", onMouseUp);
	};

	const slides = useMemo<SlideSnapshot[]>(
		() =>
			rawSlides.map((slide, i) => ({
				key: slide.uuid || String(slide.id),
				index: i,
				label: `Slide ${i + 1}`,
				selected: i === selectedIndex,
				joining: Boolean(slide.joining),
				disabled: Boolean(slide.disabled),
				durationRatio: typeof slide.durationRatio === "number" ? slide.durationRatio : 1,
			})),
		[rawSlides, selectedIndex]
	);

	const selectedRawSlide = useMemo(
		() =>
			selectedIndex >= 0 && selectedIndex < rawSlides.length ? rawSlides[selectedIndex] : null,
		[rawSlides, selectedIndex]
	);

	useEffect(() => {
		setDurationRatioInput(selectedRawSlide != null ? String(selectedRawSlide.durationRatio) : "");
	}, [selectedRawSlide?.durationRatio]);

	const savedFiles = useMemo<SavedFileSnapshot[]>(
		() =>
			titles.map((t) => ({
				value: String(t.id),
				label: t.title,
			})),
		[titles]
	);

	const selectedFileId = useMemo(() => {
		if (!bridgedSelectedFileId) {
			return savedFiles[0]?.value ?? null;
		}
		if (savedFiles.some((f) => f.value === bridgedSelectedFileId)) {
			return bridgedSelectedFileId;
		}
		return savedFiles[0]?.value ?? null;
	}, [bridgedSelectedFileId, savedFiles]);

	const selectedSlide = useMemo(() => slides.find((s) => s.selected) ?? null, [slides]);

	const sortedEditLayers = useMemo(
		() => [...editLayers].sort((a, b) => b.index - a.index),
		[editLayers]
	);

	const getLayerKey = (layer: (typeof sortedEditLayers)[number]) =>
		String(layer.id) + "-" + String(layer.index);

	const selectSlide = (index: number) => {
		ViewerCommands.selectSlideByIndex(index);
	};

	useEffect(() => {
		const focusKey = pendingSlideFocusKey.current;
		if (!focusKey) return;
		pendingSlideFocusKey.current = null;
		slideRowRefs.current.get(focusKey)?.focus();
	}, [slides]);

	const focusSlideAfterRender = (key: string | undefined) => {
		if (!key) return;
		pendingSlideFocusKey.current = key;
	};

	useEffect(() => {
		const focusKey = pendingLayerFocusKey.current;
		if (!focusKey) return;
		pendingLayerFocusKey.current = null;
		layerRowRefs.current.get(focusKey)?.focus();
	}, [sortedEditLayers]);

	const focusLayerAfterRender = (key: string | undefined) => {
		if (!key) return;
		pendingLayerFocusKey.current = key;
	};

	const handleSlideKeyDown = (slide: SlideSnapshot, event: React.KeyboardEvent<HTMLDivElement>) => {
		const action = getSlideListKeyboardAction({
			key: event.key,
			metaKey: event.metaKey,
			ctrlKey: event.ctrlKey,
			canEdit: gate.canEdit,
			slideIndex: slide.index,
			slideCount: slides.length,
		});
		if (action.preventDefault) {
			event.preventDefault();
		}

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

	const handleSlideDragStart = (slide: SlideSnapshot, event: React.DragEvent<HTMLDivElement>) => {
		if (!gate.canEdit || slides.length < 2) return;
		setDraggingSlideIndex(slide.index);
		setSlideDropIndex(slide.index);
		event.dataTransfer.effectAllowed = "move";
		event.dataTransfer.setData("text/plain", String(slide.index));
	};

	const handleSlideDragOver = (slide: SlideSnapshot, event: React.DragEvent<HTMLDivElement>) => {
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

	const handleSlideDrop = (slide: SlideSnapshot, event: React.DragEvent<HTMLDivElement>) => {
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

	const handleSlideContextMenu = (slide: SlideSnapshot, event: React.MouseEvent<HTMLDivElement>) => {
		event.preventDefault();
		if (!gate.canEdit) return;
		ViewerCommands.requestSlideContextMenu(
			slide.index,
			event.clientY,
			event.clientX
		);
	};

	const requestNewDocument = () => {
		if (!gate.canEdit) return;
		if (modified) {
			setNewDocumentConfirmOpen(true);
			return;
		}
		ViewerCommands.newDocument();
	};

	const confirmNewDocument = () => {
		setNewDocumentConfirmOpen(false);
		ViewerCommands.newDocument(true);
	};

	const applyPosition = () => {
		if (!canEditSelectedLayer) return;
		const x = Number(posXInput);
		const y = Number(posYInput);
		if (!isFinite(x) || !isFinite(y)) return;
		ViewerCommands.setSelectedLayerPosition(x, y);
	};

	const adjustPositionX = (delta: number) => {
		if (!canEditSelectedLayer) return;
		const nextX = getAdjustedNumericValue(posXInput, editLayerState.x ?? 0, delta);
		const y = Number(posYInput);
		const nextY = Number.isFinite(y) ? y : editLayerState.y ?? 0;
		setPosXInput(String(nextX));
		ViewerCommands.setSelectedLayerPosition(nextX, nextY);
	};

	const adjustPositionY = (delta: number) => {
		if (!canEditSelectedLayer) return;
		const nextY = getAdjustedNumericValue(posYInput, editLayerState.y ?? 0, delta);
		const x = Number(posXInput);
		const nextX = Number.isFinite(x) ? x : editLayerState.x ?? 0;
		setPosYInput(String(nextY));
		ViewerCommands.setSelectedLayerPosition(nextX, nextY);
	};

	const applyScale = () => {
		if (!canEditSelectedLayer) return;
		const scale = Number(scaleInput);
		if (!isFinite(scale) || scale <= 0) return;
		ViewerCommands.setSelectedLayerScale(scale);
	};

	const adjustScale = (delta: number) => {
		if (!canEditSelectedLayer) return;
		const scale = getAdjustedNumericValue(scaleInput, editLayerState.scale ?? 1, delta, { min: 0.01 });
		setScaleInput(String(scale));
		ViewerCommands.setSelectedLayerScale(scale);
	};

	const applyRotation = () => {
		if (!canEditSelectedLayer) return;
		const rotation = Number(rotationInput);
		if (!isFinite(rotation)) return;
		ViewerCommands.setSelectedLayerRotation(rotation);
	};

	const adjustRotation = (delta: number) => {
		if (!canEditSelectedLayer) return;
		const rotation = getAdjustedNumericValue(rotationInput, editLayerState.rotation ?? 0, delta);
		setRotationInput(String(rotation));
		ViewerCommands.setSelectedLayerRotation(rotation);
	};

	const applyOpacity = () => {
		if (!canEditSelectedLayer) return;
		const opacity = Number(opacityInput);
		if (!isFinite(opacity)) return;
		ViewerCommands.setSelectedLayerOpacity(opacity);
	};

	const adjustOpacity = (delta: number) => {
		if (!canEditSelectedLayer) return;
		const opacity = getAdjustedNumericValue(opacityInput, editLayerState.opacity ?? 1, delta, { min: 0, max: 1 });
		setOpacityInput(String(opacity));
		ViewerCommands.setSelectedLayerOpacity(opacity);
	};

	const applyClip = () => {
		if (!canEditSelectedLayer || !isImageLayer) return;
		const next = getClipValuesFromInputs({
			top: clipTopInput,
			right: clipRightInput,
			bottom: clipBottomInput,
			left: clipLeftInput,
		});
		if (!next) return;
		ViewerCommands.setSelectedImageClip(next.top, next.right, next.bottom, next.left);
	};

	const adjustClip = (side: ClipSide, delta: number) => {
		if (!canEditSelectedLayer || !isImageLayer) return;
		const next = getAdjustedClipValues(
			{
				top: clipTopInput,
				right: clipRightInput,
				bottom: clipBottomInput,
				left: clipLeftInput,
			},
			{
				top: editLayerState.clipTop ?? 0,
				right: editLayerState.clipRight ?? 0,
				bottom: editLayerState.clipBottom ?? 0,
				left: editLayerState.clipLeft ?? 0,
			},
			side,
			delta
		);
		setClipTopInput(String(next.top));
		setClipRightInput(String(next.right));
		setClipBottomInput(String(next.bottom));
		setClipLeftInput(String(next.left));
		ViewerCommands.setSelectedImageClip(next.top, next.right, next.bottom, next.left);
	};

	const addTextLayer = () => {
		if (!gate.canEdit || !isEditMode) return;
		const text = textLayerInput.trim();
		if (!text) return;
		ViewerCommands.addTextLayer(text);
		setTextLayerInput("");
	};

	const confirmSpreadSelectedLayer = () => {
		if (!canEditSelectedLayer) return;
		setSpreadConfirmOpen(false);
		ViewerCommands.spreadSelectedLayer(true);
	};

	const applyLayerName = () => {
		if (!canEditSelectedLayer) return;
		const name = layerNameInput.trim();
		if (!name) return;
		ViewerCommands.setSelectedLayerName(name);
	};

	const startLayerRename = (layer: (typeof sortedEditLayers)[number]) => {
		if (!gate.canEdit || !isEditMode) return;
		renameCanceledRef.current = false;
		ViewerCommands.selectEditLayerByIndex(layer.index);
		setRenamingLayerId(layer.id);
		setRenameLayerInput(layer.name);
	};

	const commitLayerRename = () => {
		if (renameCanceledRef.current) {
			renameCanceledRef.current = false;
			setRenamingLayerId(null);
			return;
		}
		if (renamingLayerId === null) return;
		const layer = sortedEditLayers.find((l) => l.id === renamingLayerId);
		if (layer) {
			ViewerCommands.selectEditLayerByIndex(layer.index);
			ViewerCommands.setSelectedLayerName(renameLayerInput);
			focusLayerAfterRender(getLayerKey(layer));
		}
		setRenamingLayerId(null);
	};

	const handleLayerKeyDown = (
		layer: (typeof sortedEditLayers)[number],
		position: number,
		event: React.KeyboardEvent<HTMLDivElement>
	) => {
		const action = getLayerListKeyboardAction({
			key: event.key,
			metaKey: event.metaKey,
			ctrlKey: event.ctrlKey,
			canEdit: gate.canEdit && isEditMode,
			layerPosition: position,
			layerCount: sortedEditLayers.length,
		});
		if (action.preventDefault) {
			event.preventDefault();
		}

		switch (action.type) {
			case "select": {
				const nextLayer = sortedEditLayers[action.position];
				if (!nextLayer) return;
				focusLayerAfterRender(getLayerKey(nextLayer));
				ViewerCommands.selectEditLayerByIndex(nextLayer.index);
				break;
			}
			case "rename":
				startLayerRename(layer);
				break;
			case "move":
				focusLayerAfterRender(getLayerKey(layer));
				ViewerCommands.selectEditLayerByIndex(layer.index);
				if (action.direction < 0) {
					ViewerCommands.moveSelectedLayerUp();
				} else {
					ViewerCommands.moveSelectedLayerDown();
				}
				break;
			case "delete": {
				const nextLayer =
					sortedEditLayers[action.position + 1] ?? sortedEditLayers[action.position - 1];
				focusLayerAfterRender(nextLayer ? getLayerKey(nextLayer) : undefined);
				ViewerCommands.selectEditLayerByIndex(layer.index);
				ViewerCommands.removeSelectedLayer();
				break;
			}
		}
	};

	const handleLayerDragStart = (
		position: number,
		event: React.DragEvent<HTMLDivElement>
	) => {
		if (!gate.canEdit || !isEditMode || sortedEditLayers.length < 2) return;
		setDraggingLayerPosition(position);
		setLayerDropPosition(position);
		event.dataTransfer.effectAllowed = "move";
		event.dataTransfer.setData("text/plain", String(position));
	};

	const handleLayerDragOver = (
		position: number,
		event: React.DragEvent<HTMLDivElement>
	) => {
		const action = getLayerListDropAction({
			canEdit: gate.canEdit && isEditMode,
			fromPosition: draggingLayerPosition,
			toPosition: position,
			layerCount: sortedEditLayers.length,
		});
		if (action.preventDefault) {
			event.preventDefault();
			event.dataTransfer.dropEffect = "move";
			setLayerDropPosition(action.toPosition);
		}
	};

	const handleLayerDrop = (
		position: number,
		event: React.DragEvent<HTMLDivElement>
	) => {
		const action = getLayerListDropAction({
			canEdit: gate.canEdit && isEditMode,
			fromPosition: draggingLayerPosition,
			toPosition: position,
			layerCount: sortedEditLayers.length,
		});
		setDraggingLayerPosition(null);
		setLayerDropPosition(null);
		if (!action.preventDefault) return;
		event.preventDefault();
		const fromLayer = sortedEditLayers[action.fromPosition];
		const toLayer = sortedEditLayers[action.toPosition];
		if (!fromLayer || !toLayer) return;
		focusLayerAfterRender(getLayerKey(fromLayer));
		ViewerCommands.selectEditLayerByIndex(fromLayer.index);
		ViewerCommands.moveSelectedLayerToIndex(toLayer.index);
	};

	const handleLayerDragEnd = () => {
		setDraggingLayerPosition(null);
		setLayerDropPosition(null);
	};

	const applyTextContent = () => {
		if (!canEditSelectedLayer || editLayerState.layerType !== "text") return;
		ViewerCommands.setSelectedLayerText(textContentInput);
	};

	const openImageReplacePicker = () => {
		if (!canEditSelectedLayer || !isImageLayer) return;
		imageReplaceInputRef.current?.click();
	};

	const onImageReplaceSelected = (e: React.ChangeEvent<HTMLInputElement>) => {
		const file = e.currentTarget.files?.[0];
		if (file) {
			ViewerCommands.replaceSelectedImage(file, replaceImageForAll);
		}
		e.currentTarget.value = "";
	};

	const applyCanvasZoom = () => {
		if (!gate.canEdit || !isEditMode) return;
		const zoomPercent = Number(zoomInput);
		if (!isFinite(zoomPercent) || zoomPercent <= 0) return;
		ViewerCommands.setCanvasScale(zoomPercent / 100);
	};

	const adjustCanvasZoom = (delta: number) => {
		if (!gate.canEdit || !isEditMode) return;
		const nextZoom = getAdjustedNumericValue(zoomInput, (editCanvasState.scale || 1) * 100, delta, {
			min: 10,
			max: 2000,
		});
		setZoomInput(String(nextZoom));
		ViewerCommands.setCanvasScale(nextZoom / 100);
	};

	const adjustDurationRatio = (delta: number) => {
		if (!gate.canEdit || !selectedRawSlide) return;
		const nextRatio = getAdjustedNumericValue(durationRatioInput, selectedRawSlide.durationRatio, delta, {
			min: SLIDE_DURATION_RATIO_MIN,
			max: SLIDE_DURATION_RATIO_MAX,
		});
		setDurationRatioInput(String(nextRatio));
		ViewerCommands.setSelectedSlideDurationRatio(nextRatio);
	};

	const applyDurationRatio = () => {
		if (!gate.canEdit || !selectedRawSlide) return;
		const ratio = Number(durationRatioInput);
		if (!isFinite(ratio) || ratio <= 0) return;
		const nextRatio = Math.min(
			SLIDE_DURATION_RATIO_MAX,
			Math.max(SLIDE_DURATION_RATIO_MIN, ratio)
		);
		setDurationRatioInput(String(nextRatio));
		ViewerCommands.setSelectedSlideDurationRatio(nextRatio);
	};

	const handleNumericKeyDown = (
		event: React.KeyboardEvent<HTMLInputElement>,
		adjustValue: (delta: number) => void,
		baseStep: number,
		applyValue?: () => void
	) => {
		if (event.key === "Enter") {
			event.currentTarget.blur();
			applyValue?.();
			return;
		}
		if (event.key !== "ArrowUp" && event.key !== "ArrowDown") return;
		event.preventDefault();
		const direction = event.key === "ArrowUp" ? 1 : -1;
		adjustValue(getInputStep(baseStep, event) * direction);
	};

	const handleNumericWheel = (
		event: React.WheelEvent<HTMLInputElement>,
		adjustValue: (delta: number) => void,
		baseStep: number
	) => {
		if (document.activeElement !== event.currentTarget) return;
		event.preventDefault();
		adjustValue(getWheelInputDelta(baseStep, event));
	};

	const selectSavedFile = (value: string) => {
		ViewerCommands.selectSavedFile(value);
		ViewerCommands.loadSelectedSavedFile();
	};

	const changeSaveFormat = (format: "png" | "hvz" | "hvd") => {
		setSaveFormatState(format);
		setSaveFormat(format);
	};

	const selectPreviousSavedFileAndLoad = () => {
		ViewerCommands.selectPreviousSavedFile();
		ViewerCommands.loadSelectedSavedFile();
	};

	const selectNextSavedFileAndLoad = () => {
		ViewerCommands.selectNextSavedFile();
		ViewerCommands.loadSelectedSavedFile();
	};

	const modeText = mode === "mobile-pwa" ? "mobile-pwa" : "browser";
	const isEditMode = viewerMode === "edit";
	const isImageLayer = editLayerState.layerType === "image";
	const canEditSelectedLayer = gate.canEdit && isEditMode && hasSelection;
	useEffect(() => {
		if (canEditSelectedLayer) return;
		setSpreadConfirmOpen(false);
	}, [canEditSelectedLayer]);

	const disabledSlideCount = slides.filter((slide) => slide.disabled).length;
	const allSlidesJoined = slides.length > 0 && slides.every((slide) => slide.joining);
	const canUnjoinSlides = slides.some((slide) => slide.joining || slide.durationRatio !== 1);
	const canMoveSelectedSlideBackward = gate.canEdit && selectedIndex > 0;
	const canMoveSelectedSlideForward = gate.canEdit && selectedIndex >= 0 && selectedIndex < slides.length - 1;
	const fmt = (value: number | null, digits = 2): string =>
		value == null ? "-" : value.toFixed(digits);

	const posStyle: React.CSSProperties = pos
		? { left: pos.x, top: pos.y, right: "auto" }
		: { right: 12, top: 12 };

	return (
		<>
			<Paper
				shadow="md"
				p={0}
				radius="md"
				withBorder
				style={{
					position: "fixed",
					width: 320,
					zIndex: 2147483646,
					background: "rgba(255, 255, 255, 0.92)",
					backdropFilter: "blur(2px)",
					...posStyle,
				}}>
				<div
					onMouseDown={handleDragStart}
					style={{
						padding: "6px 8px",
						cursor: "grab",
						userSelect: "none",
						borderBottom: slideCollapsed ? "none" : "1px solid #dee2e6",
					}}>
					<Group justify="space-between" align="center" wrap="nowrap">
						<Group gap={6} align="center" wrap="nowrap">
							<Text fw={700} size="sm">
								Slide IO
							</Text>
							<Badge size="xs" color={mode === "mobile-pwa" ? "orange" : "blue"}>
								{modeText}
							</Badge>
						</Group>
						<Button
							size="xs"
							variant="subtle"
							p={2}
							style={{ minWidth: 24, lineHeight: 1 }}
							onMouseDown={(e) => e.stopPropagation()}
							onClick={() => setSlideCollapsed((c) => !c)}>
							{slideCollapsed ? "▼" : "▲"}
						</Button>
					</Group>
				</div>

				{!slideCollapsed && (
					<ScrollArea h="44vh" type="auto">
						<Stack gap={8} p="sm">
							<Group gap={6}>
								<Badge size="xs" color={gate.canEdit ? "teal" : "gray"}>
									{gate.canEdit ? "editable" : "readonly"}
								</Badge>
								<Badge size="xs" color={gate.canImport ? "cyan" : "gray"}>
									import:{gate.canImport ? "on" : "off"}
								</Badge>
							</Group>

							<Text size="xs" c="dimmed">
								Slide List (React control)
							</Text>
							<Group grow>
								<Button
									size="xs"
									variant={viewerMode === "select" ? "filled" : "default"}
									onClick={() => ViewerCommands.enterSelectMode()}>
									Select
								</Button>
								<Button
									size="xs"
									variant={viewerMode === "edit" ? "filled" : "default"}
									onClick={() => ViewerCommands.enterEditMode()}
									disabled={!gate.canEdit || !selectedSlide}>
									Edit
								</Button>
							</Group>
							<Group grow>
								<Button
									size="xs"
									variant="light"
									onClick={() => ViewerCommands.newSlide()}
									disabled={!gate.canEdit}>
									New
								</Button>
								<Button
									size="xs"
									variant="light"
									onClick={() => ViewerCommands.cloneSelectedSlide()}
									disabled={!gate.canEdit || !selectedSlide}>
									Clone
								</Button>
								<Button
									size="xs"
									color="red"
									variant="light"
									onClick={() => ViewerCommands.deleteSelectedSlide()}
									disabled={!gate.canEdit || !selectedSlide}>
									Delete
								</Button>
							</Group>
							<Group grow>
								<Button
									size="xs"
									variant="default"
									onClick={() => ViewerCommands.selectPreviousSlide()}>
									Prev
								</Button>
								<Button
									size="xs"
									variant="default"
									onClick={() => ViewerCommands.selectNextSlide()}>
									Next
								</Button>
							</Group>
							{gate.canEdit && slides.length > 1 && (
								<Group grow>
									<Button
										size="xs"
										variant="default"
										onClick={() => ViewerCommands.moveSelectedSlideBackward()}
										disabled={!canMoveSelectedSlideBackward}>
										Move Prev
									</Button>
									<Button
										size="xs"
										variant="default"
										onClick={() => ViewerCommands.moveSelectedSlideForward()}
										disabled={!canMoveSelectedSlideForward}>
										Move Next
									</Button>
								</Group>
							)}
							{selectedRawSlide && gate.canEdit && (
								<Group grow>
									<Switch
										size="xs"
										label="Join"
										checked={Boolean(selectedRawSlide.joining)}
										onChange={() => ViewerCommands.toggleSelectedSlideJoining()}
									/>
									<Switch
										size="xs"
										label="Disabled"
										checked={Boolean(selectedRawSlide.disabled)}
										onChange={() => ViewerCommands.toggleSelectedSlideDisabled()}
									/>
								</Group>
							)}
							{gate.canEdit && slides.length > 0 && (
								<Group grow>
									<Switch
										size="xs"
										label="All Join"
										checked={allSlidesJoined}
										onChange={() => ViewerCommands.toggleAllSlidesJoining()}
									/>
									<Button
										size="xs"
										variant="default"
										onClick={() => ViewerCommands.unjoinAllSlides()}
										disabled={!canUnjoinSlides}>
										Unjoin All
									</Button>
									<Button
										size="xs"
										variant="default"
										onClick={() => ViewerCommands.enableAllSlides()}>
										Enable All
									</Button>
									<Button
										size="xs"
										variant="default"
										onClick={() => ViewerCommands.disableAllSlides()}>
										Disable All
									</Button>
								</Group>
							)}
							{gate.canEdit && slides.length > 0 && (
								<Group grow>
									<Button
										size="xs"
										variant="default"
										onClick={() => ViewerCommands.enableOnlySelectedSlide()}
										disabled={!selectedSlide}>
										Only This
									</Button>
									<Button
										size="xs"
										color="red"
										variant="light"
										onClick={() => ViewerCommands.deleteDisabledSlides()}
										disabled={disabledSlideCount === 0}>
										Delete Disabled ({disabledSlideCount})
									</Button>
								</Group>
							)}
							{selectedRawSlide && gate.canEdit && (
								<Group grow>
									<Text size="xs" c="dimmed" style={{ display: "flex", alignItems: "center" }}>
										Time×{selectedRawSlide.durationRatio}
									</Text>
									<input
										type="number"
										min={SLIDE_DURATION_RATIO_MIN}
										max={SLIDE_DURATION_RATIO_MAX}
										step="0.1"
										value={durationRatioInput}
										onChange={(e) => setDurationRatioInput(e.target.value)}
										onBlur={applyDurationRatio}
										onKeyDown={(e) => handleNumericKeyDown(e, adjustDurationRatio, 0.1)}
										onWheel={(e) => handleNumericWheel(e, adjustDurationRatio, 0.1)}
										style={{ width: "100%" }}
									/>
									<Button
										size="xs"
										variant="default"
										onClick={applyDurationRatio}>
										Set Time×
									</Button>
								</Group>
							)}
							<Group grow>
								<Button
									size="xs"
									variant="default"
									onClick={() => ViewerCommands.undo()}
									disabled={!gate.canEdit || !history.canUndo}>
									Undo
								</Button>
								<Button
									size="xs"
									variant="default"
									onClick={() => ViewerCommands.redo()}
									disabled={!gate.canEdit || !history.canRedo}>
									Redo
								</Button>
							</Group>
							<Text size="xs" c="dimmed">
								Edit Ops (Phase3)
							</Text>
							<Group grow>
								<Text size="xs" c="dimmed" style={{ display: "flex", alignItems: "center" }}>
									Zoom: {Math.round((editCanvasState.scale || 1) * 100)}%
								</Text>
								<Switch
									size="xs"
									label="Rect Edit"
									checked={editCanvasState.rectEdit}
									onChange={(e) => ViewerCommands.setRectEdit(e.currentTarget.checked)}
									disabled={!gate.canEdit || !isEditMode}
								/>
							</Group>
							<Group grow>
								<input
									type="number"
									min="10"
									max="2000"
									step="1"
									value={zoomInput}
									onChange={(e) => setZoomInput(e.target.value)}
									onBlur={applyCanvasZoom}
									onKeyDown={(e) => handleNumericKeyDown(e, adjustCanvasZoom, 10, applyCanvasZoom)}
									onWheel={(e) => handleNumericWheel(e, adjustCanvasZoom, 10)}
									disabled={!gate.canEdit || !isEditMode}
									style={{ width: "100%" }}
								/>
								<Button
									size="xs"
									variant="default"
									onClick={applyCanvasZoom}
									disabled={!gate.canEdit || !isEditMode}>
									Set Zoom%
								</Button>
							</Group>
							<Group grow>
								<Button
									size="xs"
									variant="default"
									onClick={() => ViewerCommands.rotateSelectedLayerLeft()}
									disabled={!gate.canEdit || !isEditMode || !hasSelection}>
									Rot L
								</Button>
								<Button
									size="xs"
									variant="default"
									onClick={() => ViewerCommands.rotateSelectedLayerRight()}
									disabled={!gate.canEdit || !isEditMode || !hasSelection}>
									Rot R
								</Button>
								<Button
									size="xs"
									variant="default"
									onClick={() => ViewerCommands.fitSelectedLayer()}
									disabled={!gate.canEdit || !isEditMode || !hasSelection}>
									Fit
								</Button>
							</Group>
							<Group grow>
								<Switch
									size="xs"
									label="Mirror H"
									checked={Boolean(editLayerState.mirrorH)}
									onChange={() => ViewerCommands.toggleSelectedLayerMirrorH()}
									disabled={!gate.canEdit || !isEditMode || !hasSelection}
								/>
								<Switch
									size="xs"
									label="Mirror V"
									checked={Boolean(editLayerState.mirrorV)}
									onChange={() => ViewerCommands.toggleSelectedLayerMirrorV()}
									disabled={!gate.canEdit || !isEditMode || !hasSelection}
								/>
							</Group>
							<Group grow>
								<Button
									size="xs"
									variant="default"
									onClick={() => ViewerCommands.arrangeSelectedLayerTop()}
									disabled={!gate.canEdit || !isEditMode || !hasSelection}>
									Align T
								</Button>
								<Button
									size="xs"
									variant="default"
									onClick={() => ViewerCommands.arrangeSelectedLayerRight()}
									disabled={!gate.canEdit || !isEditMode || !hasSelection}>
									Align R
								</Button>
								<Button
									size="xs"
									variant="default"
									onClick={() => ViewerCommands.arrangeSelectedLayerBottom()}
									disabled={!gate.canEdit || !isEditMode || !hasSelection}>
									Align B
								</Button>
								<Button
									size="xs"
									variant="default"
									onClick={() => ViewerCommands.arrangeSelectedLayerLeft()}
									disabled={!gate.canEdit || !isEditMode || !hasSelection}>
									Align L
								</Button>
							</Group>
							<Group grow>
								<Button
									size="xs"
									variant="default"
									onClick={() => ViewerCommands.moveSelectedLayerDown()}
									disabled={!gate.canEdit || !isEditMode || !hasSelection}>
									Back 1
								</Button>
								<Button
									size="xs"
									variant="default"
									onClick={() => ViewerCommands.moveSelectedLayerUp()}
									disabled={!gate.canEdit || !isEditMode || !hasSelection}>
									Front 1
								</Button>
								<Button
									size="xs"
									variant="default"
									onClick={() => ViewerCommands.moveSelectedLayerToBottom()}
									disabled={!gate.canEdit || !isEditMode || !hasSelection}>
									Back All
								</Button>
								<Button
									size="xs"
									variant="default"
									onClick={() => ViewerCommands.moveSelectedLayerToTop()}
									disabled={!gate.canEdit || !isEditMode || !hasSelection}>
									Front All
								</Button>
							</Group>
							<Group grow>
								<Button
									size="xs"
									variant="default"
									onClick={() => ViewerCommands.cutSelectedLayer()}
									disabled={!gate.canEdit || !isEditMode || !hasSelection}>
									Cut
								</Button>
								<Button
									size="xs"
									variant="default"
									onClick={() => ViewerCommands.copySelectedLayer()}
									disabled={!gate.canEdit || !isEditMode || !hasSelection}>
									Copy
								</Button>
								<Button
									size="xs"
									variant="default"
									onClick={() => ViewerCommands.pasteLayer()}
									disabled={!gate.canEdit || !isEditMode}>
									Paste
								</Button>
							</Group>
							<Group grow>
								<Button
									size="xs"
									variant="default"
									onClick={() => ViewerCommands.copySelectedLayerTransform()}
									disabled={!gate.canEdit || !isEditMode || !hasSelection}>
									Copy T
								</Button>
								<Button
									size="xs"
									variant="default"
									onClick={() => ViewerCommands.pasteLayerTransform()}
									disabled={!gate.canEdit || !isEditMode || !hasSelection}>
									Paste T
								</Button>
								<Button
									size="xs"
									color="red"
									variant="light"
									onClick={() => ViewerCommands.removeSelectedLayer()}
									disabled={!gate.canEdit || !isEditMode || !hasSelection}>
									Remove
								</Button>
							</Group>
							<Group grow>
								<input
									type="text"
									value={textLayerInput}
									onChange={(e) => setTextLayerInput(e.target.value)}
									disabled={!gate.canEdit || !isEditMode}
									placeholder="New text layer"
									style={{ width: "100%" }}
								/>
								<Button
									size="xs"
									variant="default"
									onClick={addTextLayer}
									disabled={!gate.canEdit || !isEditMode}>
									Add Text
								</Button>
							</Group>
							<Text size="xs" c="dimmed">
								Selected Layer: {editLayerState.layerType ?? "none"}
							</Text>
							{editLayerState.layerType === "text" && (
								<Group grow>
									<textarea
										value={textContentInput}
										onChange={(e) => setTextContentInput(e.target.value)}
										disabled={!canEditSelectedLayer}
										rows={3}
										style={{ width: "100%", fontSize: 11, resize: "vertical" }}
										placeholder="Text content"
									/>
									<Button
										size="xs"
										variant="default"
										onClick={applyTextContent}
										disabled={!canEditSelectedLayer}>
										Set Text
									</Button>
								</Group>
							)}
							<Group grow>
								<input
									type="text"
									value={layerNameInput}
									onChange={(e) => setLayerNameInput(e.target.value)}
									disabled={!canEditSelectedLayer}
									placeholder="Layer name"
									style={{ width: "100%" }}
								/>
								<Button
									size="xs"
									variant="default"
									onClick={applyLayerName}
									disabled={!canEditSelectedLayer}>
									Set Name
								</Button>
								<Switch
									size="xs"
									label="Visible"
									checked={editLayerState.visible !== false}
									onChange={() => ViewerCommands.toggleSelectedLayerVisible()}
									disabled={!canEditSelectedLayer}
								/>
								<Switch
									size="xs"
									label="Locked"
									checked={Boolean(editLayerState.locked)}
									onChange={() => ViewerCommands.toggleSelectedLayerLocked()}
									disabled={!canEditSelectedLayer}
								/>
								<Switch
									size="xs"
									label="Shared"
									checked={Boolean(editLayerState.shared)}
									onChange={() => ViewerCommands.toggleSelectedLayerShared()}
									disabled={!canEditSelectedLayer}
								/>
							</Group>
							<Text size="xs" c="dimmed">
								x:{fmt(editLayerState.x, 0)} y:{fmt(editLayerState.y, 0)} scale:
								{fmt(editLayerState.scale)}
							</Text>
							<Text size="xs" c="dimmed">
								rotation:{fmt(editLayerState.rotation, 0)} opacity:{fmt(editLayerState.opacity)}
							</Text>
							<Text size="xs" c="dimmed">
								mirrorH:
								{editLayerState.mirrorH == null ? "-" : editLayerState.mirrorH ? "on" : "off"}{" "}
								mirrorV:
								{editLayerState.mirrorV == null ? "-" : editLayerState.mirrorV ? "on" : "off"}{" "}
								isText:{editLayerState.isText == null ? "-" : editLayerState.isText ? "on" : "off"}
							</Text>
							<Group grow>
								<Switch
									size="xs"
									label="Image Text"
									checked={Boolean(editLayerState.isText)}
									onChange={() => ViewerCommands.toggleSelectedLayerIsText()}
									disabled={!canEditSelectedLayer || !isImageLayer}
								/>
								<Button
									size="xs"
									variant={spreadConfirmOpen ? "filled" : "default"}
									onClick={() => setSpreadConfirmOpen((open) => !open)}
									disabled={!canEditSelectedLayer}>
									Spread All
								</Button>
							</Group>
							{spreadConfirmOpen && (
								<Group grow>
									<Button
										size="xs"
										color="red"
										variant="light"
										onClick={confirmSpreadSelectedLayer}
										disabled={!canEditSelectedLayer}>
										Confirm Spread
									</Button>
									<Button
										size="xs"
										variant="default"
										onClick={() => setSpreadConfirmOpen(false)}>
										Cancel
									</Button>
								</Group>
							)}
							<Text size="xs" c="dimmed">
								clip t:{fmt(editLayerState.clipTop, 0)} r:{fmt(editLayerState.clipRight, 0)} b:
								{fmt(editLayerState.clipBottom, 0)} l:{fmt(editLayerState.clipLeft, 0)}
							</Text>
							<Group grow>
								<input
									type="number"
									min="0"
									value={clipTopInput}
									onChange={(e) => setClipTopInput(e.target.value)}
									onBlur={applyClip}
									onKeyDown={(e) => handleNumericKeyDown(e, (delta) => adjustClip("top", delta), 1, applyClip)}
									onWheel={(e) => handleNumericWheel(e, (delta) => adjustClip("top", delta), 1)}
									disabled={!canEditSelectedLayer || !isImageLayer}
									style={{ width: "100%" }}
								/>
								<input
									type="number"
									min="0"
									value={clipRightInput}
									onChange={(e) => setClipRightInput(e.target.value)}
									onBlur={applyClip}
									onKeyDown={(e) => handleNumericKeyDown(e, (delta) => adjustClip("right", delta), 1, applyClip)}
									onWheel={(e) => handleNumericWheel(e, (delta) => adjustClip("right", delta), 1)}
									disabled={!canEditSelectedLayer || !isImageLayer}
									style={{ width: "100%" }}
								/>
							</Group>
							<Group grow>
								<input
									type="number"
									min="0"
									value={clipBottomInput}
									onChange={(e) => setClipBottomInput(e.target.value)}
									onBlur={applyClip}
									onKeyDown={(e) => handleNumericKeyDown(e, (delta) => adjustClip("bottom", delta), 1, applyClip)}
									onWheel={(e) => handleNumericWheel(e, (delta) => adjustClip("bottom", delta), 1)}
									disabled={!canEditSelectedLayer || !isImageLayer}
									style={{ width: "100%" }}
								/>
								<input
									type="number"
									min="0"
									value={clipLeftInput}
									onChange={(e) => setClipLeftInput(e.target.value)}
									onBlur={applyClip}
									onKeyDown={(e) => handleNumericKeyDown(e, (delta) => adjustClip("left", delta), 1, applyClip)}
									onWheel={(e) => handleNumericWheel(e, (delta) => adjustClip("left", delta), 1)}
									disabled={!canEditSelectedLayer || !isImageLayer}
									style={{ width: "100%" }}
								/>
							</Group>
							<Group grow>
								<Button
									size="xs"
									variant="default"
									onClick={() => adjustClip("top", -5)}
									disabled={!canEditSelectedLayer || !isImageLayer}>
									T-
								</Button>
								<Button
									size="xs"
									variant="default"
									onClick={() => adjustClip("top", 5)}
									disabled={!canEditSelectedLayer || !isImageLayer}>
									T+
								</Button>
								<Button
									size="xs"
									variant="default"
									onClick={() => adjustClip("right", -5)}
									disabled={!canEditSelectedLayer || !isImageLayer}>
									R-
								</Button>
								<Button
									size="xs"
									variant="default"
									onClick={() => adjustClip("right", 5)}
									disabled={!canEditSelectedLayer || !isImageLayer}>
									R+
								</Button>
							</Group>
							<Group grow>
								<Button
									size="xs"
									variant="default"
									onClick={() => adjustClip("bottom", -5)}
									disabled={!canEditSelectedLayer || !isImageLayer}>
									B-
								</Button>
								<Button
									size="xs"
									variant="default"
									onClick={() => adjustClip("bottom", 5)}
									disabled={!canEditSelectedLayer || !isImageLayer}>
									B+
								</Button>
								<Button
									size="xs"
									variant="default"
									onClick={() => adjustClip("left", -5)}
									disabled={!canEditSelectedLayer || !isImageLayer}>
									L-
								</Button>
								<Button
									size="xs"
									variant="default"
									onClick={() => adjustClip("left", 5)}
									disabled={!canEditSelectedLayer || !isImageLayer}>
									L+
								</Button>
							</Group>
							<Group grow>
								<Button
									size="xs"
									variant="default"
									onClick={() => ViewerCommands.resetSelectedImageClip()}
									disabled={!canEditSelectedLayer || !isImageLayer}>
									Reset Clip
								</Button>
							</Group>
							<input
								ref={imageReplaceInputRef}
								type="file"
								accept="image/*"
								onChange={onImageReplaceSelected}
								style={{ display: "none" }}
							/>
							<Group grow>
								<Button
									size="xs"
									variant="default"
									onClick={openImageReplacePicker}
									disabled={!canEditSelectedLayer || !isImageLayer}>
									Replace Img
								</Button>
								<Button
									size="xs"
									variant="default"
									onClick={() => ViewerCommands.downloadSelectedImage()}
									disabled={!canEditSelectedLayer || !isImageLayer}>
									Download Img
								</Button>
								<Switch
									size="xs"
									label="forALL"
									checked={replaceImageForAll}
									onChange={(e) => setReplaceImageForAll(e.currentTarget.checked)}
									disabled={!canEditSelectedLayer || !isImageLayer}
								/>
							</Group>
							<Text size="xs" c="dimmed">
								Layer List (Edit)
							</Text>
							<ScrollArea h={120} type="auto">
								<Stack gap={4}>
									{sortedEditLayers.length === 0 ? (
										<Text size="xs" c="dimmed">
											No layers
										</Text>
									) : (
										sortedEditLayers.map((layer, position) => {
											const layerKey = getLayerKey(layer);
											return (
												<div
													key={layerKey}
													ref={(el) => {
														if (el) layerRowRefs.current.set(layerKey, el);
														else layerRowRefs.current.delete(layerKey);
													}}
													tabIndex={gate.canEdit && isEditMode ? 0 : -1}
													onClick={() => ViewerCommands.selectEditLayerByIndex(layer.index)}
													onKeyDown={(e) => handleLayerKeyDown(layer, position, e)}
													onDoubleClick={() => startLayerRename(layer)}
													draggable={gate.canEdit && isEditMode && sortedEditLayers.length > 1}
													onDragStart={(e) => handleLayerDragStart(position, e)}
													onDragOver={(e) => handleLayerDragOver(position, e)}
													onDrop={(e) => handleLayerDrop(position, e)}
													onDragEnd={handleLayerDragEnd}
													style={{
														cursor: gate.canEdit && isEditMode ? "grab" : "default",
														opacity: draggingLayerPosition === position ? 0.35 : 1,
														padding: "2px 4px",
														borderRadius: 4,
														outline: layerDropPosition === position ? "1px solid #228be6" : layer.selected ? "1px solid #339af0" : "1px solid transparent",
														outlineOffset: 1,
													}}
													aria-grabbed={draggingLayerPosition === position ? "true" : undefined}
													data-react-controlled="true">
													{renamingLayerId === layer.id ? (
														<input
															type="text"
															value={renameLayerInput}
															autoFocus
															onChange={(e) => setRenameLayerInput(e.currentTarget.value)}
															onBlur={commitLayerRename}
															onKeyDown={(e) => {
																e.stopPropagation();
																if (e.key === "Enter") e.currentTarget.blur();
																if (e.key === "Escape") {
																	renameCanceledRef.current = true;
																	setRenamingLayerId(null);
																	focusLayerAfterRender(layerKey);
																}
															}}
															onClick={(e) => e.stopPropagation()}
															style={{ width: "100%", fontSize: 11 }}
														/>
													) : (
														<Text size="xs" fw={layer.selected ? 700 : 400}>
															{layer.selected ? "● " : "○ "}L{layer.index + 1} {layer.name || layer.type}{" "}
															({layer.type}) {layer.visible ? "" : "(hidden)"}{" "}
															{layer.locked ? "(locked)" : ""} {layer.shared ? "(shared)" : ""}
														</Text>
													)}
												</div>
											);
										})
									)}
								</Stack>
							</ScrollArea>
							<Group grow>
								<input
									type="number"
									value={posXInput}
									onChange={(e) => setPosXInput(e.target.value)}
									onBlur={applyPosition}
									onKeyDown={(e) => handleNumericKeyDown(e, adjustPositionX, 1, applyPosition)}
									onWheel={(e) => handleNumericWheel(e, adjustPositionX, 1)}
									disabled={!canEditSelectedLayer}
									style={{ width: "100%" }}
								/>
								<input
									type="number"
									value={posYInput}
									onChange={(e) => setPosYInput(e.target.value)}
									onBlur={applyPosition}
									onKeyDown={(e) => handleNumericKeyDown(e, adjustPositionY, 1, applyPosition)}
									onWheel={(e) => handleNumericWheel(e, adjustPositionY, 1)}
									disabled={!canEditSelectedLayer}
									style={{ width: "100%" }}
								/>
								<Button
									size="xs"
									variant="default"
									onClick={applyPosition}
									disabled={!canEditSelectedLayer}>
									Set XY
								</Button>
							</Group>
							<Group grow>
								<input
									type="number"
									step="0.01"
									value={scaleInput}
									onChange={(e) => setScaleInput(e.target.value)}
									onBlur={applyScale}
									onKeyDown={(e) => handleNumericKeyDown(e, adjustScale, 0.05, applyScale)}
									onWheel={(e) => handleNumericWheel(e, adjustScale, 0.05)}
									disabled={!canEditSelectedLayer}
									style={{ width: "100%" }}
								/>
								<Button
									size="xs"
									variant="default"
									onClick={applyScale}
									disabled={!canEditSelectedLayer}>
									Set Scale
								</Button>
								<input
									type="number"
									step="1"
									value={rotationInput}
									onChange={(e) => setRotationInput(e.target.value)}
									onBlur={applyRotation}
									onKeyDown={(e) => handleNumericKeyDown(e, adjustRotation, 1, applyRotation)}
									onWheel={(e) => handleNumericWheel(e, adjustRotation, 1)}
									disabled={!canEditSelectedLayer}
									style={{ width: "100%" }}
								/>
								<Button
									size="xs"
									variant="default"
									onClick={applyRotation}
									disabled={!canEditSelectedLayer}>
									Set Rot
								</Button>
							</Group>
							<Group grow>
								<input
									type="number"
									step="0.01"
									min="0"
									max="1"
									value={opacityInput}
									onChange={(e) => setOpacityInput(e.target.value)}
									onBlur={applyOpacity}
									onKeyDown={(e) => handleNumericKeyDown(e, adjustOpacity, 0.05, applyOpacity)}
									onWheel={(e) => handleNumericWheel(e, adjustOpacity, 0.05)}
									disabled={!canEditSelectedLayer}
									style={{ width: "100%" }}
								/>
								<Button
									size="xs"
									variant="default"
									onClick={applyOpacity}
									disabled={!canEditSelectedLayer}>
									Set Op
								</Button>
							</Group>
							<Group grow>
								<Button
									size="xs"
									variant="default"
									onClick={() => ViewerCommands.nudgeSelectedLayerLeft()}
									disabled={!gate.canEdit || !isEditMode || !hasSelection}>
									X-
								</Button>
								<Button
									size="xs"
									variant="default"
									onClick={() => ViewerCommands.nudgeSelectedLayerRight()}
									disabled={!gate.canEdit || !isEditMode || !hasSelection}>
									X+
								</Button>
								<Button
									size="xs"
									variant="default"
									onClick={() => ViewerCommands.nudgeSelectedLayerUp()}
									disabled={!gate.canEdit || !isEditMode || !hasSelection}>
									Y-
								</Button>
								<Button
									size="xs"
									variant="default"
									onClick={() => ViewerCommands.nudgeSelectedLayerDown()}
									disabled={!gate.canEdit || !isEditMode || !hasSelection}>
									Y+
								</Button>
							</Group>
							<Group grow>
								<Button
									size="xs"
									variant="default"
									onClick={() => ViewerCommands.scaleSelectedLayerDown()}
									disabled={!gate.canEdit || !isEditMode || !hasSelection}>
									Scale-
								</Button>
								<Button
									size="xs"
									variant="default"
									onClick={() => ViewerCommands.scaleSelectedLayerUp()}
									disabled={!gate.canEdit || !isEditMode || !hasSelection}>
									Scale+
								</Button>
								<Button
									size="xs"
									variant="default"
									onClick={() => ViewerCommands.adjustSelectedLayerRotationLeft()}
									disabled={!gate.canEdit || !isEditMode || !hasSelection}>
									Rot-
								</Button>
								<Button
									size="xs"
									variant="default"
									onClick={() => ViewerCommands.adjustSelectedLayerRotationRight()}
									disabled={!gate.canEdit || !isEditMode || !hasSelection}>
									Rot+
								</Button>
							</Group>
							<Group grow>
								<Button
									size="xs"
									variant="default"
									onClick={() => ViewerCommands.decreaseSelectedLayerOpacity()}
									disabled={!gate.canEdit || !isEditMode || !hasSelection}>
									Op-
								</Button>
								<Button
									size="xs"
									variant="default"
									onClick={() => ViewerCommands.increaseSelectedLayerOpacity()}
									disabled={!gate.canEdit || !isEditMode || !hasSelection}>
									Op+
								</Button>
								<Button
									size="xs"
									variant="default"
									onClick={() => ViewerCommands.resetSelectedLayerRotation()}
									disabled={!gate.canEdit || !isEditMode || !hasSelection}>
									Rot 0
								</Button>
								<Button
									size="xs"
									variant="default"
									onClick={() => ViewerCommands.resetSelectedLayerOpacity()}
									disabled={!gate.canEdit || !isEditMode || !hasSelection}>
									Op 1
								</Button>
							</Group>
							<ScrollArea h={120} type="auto">
								<Stack gap={4}>
									{slides.length === 0 ? (
										<Text size="xs" c="dimmed">
											No slides
										</Text>
									) : (
										slides.map((slide) => (
											<Text
												key={slide.key}
												size="xs"
												fw={slide.selected ? 700 : 400}
												style={{
													cursor: gate.canEdit && slides.length > 1 ? "grab" : "pointer",
													opacity: draggingSlideIndex === slide.index ? 0.35 : slide.disabled ? 0.45 : 1,
													outline: slideDropIndex === slide.index ? "1px solid #228be6" : undefined,
													outlineOffset: 1,
													borderRadius: 3,
												}}
												role="button"
												aria-current={slide.selected ? "true" : undefined}
												aria-disabled={slide.disabled ? "true" : undefined}
												aria-grabbed={draggingSlideIndex === slide.index ? "true" : undefined}
												draggable={gate.canEdit && slides.length > 1}
												tabIndex={0}
												ref={(node) => {
													if (node) {
														slideRowRefs.current.set(slide.key, node);
													} else {
														slideRowRefs.current.delete(slide.key);
													}
												}}
												onKeyDown={(e) => handleSlideKeyDown(slide, e)}
												onDragStart={(e) => handleSlideDragStart(slide, e)}
												onDragOver={(e) => handleSlideDragOver(slide, e)}
												onDrop={(e) => handleSlideDrop(slide, e)}
												onDragEnd={handleSlideDragEnd}
												onContextMenu={(e) => handleSlideContextMenu(slide, e)}
												onClick={() => selectSlide(slide.index)}>
												{slide.selected ? "● " : "○ "}
												{slide.label}{slide.joining ? " [J]" : ""}{slide.disabled ? " ✕" : ""}{slide.durationRatio !== 1 ? ` ×${slide.durationRatio}` : ""}
											</Text>
										))
									)}
								</Stack>
							</ScrollArea>
						</Stack>
					</ScrollArea>
				)}
			</Paper>

			<Paper
				shadow="md"
				p={0}
				radius="md"
				withBorder
				style={{
					position: "fixed",
					width: 320,
					right: 12,
					bottom: 12,
					zIndex: 2147483646,
					background: "rgba(255, 255, 255, 0.92)",
					backdropFilter: "blur(2px)",
				}}>
				<div
					style={{
						padding: "6px 8px",
						userSelect: "none",
						borderBottom: fileCollapsed ? "none" : "1px solid #dee2e6",
					}}>
					<Group justify="space-between" align="center" wrap="nowrap">
						<Group gap={6} align="center" wrap="nowrap">
							<Text fw={700} size="sm">
								File IO
							</Text>
							<Badge size="xs" color={gate.canImport ? "cyan" : "gray"}>
								import:{gate.canImport ? "on" : "off"}
							</Badge>
						</Group>
						<Button
							size="xs"
							variant="subtle"
							p={2}
							style={{ minWidth: 24, lineHeight: 1 }}
							onClick={() => setFileCollapsed((c) => !c)}>
							{fileCollapsed ? "▼" : "▲"}
						</Button>
					</Group>
				</div>

				{!fileCollapsed && (
					<ScrollArea h="42vh" type="auto">
						<Stack gap={8} p="sm">
							<Text size="xs" c="dimmed">
								File Ops (React control)
							</Text>
							<Group grow>
								<NativeSelect
									size="xs"
									value={saveFormat}
									onChange={(e) => changeSaveFormat(e.currentTarget.value as "png" | "hvz" | "hvd")}
									data={[
										{ value: "png", label: "Save: .png" },
										{ value: "hvz", label: "Save: .hvz" },
										{ value: "hvd", label: "Save: .hvd" },
									]}
								/>
								<Switch
									size="xs"
									label="Images"
									checked={effectiveImagesPanelOpen}
									disabled={!canUseImagesPanel}
									onChange={(e) => {
										if (!canUseImagesPanel) return;
										setImagesPanelOpen(e.currentTarget.checked);
									}}
								/>
							</Group>
							{effectiveImagesPanelOpen && (
								<Text size="xs" c="dimmed">
									Images panel opened near File IO.
								</Text>
							)}
							<Group grow>
								<Button
									size="xs"
									variant="light"
									onClick={requestNewDocument}
									disabled={!gate.canEdit}>
									New Doc
								</Button>
								<Button
									size="xs"
									variant="light"
									onClick={() => ViewerCommands.openImportDialog()}
									disabled={!gate.canImport}>
									Import
								</Button>
								<Button
									size="xs"
									variant="light"
									onClick={() => ViewerCommands.exportDocument()}
									disabled={!gate.canExport}>
									Export
								</Button>
							</Group>
							{newDocumentConfirmOpen && (
								<Group grow>
									<Button size="xs" color="red" variant="light" onClick={confirmNewDocument}>
										Clear Doc
									</Button>
									<Button
										size="xs"
										variant="default"
										onClick={() => setNewDocumentConfirmOpen(false)}>
										Cancel
									</Button>
								</Group>
							)}
							<Group grow>
								<Button
									size="xs"
									variant="light"
									onClick={() => ViewerCommands.exportImages()}
									disabled={!gate.canExport}>
									Export Img
								</Button>
							</Group>
							<Text size="xs" c="dimmed">
								SlideShow Settings
							</Text>
							<Group grow>
								<NativeSelect
									data={durationOptions}
									value={String(slideShowSettings.duration)}
									onChange={(e) =>
										ViewerCommands.setSlideShowDuration(Number(e.currentTarget.value))
									}
									size="xs"
								/>
								<NativeSelect
									data={intervalOptions}
									value={String(slideShowSettings.interval)}
									onChange={(e) =>
										ViewerCommands.setSlideShowInterval(Number(e.currentTarget.value))
									}
									size="xs"
								/>
							</Group>
							<Group grow>
								<input
									type="color"
									value={slideShowSettings.bgColor}
									onChange={(e) => ViewerCommands.setBackgroundColor(e.target.value)}
									disabled={!gate.canEdit}
								/>
								<Switch
									size="xs"
									label="Fullscreen"
									checked={slideShowSettings.fullscreen}
									onChange={(e) => ViewerCommands.setFullscreen(e.currentTarget.checked)}
								/>
								<Switch
									size="xs"
									label="Mirror H"
									checked={slideShowSettings.mirrorH}
									onChange={(e) => ViewerCommands.setMirrorH(e.currentTarget.checked)}
								/>
								<Switch
									size="xs"
									label="Mirror V"
									checked={slideShowSettings.mirrorV}
									onChange={(e) => ViewerCommands.setMirrorV(e.currentTarget.checked)}
								/>
							</Group>
							<Group grow>
								<Button
									size="xs"
									variant="default"
									onClick={selectPreviousSavedFileAndLoad}
									disabled={savedFiles.length === 0}>
									Slot Prev
								</Button>
								<Button
									size="xs"
									variant="default"
									onClick={selectNextSavedFileAndLoad}
									disabled={savedFiles.length === 0}>
									Slot Next
								</Button>
							</Group>
							<Group grow>
								<Button
									size="xs"
									variant="light"
									onClick={() => ViewerCommands.saveDocument()}
									disabled={!gate.canSave}>
									Save
								</Button>
								<Button
									size="xs"
									variant="light"
									onClick={() => ViewerCommands.loadSelectedSavedFile()}
									disabled={!selectedFileId}>
									Load
								</Button>
								<Button
									size="xs"
									color="red"
									variant="light"
									onClick={() => ViewerCommands.deleteSelectedSavedFile()}
									disabled={!gate.canDeleteSavedData || !selectedFileId || selectedFileId === "-1"}>
									Delete
								</Button>
							</Group>
							<Button size="xs" variant="default" onClick={() => ViewerCommands.startSlideshow()}>
								Start SlideShow
							</Button>
							<ScrollArea h={84} type="auto">
								<Stack gap={4}>
									{savedFiles.length === 0 ? (
										<Text size="xs" c="dimmed">
											No save slots
										</Text>
									) : (
										savedFiles.map((file) => (
											<Text
												key={file.value + file.label}
												size="xs"
												fw={selectedFileId === file.value ? 700 : 400}
												style={{ cursor: "pointer" }}
												onClick={() => selectSavedFile(file.value)}>
												{selectedFileId === file.value ? "● " : "○ "}
												{file.label}
											</Text>
										))
									)}
								</Stack>
							</ScrollArea>
						</Stack>
					</ScrollArea>
				)}
			</Paper>
		</>
	);
}
