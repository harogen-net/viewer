import { Badge, Button, Group, NativeSelect, Paper, ScrollArea, Stack, Text } from "@mantine/core";
import { useEffect, useMemo, useRef, useState } from "react";
import { ViewerCommands } from "../bridge/ViewerCommands";
import {
    useViewerEditLayerState,
    useViewerEditSelection,
    useViewerHistory,
    useViewerMode,
    useViewerSavedFileSelection,
    useViewerSlides,
    useViewerSlideshowSettings,
    useViewerStorage,
} from "../bridge/useViewerBridge";
import { FeatureGate } from "../runtime/featureGate";
import { AppRuntimeMode } from "../runtime/mode";

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

type RuntimeShellProps = {
	mode: AppRuntimeMode;
	gate: FeatureGate;
};

type SlideSnapshot = {
	index: number;
	label: string;
	selected: boolean;
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
	const { mode: viewerMode } = useViewerMode();
	const { hasSelection } = useViewerEditSelection();
	const editLayerState = useViewerEditLayerState();

	const [slideCollapsed, setSlideCollapsed] = useState(false);
	const [fileCollapsed, setFileCollapsed] = useState(false);
	const [pos, setPos] = useState<{ x: number; y: number } | null>(null);
	const [posXInput, setPosXInput] = useState("");
	const [posYInput, setPosYInput] = useState("");
	const [scaleInput, setScaleInput] = useState("");
	const [rotationInput, setRotationInput] = useState("");
	const [opacityInput, setOpacityInput] = useState("");
	const [textLayerInput, setTextLayerInput] = useState("");
	const dragState = useRef<{ startMouseX: number; startMouseY: number; startX: number; startY: number } | null>(null);

	useEffect(() => {
		setPosXInput(editLayerState.x == null ? "" : String(Math.round(editLayerState.x)));
		setPosYInput(editLayerState.y == null ? "" : String(Math.round(editLayerState.y)));
		setScaleInput(editLayerState.scale == null ? "" : editLayerState.scale.toFixed(3));
		setRotationInput(editLayerState.rotation == null ? "" : String(Math.round(editLayerState.rotation)));
		setOpacityInput(editLayerState.opacity == null ? "" : editLayerState.opacity.toFixed(2));
	}, [editLayerState.x, editLayerState.y, editLayerState.scale, editLayerState.rotation, editLayerState.opacity]);

	const handleDragStart = (e: React.MouseEvent<HTMLDivElement>) => {
		const currentX = pos?.x ?? (window.innerWidth - 292);
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
			rawSlides.map((_, i) => ({
				index: i,
				label: `Slide ${i + 1}`,
				selected: i === selectedIndex,
			})),
		[rawSlides, selectedIndex]
	);

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

	const selectedSlide = useMemo(
		() => slides.find((s) => s.selected) ?? null,
		[slides]
	);

	const selectSlide = (index: number) => {
		ViewerCommands.selectSlideByIndex(index);
	};

	const applyPosition = () => {
		if (!canEditSelectedLayer) return;
		const x = Number(posXInput);
		const y = Number(posYInput);
		if (!isFinite(x) || !isFinite(y)) return;
		ViewerCommands.setSelectedLayerPosition(x, y);
	};

	const applyScale = () => {
		if (!canEditSelectedLayer) return;
		const scale = Number(scaleInput);
		if (!isFinite(scale) || scale <= 0) return;
		ViewerCommands.setSelectedLayerScale(scale);
	};

	const applyRotation = () => {
		if (!canEditSelectedLayer) return;
		const rotation = Number(rotationInput);
		if (!isFinite(rotation)) return;
		ViewerCommands.setSelectedLayerRotation(rotation);
	};

	const applyOpacity = () => {
		if (!canEditSelectedLayer) return;
		const opacity = Number(opacityInput);
		if (!isFinite(opacity)) return;
		ViewerCommands.setSelectedLayerOpacity(opacity);
	};

	const addTextLayer = () => {
		if (!gate.canEdit || !isEditMode) return;
		const text = textLayerInput.trim();
		if (!text) return;
		ViewerCommands.addTextLayer(text);
		setTextLayerInput("");
	};

	const selectSavedFile = (value: string) => {
		ViewerCommands.selectSavedFile(value);
		ViewerCommands.loadSelectedSavedFile();
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
						<Text fw={700} size="sm">Slide IO</Text>
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
					<Button size="xs" variant="light" onClick={() => ViewerCommands.newSlide()} disabled={!gate.canEdit}>
						New
					</Button>
					<Button size="xs" variant="light" onClick={() => ViewerCommands.cloneSelectedSlide()} disabled={!gate.canEdit || !selectedSlide}>
						Clone
					</Button>
					<Button size="xs" color="red" variant="light" onClick={() => ViewerCommands.deleteSelectedSlide()} disabled={!gate.canEdit || !selectedSlide}>
						Delete
					</Button>
				</Group>
				<Group grow>
					<Button size="xs" variant="default" onClick={() => ViewerCommands.selectPreviousSlide()}>Prev</Button>
					<Button size="xs" variant="default" onClick={() => ViewerCommands.selectNextSlide()}>Next</Button>
				</Group>
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
					<Button
						size="xs"
						variant="default"
						onClick={() => ViewerCommands.toggleSelectedLayerMirrorH()}
						disabled={!gate.canEdit || !isEditMode || !hasSelection}>
						Mirror H
					</Button>
					<Button
						size="xs"
						variant="default"
						onClick={() => ViewerCommands.toggleSelectedLayerMirrorV()}
						disabled={!gate.canEdit || !isEditMode || !hasSelection}>
						Mirror V
					</Button>
				</Group>
				<Group grow>
					<Button
						size="xs"
						variant="default"
						onClick={() => ViewerCommands.arrangeSelectedLayerTop()}
						disabled={!gate.canEdit || !isEditMode || !hasSelection}>
						Top
					</Button>
					<Button
						size="xs"
						variant="default"
						onClick={() => ViewerCommands.arrangeSelectedLayerRight()}
						disabled={!gate.canEdit || !isEditMode || !hasSelection}>
						Right
					</Button>
					<Button
						size="xs"
						variant="default"
						onClick={() => ViewerCommands.arrangeSelectedLayerBottom()}
						disabled={!gate.canEdit || !isEditMode || !hasSelection}>
						Bottom
					</Button>
					<Button
						size="xs"
						variant="default"
						onClick={() => ViewerCommands.arrangeSelectedLayerLeft()}
						disabled={!gate.canEdit || !isEditMode || !hasSelection}>
						Left
					</Button>
				</Group>
				<Group grow>
					<Button
						size="xs"
						variant="default"
						onClick={() => ViewerCommands.moveSelectedLayerDown()}
						disabled={!gate.canEdit || !isEditMode || !hasSelection}>
						Back
					</Button>
					<Button
						size="xs"
						variant="default"
						onClick={() => ViewerCommands.moveSelectedLayerUp()}
						disabled={!gate.canEdit || !isEditMode || !hasSelection}>
						Front
					</Button>
					<Button
						size="xs"
						variant="default"
						onClick={() => ViewerCommands.moveSelectedLayerToBottom()}
						disabled={!gate.canEdit || !isEditMode || !hasSelection}>
						Bottom
					</Button>
					<Button
						size="xs"
						variant="default"
						onClick={() => ViewerCommands.moveSelectedLayerToTop()}
						disabled={!gate.canEdit || !isEditMode || !hasSelection}>
						Top
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
					<Button size="xs" variant="default" onClick={addTextLayer} disabled={!gate.canEdit || !isEditMode}>
						Add Text
					</Button>
				</Group>
				<Text size="xs" c="dimmed">
					Selected Layer: {editLayerState.layerType ?? "none"}
				</Text>
				<Text size="xs" c="dimmed">
					x:{fmt(editLayerState.x, 0)} y:{fmt(editLayerState.y, 0)} scale:{fmt(editLayerState.scale)}
				</Text>
				<Text size="xs" c="dimmed">
					rotation:{fmt(editLayerState.rotation, 0)} opacity:{fmt(editLayerState.opacity)}
				</Text>
				<Text size="xs" c="dimmed">
					mirrorH:{editLayerState.mirrorH == null ? "-" : editLayerState.mirrorH ? "on" : "off"} mirrorV:{editLayerState.mirrorV == null ? "-" : editLayerState.mirrorV ? "on" : "off"}
				</Text>
				<Text size="xs" c="dimmed">
					clip t:{fmt(editLayerState.clipTop, 0)} r:{fmt(editLayerState.clipRight, 0)} b:{fmt(editLayerState.clipBottom, 0)} l:{fmt(editLayerState.clipLeft, 0)}
				</Text>
				<Group grow>
					<input
						type="number"
						value={posXInput}
						onChange={(e) => setPosXInput(e.target.value)}
						disabled={!canEditSelectedLayer}
						style={{ width: "100%" }}
					/>
					<input
						type="number"
						value={posYInput}
						onChange={(e) => setPosYInput(e.target.value)}
						disabled={!canEditSelectedLayer}
						style={{ width: "100%" }}
					/>
					<Button size="xs" variant="default" onClick={applyPosition} disabled={!canEditSelectedLayer}>
						Set XY
					</Button>
				</Group>
				<Group grow>
					<input
						type="number"
						step="0.01"
						value={scaleInput}
						onChange={(e) => setScaleInput(e.target.value)}
						disabled={!canEditSelectedLayer}
						style={{ width: "100%" }}
					/>
					<Button size="xs" variant="default" onClick={applyScale} disabled={!canEditSelectedLayer}>
						Set Scale
					</Button>
					<input
						type="number"
						step="1"
						value={rotationInput}
						onChange={(e) => setRotationInput(e.target.value)}
						disabled={!canEditSelectedLayer}
						style={{ width: "100%" }}
					/>
					<Button size="xs" variant="default" onClick={applyRotation} disabled={!canEditSelectedLayer}>
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
						disabled={!canEditSelectedLayer}
						style={{ width: "100%" }}
					/>
					<Button size="xs" variant="default" onClick={applyOpacity} disabled={!canEditSelectedLayer}>
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
				<Group grow>
					<Button
						size="xs"
						variant="default"
						onClick={() => ViewerCommands.adjustSelectedImageClip("top", 10)}
						disabled={!gate.canEdit || !isEditMode || !hasSelection || !isImageLayer}>
						Clip T+
					</Button>
					<Button
						size="xs"
						variant="default"
						onClick={() => ViewerCommands.adjustSelectedImageClip("top", -10)}
						disabled={!gate.canEdit || !isEditMode || !hasSelection || !isImageLayer}>
						Clip T-
					</Button>
					<Button
						size="xs"
						variant="default"
						onClick={() => ViewerCommands.adjustSelectedImageClip("right", 10)}
						disabled={!gate.canEdit || !isEditMode || !hasSelection || !isImageLayer}>
						Clip R+
					</Button>
					<Button
						size="xs"
						variant="default"
						onClick={() => ViewerCommands.adjustSelectedImageClip("right", -10)}
						disabled={!gate.canEdit || !isEditMode || !hasSelection || !isImageLayer}>
						Clip R-
					</Button>
				</Group>
				<Group grow>
					<Button
						size="xs"
						variant="default"
						onClick={() => ViewerCommands.adjustSelectedImageClip("bottom", 10)}
						disabled={!gate.canEdit || !isEditMode || !hasSelection || !isImageLayer}>
						Clip B+
					</Button>
					<Button
						size="xs"
						variant="default"
						onClick={() => ViewerCommands.adjustSelectedImageClip("bottom", -10)}
						disabled={!gate.canEdit || !isEditMode || !hasSelection || !isImageLayer}>
						Clip B-
					</Button>
					<Button
						size="xs"
						variant="default"
						onClick={() => ViewerCommands.adjustSelectedImageClip("left", 10)}
						disabled={!gate.canEdit || !isEditMode || !hasSelection || !isImageLayer}>
						Clip L+
					</Button>
					<Button
						size="xs"
						variant="default"
						onClick={() => ViewerCommands.adjustSelectedImageClip("left", -10)}
						disabled={!gate.canEdit || !isEditMode || !hasSelection || !isImageLayer}>
						Clip L-
					</Button>
				</Group>
				<Group grow>
					<Button
						size="xs"
						variant="default"
						onClick={() => ViewerCommands.resetSelectedImageClip()}
						disabled={!gate.canEdit || !isEditMode || !hasSelection || !isImageLayer}>
						Clip Reset
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
									key={slide.label}
									size="xs"
									fw={slide.selected ? 700 : 400}
									style={{ cursor: "pointer" }}
									onClick={() => selectSlide(slide.index)}>
									{slide.selected ? "● " : "○ "}
									{slide.label}
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
						<Text fw={700} size="sm">File IO</Text>
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
					<Button size="xs" variant="light" onClick={() => ViewerCommands.newDocument()} disabled={!gate.canEdit}>
						New Doc
					</Button>
					<Button size="xs" variant="light" onClick={() => ViewerCommands.openImportDialog()} disabled={!gate.canImport}>
						Import
					</Button>
					<Button size="xs" variant="light" onClick={() => ViewerCommands.exportDocument()} disabled={!gate.canExport}>
						Export
					</Button>
				</Group>
				<Group grow>
					<Button size="xs" variant="light" onClick={() => ViewerCommands.exportImages()} disabled={!gate.canExport}>
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
						onChange={(e) => ViewerCommands.setSlideShowDuration(Number(e.currentTarget.value))}
						size="xs"
					/>
					<NativeSelect
						data={intervalOptions}
						value={String(slideShowSettings.interval)}
						onChange={(e) => ViewerCommands.setSlideShowInterval(Number(e.currentTarget.value))}
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
					<Button
						size="xs"
						variant={slideShowSettings.fullscreen ? "filled" : "default"}
						onClick={() => ViewerCommands.setFullscreen(!slideShowSettings.fullscreen)}>
						Fullscreen
					</Button>
					<Button
						size="xs"
						variant={slideShowSettings.mirrorH ? "filled" : "default"}
						onClick={() => ViewerCommands.setMirrorH(!slideShowSettings.mirrorH)}>
						Mirror H
					</Button>
					<Button
						size="xs"
						variant={slideShowSettings.mirrorV ? "filled" : "default"}
						onClick={() => ViewerCommands.setMirrorV(!slideShowSettings.mirrorV)}>
						Mirror V
					</Button>
				</Group>
				<Group grow>
					<Button size="xs" variant="default" onClick={selectPreviousSavedFileAndLoad} disabled={savedFiles.length === 0}>
						Slot Prev
					</Button>
					<Button size="xs" variant="default" onClick={selectNextSavedFileAndLoad} disabled={savedFiles.length === 0}>
						Slot Next
					</Button>
				</Group>
				<Group grow>
					<Button size="xs" variant="light" onClick={() => ViewerCommands.saveDocument()} disabled={!gate.canSave}>
						Save
					</Button>
					<Button size="xs" variant="light" onClick={() => ViewerCommands.loadSelectedSavedFile()} disabled={!selectedFileId}>
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
