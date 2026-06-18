import { Badge, Button, ColorInput, FileButton, Group, NativeSelect, Paper, Progress, ScrollArea, Stack, Switch, Text, Textarea, TextInput } from "@mantine/core";
import React, { useEffect, useMemo, useRef, useState } from "react";
import { ViewerCommands } from "../bridge/ViewerCommands";
import {
	useViewerEditCanvasState,
	useViewerEditLayers,
	useViewerEditSelection,
	useViewerEditValues,
	useViewerHistory,
	useViewerImageDeleteRequest,
	useViewerImages,
	useViewerImportDialogRequest,
	useViewerImportFileDialogRequest,
	useViewerMode,
	useViewerModified,
	useViewerNewDocumentRequest,
	useViewerNotice,
	useViewerSaveChoiceRequest,
	useViewerSavedFileSelection,
	useViewerSharedLayerRemovalRequest,
	useViewerSlideshowPlayback,
	useViewerSlideshowSettings,
	useViewerSlideSnapshots,
	useViewerSpreadLayerRequest,
	useViewerStorage,
	useViewerStorageProgress,
	useViewerTextLayerInputRequest,
} from "../bridge/useViewerBridge";
import { useLayer } from "../hooks/useLayer";
import { useSlide } from "../hooks/useSlide";
import { FeatureGate } from "../runtime/featureGate";
import { AppRuntimeMode } from "../runtime/mode";
import { getSaveFormat, setSaveFormat } from "../runtime/reactDomRegistry";
import type { ImageDeleteRequest } from "./imageDeleteRequest";
import { getImageDeleteRequestState } from "./imageDeleteRequest";
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
import { canRequestSaveChoice, getSaveChoiceOpenState } from "./saveDocumentChoice";
import type { SharedLayerRemovalRequest } from "./sharedLayerRemovalRequest";
import { getSharedLayerRemovalRequestState } from "./sharedLayerRemovalRequest";
import { getSlideListDropAction, getSlideListKeyboardAction } from "./slideListKeyboard";
import type { SpreadLayerRequest } from "./spreadLayerRequest";
import { getSpreadLayerRequestState } from "./spreadLayerRequest";
import { getTextLayerInputRequestState } from "./textLayerInputRequest";

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

type RuntimeNoticePayload = {
	id: number;
	message: string;
	variant: "error" | "info";
} | null;

function RuntimeProgress({ percentage }: { percentage: number }) {
	if (percentage <= 0 || percentage >= 1) return null;
	return (
		<Progress
			aria-label="Storage progress"
			value={Math.round(percentage * 100)}
			color="blue"
			size="xs"
			style={{
				position: "fixed",
				top: 0,
				left: 0,
				width: "100vw",
				zIndex: 2147483647,
			}}
		/>
	);
}

function RuntimeNotice({ notice }: { notice: RuntimeNoticePayload }) {
	const [activeNotice, setActiveNotice] = useState<RuntimeNoticePayload>(null);

	useEffect(() => {
		if (!notice) return;
		setActiveNotice(notice);
		const hideTimer = window.setTimeout(() => {
			setActiveNotice(null);
		}, 2600);
		return () => window.clearTimeout(hideTimer);
	}, [notice?.id]);

	if (!activeNotice) return null;

	return (
		<Paper
			role="status"
			aria-live="polite"
			shadow="md"
			p="sm"
			radius="sm"
			style={{
				position: "fixed",
				left: 16,
				bottom: 16,
				zIndex: 2147483647,
				maxWidth: "min(78vw, 560px)",
				color: "#fff",
				background: activeNotice.variant === "error" ? "rgba(163, 35, 45, 0.96)" : "rgba(24, 78, 125, 0.96)",
				pointerEvents: "none",
			}}>
			<Text size="sm" c="inherit" lh={1.4}>
				{activeNotice.message}
			</Text>
		</Paper>
	);
}

