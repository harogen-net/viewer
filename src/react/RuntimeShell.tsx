import { Badge, Button, Group, NativeSelect, Paper, ScrollArea, Stack, Text } from "@mantine/core";
import { useMemo, useRef, useState } from "react";
import { ViewerCommands } from "../bridge/ViewerCommands";
import {
    useViewerHistory,
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

	const [collapsed, setCollapsed] = useState(false);
	const [pos, setPos] = useState<{ x: number; y: number } | null>(null);
	const dragState = useRef<{ startMouseX: number; startMouseY: number; startX: number; startY: number } | null>(null);

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

	const posStyle: React.CSSProperties = pos
		? { left: pos.x, top: pos.y, right: "auto" }
		: { right: 12, top: 12 };

	return (
		<Paper
			shadow="md"
			p={0}
			radius="md"
			withBorder
			style={{
				position: "fixed",
				width: 280,
				zIndex: 2147483646,
				background: "rgba(255, 255, 255, 0.92)",
				backdropFilter: "blur(2px)",
				...posStyle,
			}}>
		{/* タイトルバー（ドラッグ + 開閉） */}
		<div
			onMouseDown={handleDragStart}
			style={{
				padding: "6px 8px",
				cursor: "grab",
				userSelect: "none",
				borderBottom: collapsed ? "none" : "1px solid #dee2e6",
			}}>
			<Group justify="space-between" align="center" wrap="nowrap">
				<Group gap={6} align="center" wrap="nowrap">
					<Text fw={700} size="sm">React Shell</Text>
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
					onClick={() => setCollapsed((c) => !c)}>
					{collapsed ? "▼" : "▲"}
				</Button>
			</Group>
		</div>

		{!collapsed && (
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
		)}
		</Paper>
	);
}