export function RuntimeShell({ mode, gate }: RuntimeShellProps) {
	const { slides: rawSlides, selectedIndex, revision } = useViewerSlideSnapshots();
	const { titles } = useViewerStorage();
	const { selectedId: bridgedSelectedFileId } = useViewerSavedFileSelection();
	const slideShowSettings = useViewerSlideshowSettings();
	const slideShowPlayback = useViewerSlideshowPlayback();
	const requestedImageDelete = useViewerImageDeleteRequest();
	const { images } = useViewerImages();
	const requestedImportDialog = useViewerImportDialogRequest();
	const requestedImportFileDialog = useViewerImportFileDialogRequest();
	const requestedNewDocument = useViewerNewDocumentRequest();
	const requestedSaveChoice = useViewerSaveChoiceRequest();
	const requestedNotice = useViewerNotice();
	const requestedSharedLayerRemoval = useViewerSharedLayerRemovalRequest();
	const requestedSpreadLayer = useViewerSpreadLayerRequest();
	const requestedTextLayerInput = useViewerTextLayerInputRequest();
	const storageProgress = useViewerStorageProgress();
	const history = useViewerHistory();
	const { modified } = useViewerModified();
	const { mode: viewerMode } = useViewerMode();
	const editCanvasState = useViewerEditCanvasState();
	const { hasSelection, canPasteLayer, canPasteLayerTransform } = useViewerEditSelection();
	const { layers: editLayers } = useViewerEditLayers();
	const editLayerState = useViewerEditValues();
	const { actions: layerActions } = useLayer();
	const { actions: slideActions } = useSlide();

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
	const [imageDeleteRequest, setImageDeleteRequest] = useState<ImageDeleteRequest>(null);
	const [sharedLayerRemovalRequest, setSharedLayerRemovalRequest] =
		useState<SharedLayerRemovalRequest>(null);
	const [spreadLayerRequest, setSpreadLayerRequest] = useState<SpreadLayerRequest>(null);
	const [newDocumentConfirmOpen, setNewDocumentConfirmOpen] = useState(false);
	const [importConfirmOpen, setImportConfirmOpen] = useState(false);
	const [saveChoiceOpen, setSaveChoiceOpen] = useState(false);
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
	const canUseSaveChoice = canRequestSaveChoice(gate.canSave, rawSlides.length);
	const effectiveSaveChoiceOpen = getSaveChoiceOpenState(
		saveChoiceOpen,
		gate.canSave,
		rawSlides.length
	);
	const isEditMode = viewerMode === "edit";
	const openImportPickerRef = useRef<(() => void) | null>(null);
	const resetImportPickerRef = useRef<(() => void) | null>(null);
	const resetImageReplacePickerRef = useRef<(() => void) | null>(null);
	const textLayerInputRef = useRef<HTMLInputElement | null>(null);
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
		if (canUseImagesPanel) return;
		setImagesPanelOpen(false);
	}, [canUseImagesPanel]);

	useEffect(() => {
		if (!requestedImageDelete?.imageId || !canUseImagesPanel) return;
		setImagesPanelOpen(true);
	}, [requestedImageDelete, canUseImagesPanel]);

	useEffect(() => {
		setImageDeleteRequest(
			getImageDeleteRequestState(requestedImageDelete, gate.canEdit, effectiveImagesPanelOpen)
		);
	}, [requestedImageDelete, gate.canEdit, effectiveImagesPanelOpen]);

	useEffect(() => {
		setSharedLayerRemovalRequest(
			getSharedLayerRemovalRequestState(requestedSharedLayerRemoval, gate.canEdit, hasSelection)
		);
	}, [requestedSharedLayerRemoval, gate.canEdit, hasSelection]);

	useEffect(() => {
		setSpreadLayerRequest(
			getSpreadLayerRequestState(requestedSpreadLayer, gate.canEdit, hasSelection)
		);
	}, [requestedSpreadLayer, gate.canEdit, hasSelection]);

	useEffect(() => {
		if (!spreadLayerRequest) return;
		setSpreadConfirmOpen(true);
	}, [spreadLayerRequest]);

	useEffect(() => {
		if (!requestedNewDocument?.open || !gate.canEdit || !modified) return;
		setNewDocumentConfirmOpen(true);
	}, [requestedNewDocument, gate.canEdit, modified]);

	useEffect(() => {
		if (!requestedImportDialog?.open || !gate.canImport || !modified) return;
		setImportConfirmOpen(true);
	}, [requestedImportDialog, gate.canImport, modified]);

	useEffect(() => {
		if (!requestedImportFileDialog?.open || !gate.canImport) return;
		resetImportPickerRef.current?.();
		openImportPickerRef.current?.();
	}, [requestedImportFileDialog, gate.canImport]);

	useEffect(() => {
		if (!requestedSaveChoice?.open || !canUseSaveChoice) return;
		setSaveChoiceOpen(true);
	}, [requestedSaveChoice, canUseSaveChoice]);

	useEffect(() => {
		const request = getTextLayerInputRequestState(requestedTextLayerInput, gate.canEdit, isEditMode);
		if (!request) return;
		setTextLayerInput("");
		textLayerInputRef.current?.focus();
	}, [requestedTextLayerInput, gate.canEdit, isEditMode]);

	useEffect(() => {
		if (gate.canEdit && modified) return;
		setNewDocumentConfirmOpen(false);
	}, [gate.canEdit, modified]);

	useEffect(() => {
		if (gate.canImport && modified) return;
		setImportConfirmOpen(false);
	}, [gate.canImport, modified]);

	useEffect(() => {
		if (canUseSaveChoice) return;
		setSaveChoiceOpen(false);
	}, [canUseSaveChoice]);

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
		[rawSlides, selectedIndex, revision]
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
		slideActions.selectByIndex(index);
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

	const handleSlideDragStart = (slide: SlideSnapshot, event: React.DragEvent<HTMLDivElement>) => {
		if (!gate.canEdit || slides.length < 2) return;
		setDraggingSlideIndex(slide.index);
		setSlideDropIndex(slide.index);
		event.dataTransfer.effectAllowed = "move";
		event.dataTransfer.setData("text/plain", String(slide.index));
	};

	const hasDroppedImage = (event: React.DragEvent<HTMLElement>) => {
		return Array.from(event.dataTransfer.types).includes("imageId");
	};

	const handleSlideDragOver = (slide: SlideSnapshot, event: React.DragEvent<HTMLDivElement>) => {
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

	const handleSlideDrop = (slide: SlideSnapshot, event: React.DragEvent<HTMLDivElement>) => {
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

	const requestImportDialog = () => {
		if (!gate.canImport) return;
		if (modified) {
			setImportConfirmOpen(true);
			return;
		}
		ViewerCommands.openImportDialog();
	};

	const confirmImportDialog = () => {
		setImportConfirmOpen(false);
		ViewerCommands.openImportDialog(true);
	};

	const importSelectedFile = (file: File | null) => {
		if (!file) return;
		ViewerCommands.importFile(file);
		resetImportPickerRef.current?.();
	};

	const requestSaveDocument = () => {
		if (!canUseSaveChoice) return;
		setSaveChoiceOpen(true);
	};

	const saveDocumentWithChoice = (override: boolean) => {
		setSaveChoiceOpen(false);
		ViewerCommands.saveDocument(override);
	};

	const confirmImageDelete = () => {
		const imageId = imageDeleteRequest?.imageId;
		setImageDeleteRequest(null);
		if (!imageId) return;
		layerActions.deleteImageById(imageId, true);
	};

	const requestImageDelete = (image: (typeof images)[number]) => {
		if (!canUseImagesPanel) return;
		setImageDeleteRequest({ imageId: image.id, name: image.name || image.id });
	};

	const dragImage = (imageId: string, event: React.DragEvent<HTMLImageElement>) => {
		event.dataTransfer.setData("imageId", imageId);
	};

	const confirmSharedLayerRemoval = () => {
		setSharedLayerRemovalRequest(null);
		layerActions.remove(true);
	};

	const applyPosition = () => {
		if (!canEditSelectedLayer) return;
		const x = Number(posXInput);
		const y = Number(posYInput);
		if (!isFinite(x) || !isFinite(y)) return;
		layerActions.setPosition(x, y);
	};

	const adjustPositionX = (delta: number) => {
		if (!canEditSelectedLayer) return;
		const nextX = getAdjustedNumericValue(posXInput, editLayerState.x ?? 0, delta);
		const y = Number(posYInput);
		const nextY = Number.isFinite(y) ? y : editLayerState.y ?? 0;
		setPosXInput(String(nextX));
		layerActions.setPosition(nextX, nextY);
	};

	const adjustPositionY = (delta: number) => {
		if (!canEditSelectedLayer) return;
		const nextY = getAdjustedNumericValue(posYInput, editLayerState.y ?? 0, delta);
		const x = Number(posXInput);
		const nextX = Number.isFinite(x) ? x : editLayerState.x ?? 0;
		setPosYInput(String(nextY));
		layerActions.setPosition(nextX, nextY);
	};

	const applyScale = () => {
		if (!canEditSelectedLayer) return;
		const scale = Number(scaleInput);
		if (!isFinite(scale) || scale <= 0) return;
		layerActions.setScale(scale);
	};

	const adjustScale = (delta: number) => {
		if (!canEditSelectedLayer) return;
		const scale = getAdjustedNumericValue(scaleInput, editLayerState.scale ?? 1, delta, { min: 0.01 });
		setScaleInput(String(scale));
		layerActions.setScale(scale);
	};

	const applyRotation = () => {
		if (!canEditSelectedLayer) return;
		const rotation = Number(rotationInput);
		if (!isFinite(rotation)) return;
		layerActions.setRotation(rotation);
	};

	const adjustRotation = (delta: number) => {
		if (!canEditSelectedLayer) return;
		const rotation = getAdjustedNumericValue(rotationInput, editLayerState.rotation ?? 0, delta);
		setRotationInput(String(rotation));
		layerActions.setRotation(rotation);
	};

	const applyOpacity = () => {
		if (!canEditSelectedLayer) return;
		const opacity = Number(opacityInput);
		if (!isFinite(opacity)) return;
		layerActions.setOpacity(opacity);
	};

	const adjustOpacity = (delta: number) => {
		if (!canEditSelectedLayer) return;
		const opacity = getAdjustedNumericValue(opacityInput, editLayerState.opacity ?? 1, delta, { min: 0, max: 1 });
		setOpacityInput(String(opacity));
		layerActions.setOpacity(opacity);
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
		layerActions.setImageClip(next.top, next.right, next.bottom, next.left);
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
		layerActions.setImageClip(next.top, next.right, next.bottom, next.left);
	};

	const addTextLayer = () => {
		if (!gate.canEdit || !isEditMode) return;
		const text = textLayerInput.trim();
		if (!text) return;
		layerActions.addTextLayer(text);
		setTextLayerInput("");
	};

	const confirmSpreadSelectedLayer = () => {
		if (!canEditSelectedLayer) return;
		setSpreadConfirmOpen(false);
		setSpreadLayerRequest(null);
		layerActions.spread(true);
	};

	const applyLayerName = () => {
		if (!canEditSelectedLayer) return;
		const name = layerNameInput.trim();
		if (!name) return;
		layerActions.setName(name);
	};

	const startLayerRename = (layer: (typeof sortedEditLayers)[number]) => {
		if (!gate.canEdit || !isEditMode) return;
		renameCanceledRef.current = false;
		layerActions.selectByIndex(layer.index);
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
			layerActions.selectByIndex(layer.index);
			layerActions.setName(renameLayerInput);
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
				layerActions.selectByIndex(nextLayer.index);
				break;
			}
			case "rename":
				startLayerRename(layer);
				break;
			case "move":
				focusLayerAfterRender(getLayerKey(layer));
				layerActions.selectByIndex(layer.index);
				if (action.direction < 0) {
					layerActions.moveUp();
				} else {
					layerActions.moveDown();
				}
				break;
			case "delete": {
				const nextLayer =
					sortedEditLayers[action.position + 1] ?? sortedEditLayers[action.position - 1];
				focusLayerAfterRender(nextLayer ? getLayerKey(nextLayer) : undefined);
				layerActions.selectByIndex(layer.index);
				layerActions.remove();
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
		layerActions.selectByIndex(fromLayer.index);
		layerActions.moveToIndex(toLayer.index);
	};

	const handleLayerDragEnd = () => {
		setDraggingLayerPosition(null);
		setLayerDropPosition(null);
	};

	const applyTextContent = () => {
		if (!canEditSelectedLayer || editLayerState.layerType !== "text") return;
		layerActions.setText(textContentInput);
	};

	const replaceSelectedImage = (file: File | null) => {
		if (file) {
			void layerActions.replaceImage(file, replaceImageForAll);
		}
		resetImageReplacePickerRef.current?.();
	};

	const applyCanvasZoom = () => {
		if (!gate.canEdit || !isEditMode) return;
		const zoomPercent = Number(zoomInput);
		if (!isFinite(zoomPercent) || zoomPercent <= 0) return;
		layerActions.setCanvasScale(zoomPercent / 100);
	};

	const adjustCanvasZoom = (delta: number) => {
		if (!gate.canEdit || !isEditMode) return;
		const nextZoom = getAdjustedNumericValue(zoomInput, (editCanvasState.scale || 1) * 100, delta, {
			min: 10,
			max: 2000,
		});
		setZoomInput(String(nextZoom));
		layerActions.setCanvasScale(nextZoom / 100);
	};

	const adjustDurationRatio = (delta: number) => {
		if (!gate.canEdit || !selectedRawSlide) return;
		const nextRatio = getAdjustedNumericValue(durationRatioInput, selectedRawSlide.durationRatio, delta, {
			min: SLIDE_DURATION_RATIO_MIN,
			max: SLIDE_DURATION_RATIO_MAX,
		});
		setDurationRatioInput(String(nextRatio));
		slideActions.setSelectedDurationRatio(nextRatio);
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
		slideActions.setSelectedDurationRatio(nextRatio);
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
	const isImageLayer = editLayerState.layerType === "image";
	const canEditSelectedLayer = gate.canEdit && isEditMode && hasSelection;
	useEffect(() => {
		if (canEditSelectedLayer) return;
		setSpreadConfirmOpen(false);
		setSpreadLayerRequest(null);
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

	if (viewerMode === "slideshow") {
		return (
			<>
				<RuntimeProgress percentage={storageProgress.percentage} />
				<RuntimeNotice notice={requestedNotice} />
				<Paper
					shadow="md"
					p="xs"
					radius="md"
					withBorder
					style={{
						position: "fixed",
						top: 12,
						left: "50%",
						transform: "translateX(-50%)",
						zIndex: 2147483647,
						background: "rgba(255, 255, 255, 0.9)",
						backdropFilter: "blur(2px)",
					}}>
					<Group gap={6} wrap="nowrap">
						<Button size="xs" color="red" variant="light" onClick={() => ViewerCommands.stopSlideshow()}>
							Exit
						</Button>
						<Button size="xs" variant="default" onClick={() => ViewerCommands.showPreviousSlide()}>
							Back
						</Button>
						<Button size="xs" variant="default" onClick={() => ViewerCommands.toggleSlideshowPause()}>
							{slideShowPlayback.isPause ? "Play" : "Pause"}
						</Button>
						<Button size="xs" variant="default" onClick={() => ViewerCommands.showNextSlide()}>
							Next
						</Button>
						<Switch
							size="xs"
							label="Full"
							checked={slideShowSettings.fullscreen}
							onChange={(e) => ViewerCommands.setFullscreen(e.currentTarget.checked)}
						/>
						<Switch
							size="xs"
							label="H"
							checked={slideShowSettings.mirrorH}
							onChange={(e) => ViewerCommands.setMirrorH(e.currentTarget.checked)}
						/>
						<Switch
							size="xs"
							label="V"
							checked={slideShowSettings.mirrorV}
							onChange={(e) => ViewerCommands.setMirrorV(e.currentTarget.checked)}
						/>
					</Group>
				</Paper>
			</>
		);
	}

	return (
		<>
			<RuntimeProgress percentage={storageProgress.percentage} />
			<RuntimeNotice notice={requestedNotice} />
			<FileButton
				accept=".png,.hvd,.hvz"
				onChange={importSelectedFile}
				resetRef={resetImportPickerRef}>
				{({ onClick }) => {
					openImportPickerRef.current = onClick;
					return null;
				}}
			</FileButton>
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
									onClick={() => slideActions.enterSelectMode()}>
									Select
								</Button>
								<Button
									size="xs"
									variant={viewerMode === "edit" ? "filled" : "default"}
									onClick={() => slideActions.enterEditMode()}
									disabled={!gate.canEdit || !selectedSlide}>
									Edit
								</Button>
							</Group>
							<Group grow>
								<Button
									size="xs"
									variant="light"
									onClick={() => slideActions.newSlide()}
									disabled={!gate.canEdit}>
									New
								</Button>
								<Button
									size="xs"
									variant="light"
									onClick={() => slideActions.cloneSelected()}
									disabled={!gate.canEdit || !selectedSlide}>
									Clone
								</Button>
								<Button
									size="xs"
									color="red"
									variant="light"
									onClick={() => slideActions.deleteSelected()}
									disabled={!gate.canEdit || !selectedSlide}>
									Delete
								</Button>
							</Group>
							<Group grow>
								<Button
									size="xs"
									variant="default"
									onClick={() => slideActions.selectPrevious()}>
									Prev
								</Button>
								<Button
									size="xs"
									variant="default"
									onClick={() => slideActions.selectNext()}>
									Next
								</Button>
							</Group>
							{gate.canEdit && slides.length > 1 && (
								<Group grow>
									<Button
										size="xs"
										variant="default"
										onClick={() => slideActions.moveSelectedBackward()}
										disabled={!canMoveSelectedSlideBackward}>
										Move Prev
									</Button>
									<Button
										size="xs"
										variant="default"
										onClick={() => slideActions.moveSelectedForward()}
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
										onChange={() => slideActions.toggleSelectedJoining()}
									/>
									<Switch
										size="xs"
										label="Disabled"
										checked={Boolean(selectedRawSlide.disabled)}
										onChange={() => slideActions.toggleSelectedDisabled()}
									/>
								</Group>
							)}
							{gate.canEdit && slides.length > 0 && (
								<Group grow>
									<Switch
										size="xs"
										label="All Join"
										checked={allSlidesJoined}
										onChange={() => slideActions.toggleAllJoining()}
									/>
									<Button
										size="xs"
										variant="default"
										onClick={() => slideActions.unjoinAll()}
										disabled={!canUnjoinSlides}>
										Unjoin All
									</Button>
									<Button
										size="xs"
										variant="default"
										onClick={() => slideActions.enableAll()}>
										Enable All
									</Button>
									<Button
										size="xs"
										variant="default"
										onClick={() => slideActions.disableAll()}>
										Disable All
									</Button>
								</Group>
							)}
							{gate.canEdit && slides.length > 0 && (
								<Group grow>
									<Button
										size="xs"
										variant="default"
										onClick={() => slideActions.enableOnlySelected()}
										disabled={!selectedSlide}>
										Only This
									</Button>
									<Button
										size="xs"
										color="red"
										variant="light"
										onClick={() => slideActions.deleteDisabled()}
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
									<TextInput
										size="xs"
										type="number"
										min={SLIDE_DURATION_RATIO_MIN}
										max={SLIDE_DURATION_RATIO_MAX}
										step="0.1"
										value={durationRatioInput}
										onChange={(e) => setDurationRatioInput(e.target.value)}
										onBlur={applyDurationRatio}
										onKeyDown={(e) => handleNumericKeyDown(e, adjustDurationRatio, 0.1)}
										onWheel={(e) => handleNumericWheel(e, adjustDurationRatio, 0.1)}
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
									onClick={() => layerActions.undo()}
									disabled={!gate.canEdit || !history.canUndo}>
									Undo
								</Button>
								<Button
									size="xs"
									variant="default"
									onClick={() => layerActions.redo()}
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
									onChange={(e) => layerActions.setRectEdit(e.currentTarget.checked)}
									disabled={!gate.canEdit || !isEditMode}
								/>
							</Group>
							<Group grow>
								<TextInput
									size="xs"
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
									onClick={() => layerActions.rotateLeft()}
									disabled={!gate.canEdit || !isEditMode || !hasSelection}>
									Rot L
								</Button>
								<Button
									size="xs"
									variant="default"
									onClick={() => layerActions.rotateRight()}
									disabled={!gate.canEdit || !isEditMode || !hasSelection}>
									Rot R
								</Button>
								<Button
									size="xs"
									variant="default"
									onClick={() => layerActions.fit()}
									disabled={!gate.canEdit || !isEditMode || !hasSelection}>
									Fit
								</Button>
							</Group>
							<Group grow>
								<Switch
									size="xs"
									label="Mirror H"
									checked={Boolean(editLayerState.mirrorH)}
									onChange={() => layerActions.toggleMirrorH()}
									disabled={!gate.canEdit || !isEditMode || !hasSelection}
								/>
								<Switch
									size="xs"
									label="Mirror V"
									checked={Boolean(editLayerState.mirrorV)}
									onChange={() => layerActions.toggleMirrorV()}
									disabled={!gate.canEdit || !isEditMode || !hasSelection}
								/>
							</Group>
							<Group grow>
								<Button
									size="xs"
									variant="default"
									onClick={() => layerActions.arrangeTop()}
									disabled={!gate.canEdit || !isEditMode || !hasSelection}>
									Align T
								</Button>
								<Button
									size="xs"
									variant="default"
									onClick={() => layerActions.arrangeRight()}
									disabled={!gate.canEdit || !isEditMode || !hasSelection}>
									Align R
								</Button>
								<Button
									size="xs"
									variant="default"
									onClick={() => layerActions.arrangeBottom()}
									disabled={!gate.canEdit || !isEditMode || !hasSelection}>
									Align B
								</Button>
								<Button
									size="xs"
									variant="default"
									onClick={() => layerActions.arrangeLeft()}
									disabled={!gate.canEdit || !isEditMode || !hasSelection}>
									Align L
								</Button>
							</Group>
							<Group grow>
								<Button
									size="xs"
									variant="default"
									onClick={() => layerActions.moveDown()}
									disabled={!gate.canEdit || !isEditMode || !hasSelection}>
									Back 1
								</Button>
								<Button
									size="xs"
									variant="default"
									onClick={() => layerActions.moveUp()}
									disabled={!gate.canEdit || !isEditMode || !hasSelection}>
									Front 1
								</Button>
								<Button
									size="xs"
									variant="default"
									onClick={() => layerActions.moveToBottom()}
									disabled={!gate.canEdit || !isEditMode || !hasSelection}>
									Back All
								</Button>
								<Button
									size="xs"
									variant="default"
									onClick={() => layerActions.moveToTop()}
									disabled={!gate.canEdit || !isEditMode || !hasSelection}>
									Front All
								</Button>
							</Group>
							<Group grow>
								<Button
									size="xs"
									variant="default"
									onClick={() => layerActions.cutLayer()}
									disabled={!gate.canEdit || !isEditMode || !hasSelection}>
									Cut
								</Button>
								<Button
									size="xs"
									variant="default"
									onClick={() => layerActions.copyLayer()}
									disabled={!gate.canEdit || !isEditMode || !hasSelection}>
									Copy
								</Button>
								<Button
									size="xs"
									variant="default"
									onClick={() => layerActions.pasteLayer()}
									disabled={!gate.canEdit || !isEditMode || !canPasteLayer}>
									Paste
								</Button>
							</Group>
							<Group grow>
								<Button
									size="xs"
									variant="default"
									onClick={() => layerActions.copyTransform()}
									disabled={!gate.canEdit || !isEditMode || !hasSelection}>
									Copy T
								</Button>
								<Button
									size="xs"
									variant="default"
									onClick={() => layerActions.pasteTransform()}
									disabled={!gate.canEdit || !isEditMode || !hasSelection || !canPasteLayerTransform}>
									Paste T
								</Button>
								<Button
									size="xs"
									color="red"
									variant="light"
									onClick={() => layerActions.remove()}
									disabled={!gate.canEdit || !isEditMode || !hasSelection}>
									Remove
								</Button>
							</Group>
							{sharedLayerRemovalRequest && (
								<Stack gap={4}>
									<Text size="xs" c="dimmed">
										{sharedLayerRemovalRequest.layerName}
									</Text>
									<Group grow>
										<Button size="xs" color="red" variant="light" onClick={confirmSharedLayerRemoval}>
											Remove Shared
										</Button>
										<Button
											size="xs"
											variant="default"
											onClick={() => setSharedLayerRemovalRequest(null)}>
											Cancel
										</Button>
									</Group>
								</Stack>
							)}
							<Group grow>
								<TextInput
									ref={textLayerInputRef}
									size="xs"
									type="text"
									value={textLayerInput}
									onChange={(e) => setTextLayerInput(e.target.value)}
									disabled={!gate.canEdit || !isEditMode}
									placeholder="New text layer"
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
									<Textarea
										size="xs"
										value={textContentInput}
										onChange={(e) => setTextContentInput(e.target.value)}
										disabled={!canEditSelectedLayer}
										rows={3}
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
								<TextInput
									size="xs"
									type="text"
									value={layerNameInput}
									onChange={(e) => setLayerNameInput(e.target.value)}
									disabled={!canEditSelectedLayer}
									placeholder="Layer name"
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
									onChange={() => layerActions.toggleVisible()}
									disabled={!canEditSelectedLayer}
								/>
								<Switch
									size="xs"
									label="Locked"
									checked={Boolean(editLayerState.locked)}
									onChange={() => layerActions.toggleLocked()}
									disabled={!canEditSelectedLayer}
								/>
								<Switch
									size="xs"
									label="Shared"
									checked={Boolean(editLayerState.shared)}
									onChange={() => layerActions.toggleShared()}
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
									onChange={() => layerActions.toggleIsText()}
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
								<Stack gap={4}>
									{spreadLayerRequest && (
										<Text size="xs" c="dimmed">
											{spreadLayerRequest.layerName}
										</Text>
									)}
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
											onClick={() => {
												setSpreadConfirmOpen(false);
												setSpreadLayerRequest(null);
											}}>
											Cancel
										</Button>
									</Group>
								</Stack>
							)}
							<Text size="xs" c="dimmed">
								clip t:{fmt(editLayerState.clipTop, 0)} r:{fmt(editLayerState.clipRight, 0)} b:
								{fmt(editLayerState.clipBottom, 0)} l:{fmt(editLayerState.clipLeft, 0)}
							</Text>
							<Group grow>
								<TextInput
									size="xs"
									type="number"
									min="0"
									value={clipTopInput}
									onChange={(e) => setClipTopInput(e.target.value)}
									onBlur={applyClip}
									onKeyDown={(e) => handleNumericKeyDown(e, (delta) => adjustClip("top", delta), 1, applyClip)}
									onWheel={(e) => handleNumericWheel(e, (delta) => adjustClip("top", delta), 1)}
									disabled={!canEditSelectedLayer || !isImageLayer}
								/>
								<TextInput
									size="xs"
									type="number"
									min="0"
									value={clipRightInput}
									onChange={(e) => setClipRightInput(e.target.value)}
									onBlur={applyClip}
									onKeyDown={(e) => handleNumericKeyDown(e, (delta) => adjustClip("right", delta), 1, applyClip)}
									onWheel={(e) => handleNumericWheel(e, (delta) => adjustClip("right", delta), 1)}
									disabled={!canEditSelectedLayer || !isImageLayer}
								/>
							</Group>
							<Group grow>
								<TextInput
									size="xs"
									type="number"
									min="0"
									value={clipBottomInput}
									onChange={(e) => setClipBottomInput(e.target.value)}
									onBlur={applyClip}
									onKeyDown={(e) => handleNumericKeyDown(e, (delta) => adjustClip("bottom", delta), 1, applyClip)}
									onWheel={(e) => handleNumericWheel(e, (delta) => adjustClip("bottom", delta), 1)}
									disabled={!canEditSelectedLayer || !isImageLayer}
								/>
								<TextInput
									size="xs"
									type="number"
									min="0"
									value={clipLeftInput}
									onChange={(e) => setClipLeftInput(e.target.value)}
									onBlur={applyClip}
									onKeyDown={(e) => handleNumericKeyDown(e, (delta) => adjustClip("left", delta), 1, applyClip)}
									onWheel={(e) => handleNumericWheel(e, (delta) => adjustClip("left", delta), 1)}
									disabled={!canEditSelectedLayer || !isImageLayer}
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
									onClick={() => layerActions.resetImageClip()}
									disabled={!canEditSelectedLayer || !isImageLayer}>
									Reset Clip
								</Button>
							</Group>
							<Group grow>
								<FileButton
									accept="image/*"
									onChange={replaceSelectedImage}
									resetRef={resetImageReplacePickerRef}
									disabled={!canEditSelectedLayer || !isImageLayer}>
									{({ onClick }) => (
										<Button
											size="xs"
											variant="default"
											onClick={onClick}
											disabled={!canEditSelectedLayer || !isImageLayer}>
											Replace Img
										</Button>
									)}
								</FileButton>
								<Button
									size="xs"
									variant="default"
									onClick={() => layerActions.downloadImage()}
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
													onClick={() => layerActions.selectByIndex(layer.index)}
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
															<TextInput
																size="xs"
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
								<TextInput
									size="xs"
									type="number"
									value={posXInput}
									onChange={(e) => setPosXInput(e.target.value)}
									onBlur={applyPosition}
									onKeyDown={(e) => handleNumericKeyDown(e, adjustPositionX, 1, applyPosition)}
									onWheel={(e) => handleNumericWheel(e, adjustPositionX, 1)}
									disabled={!canEditSelectedLayer}
								/>
								<TextInput
									size="xs"
									type="number"
									value={posYInput}
									onChange={(e) => setPosYInput(e.target.value)}
									onBlur={applyPosition}
									onKeyDown={(e) => handleNumericKeyDown(e, adjustPositionY, 1, applyPosition)}
									onWheel={(e) => handleNumericWheel(e, adjustPositionY, 1)}
									disabled={!canEditSelectedLayer}
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
								<TextInput
									size="xs"
									type="number"
									step="0.01"
									value={scaleInput}
									onChange={(e) => setScaleInput(e.target.value)}
									onBlur={applyScale}
									onKeyDown={(e) => handleNumericKeyDown(e, adjustScale, 0.05, applyScale)}
									onWheel={(e) => handleNumericWheel(e, adjustScale, 0.05)}
									disabled={!canEditSelectedLayer}
								/>
								<Button
									size="xs"
									variant="default"
									onClick={applyScale}
									disabled={!canEditSelectedLayer}>
									Set Scale
								</Button>
								<TextInput
									size="xs"
									type="number"
									step="1"
									value={rotationInput}
									onChange={(e) => setRotationInput(e.target.value)}
									onBlur={applyRotation}
									onKeyDown={(e) => handleNumericKeyDown(e, adjustRotation, 1, applyRotation)}
									onWheel={(e) => handleNumericWheel(e, adjustRotation, 1)}
									disabled={!canEditSelectedLayer}
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
								<TextInput
									size="xs"
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
									onClick={() => layerActions.nudgeLeft()}
									disabled={!gate.canEdit || !isEditMode || !hasSelection}>
									X-
								</Button>
								<Button
									size="xs"
									variant="default"
									onClick={() => layerActions.nudgeRight()}
									disabled={!gate.canEdit || !isEditMode || !hasSelection}>
									X+
								</Button>
								<Button
									size="xs"
									variant="default"
									onClick={() => layerActions.nudgeUp()}
									disabled={!gate.canEdit || !isEditMode || !hasSelection}>
									Y-
								</Button>
								<Button
									size="xs"
									variant="default"
									onClick={() => layerActions.nudgeDown()}
									disabled={!gate.canEdit || !isEditMode || !hasSelection}>
									Y+
								</Button>
							</Group>
							<Group grow>
								<Button
									size="xs"
									variant="default"
									onClick={() => layerActions.scaleDown()}
									disabled={!gate.canEdit || !isEditMode || !hasSelection}>
									Scale-
								</Button>
								<Button
									size="xs"
									variant="default"
									onClick={() => layerActions.scaleUp()}
									disabled={!gate.canEdit || !isEditMode || !hasSelection}>
									Scale+
								</Button>
								<Button
									size="xs"
									variant="default"
									onClick={() => layerActions.adjustRotationLeft()}
									disabled={!gate.canEdit || !isEditMode || !hasSelection}>
									Rot-
								</Button>
								<Button
									size="xs"
									variant="default"
									onClick={() => layerActions.adjustRotationRight()}
									disabled={!gate.canEdit || !isEditMode || !hasSelection}>
									Rot+
								</Button>
							</Group>
							<Group grow>
								<Button
									size="xs"
									variant="default"
									onClick={() => layerActions.decreaseOpacity()}
									disabled={!gate.canEdit || !isEditMode || !hasSelection}>
									Op-
								</Button>
								<Button
									size="xs"
									variant="default"
									onClick={() => layerActions.increaseOpacity()}
									disabled={!gate.canEdit || !isEditMode || !hasSelection}>
									Op+
								</Button>
								<Button
									size="xs"
									variant="default"
									onClick={() => layerActions.resetRotation()}
									disabled={!gate.canEdit || !isEditMode || !hasSelection}>
									Rot 0
								</Button>
								<Button
									size="xs"
									variant="default"
									onClick={() => layerActions.resetOpacity()}
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
								<Stack gap={4}>
									{images.length === 0 ? (
										<Text size="xs" c="dimmed">
											No images
										</Text>
									) : (
										<div
											style={{
												display: "grid",
												gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
												gap: 6,
											}}>
											{images.map((image) => (
												<img
													key={image.id}
													src={image.src}
													alt={image.name || image.id}
													title={image.name || image.id}
													draggable={gate.canEdit}
													onDragStart={(event) => dragImage(image.id, event)}
													onDoubleClick={() => requestImageDelete(image)}
													style={{
														width: "100%",
														aspectRatio: "1 / 1",
														objectFit: "contain",
														background: "#868e96",
														border: "1px solid #dee2e6",
														borderRadius: 4,
														boxSizing: "border-box",
														cursor: gate.canEdit ? "grab" : "default",
													}}
												/>
											))}
										</div>
									)}
									{imageDeleteRequest && (
										<Text size="xs" c="dimmed">
											{imageDeleteRequest.name || imageDeleteRequest.imageId}
										</Text>
									)}
									{imageDeleteRequest && (
										<Group grow>
											<Button size="xs" color="red" variant="light" onClick={confirmImageDelete}>
												Delete Img
											</Button>
											<Button
												size="xs"
												variant="default"
												onClick={() => setImageDeleteRequest(null)}>
												Cancel
											</Button>
										</Group>
									)}
								</Stack>
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
									onClick={requestImportDialog}
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
							{importConfirmOpen && (
								<Group grow>
									<Button size="xs" color="red" variant="light" onClick={confirmImportDialog}>
										Load File
									</Button>
									<Button
										size="xs"
										variant="default"
										onClick={() => setImportConfirmOpen(false)}>
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
								<ColorInput
									size="xs"
									value={slideShowSettings.bgColor}
									onChange={(value) => ViewerCommands.setBackgroundColor(value)}
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
									onClick={requestSaveDocument}
									disabled={!canUseSaveChoice}>
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
							{effectiveSaveChoiceOpen && (
								<Group grow>
									<Button size="xs" variant="light" onClick={() => saveDocumentWithChoice(true)}>
										Overwrite
									</Button>
									<Button size="xs" variant="default" onClick={() => saveDocumentWithChoice(false)}>
										New Save
									</Button>
									<Button size="xs" variant="subtle" onClick={() => setSaveChoiceOpen(false)}>
										Cancel
									</Button>
								</Group>
							)}
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
