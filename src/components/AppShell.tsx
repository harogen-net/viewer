import {
	Anchor,
	Box,
	Button,
	Flex,
	Group,
	MantineProvider,
	Stack,
	Text,
	Title,
} from "@mantine/core";
import type { CSSProperties, FC } from "react";
import { useEffect, useRef, useState } from "react";
import { useImageDimensionBackfill } from "../hooks/useImageLibraryMutation";
import { useRectSyncConfig } from "../hooks/useLayerMutation";
import { useShellKeyboard } from "../hooks/useShellKeyboard";
import { useSlideshowStore } from "../state/slideshowStore";
import { useSlideStore } from "../state/slideStore";
import { useViewerDocumentStore } from "../state/viewerDocumentStore";
import { AlertHost } from "./common/AlertHost";
import { EditOpsPanel } from "./panels/EditOpsPanel";
import { EditToolbar } from "./panels/EditToolbar";
import { FileIOPanel } from "./panels/FileIOPanel";
import { ImageLibraryPanel } from "./panels/ImageLibraryPanel";
import { LayerListPanel } from "./panels/LayerListPanel";
import { SlideListPanel } from "./panels/SlideListPanel";
import { SlideShowOpsPanel } from "./panels/SlideShowOpsPanel";
import { ProgressBar } from "./ProgressBar";
import { SlideEditView } from "./slide/SlideEditView";
import { SlideshowShell } from "./SlideshowShell";

// `?new=1` 起動か判定 (v3 §0-8 dual entrypoint)。
// 新側モードでは Group A の build 中につき placeholder を出す。
// 通常モード (レガシー) では従来通り ProgressBar のみ。
const isNewMode =
	typeof window !== "undefined" && new URLSearchParams(window.location.search).get("new") === "1";

// dev 専用の左右モード切替リンク (v3 開発中の手動確認用、Group D 末尾で削除)。
const modeSwitchLinkStyle: CSSProperties = {
	position: "fixed",
	bottom: 6,
	right: 6,
	zIndex: 99999,
	padding: "4px 10px",
	background: "rgba(0,0,0,0.7)",
	color: "#fff",
	textDecoration: "none",
	fontFamily: "monospace",
	fontSize: 12,
	borderRadius: 4,
};

const NewSidePanel: FC = () => {
	const [showImageLibrary, setShowImageLibrary] = useState(false);
	const slideshowRunning = useSlideshowStore((s) => s.running);
	const stopSlideshow = useSlideshowStore((s) => s.stop);
	// ロード済み画像の自然寸法を backfill (D-14、rectEdit の矩形一致判定の基盤)。
	useImageDimensionBackfill();
	// rectEdit トグル + 自然寸法を layerOps へ流し込む (D-18)。
	useRectSyncConfig();

	return (
		<>
			<Box p="lg">
				<Stack gap="md">
					<Title order={3}>v3 new side</Title>
					<Flex gap="sm">
						<SlideShowOpsPanel /> <FileIOPanel />
					</Flex>
					<SlideListPanel />

					<Group gap="sm" align="center">
						<Button
							variant="default"
							onClick={() => setShowImageLibrary(true)}
							data-open-image-library>
							🖼 画像ライブラリ
						</Button>
					</Group>
				</Stack>
			</Box>
			<SlideshowShell open={slideshowRunning} onClose={stopSlideshow} />
			<ImageLibraryPanel opened={showImageLibrary} onClose={() => setShowImageLibrary(false)} />
		</>
	);
};

// 編集 canvas 領域 (v4 Group D D-1、D-5 で右側に LayerListPanel を併設)。
// 選択 slide があれば SlideEditView を fit-to-area で render、無ければ案内テキスト。
// SlideEditView の fit 領域は左側コンテナを ResizeObserver で計測し SlideEditView に渡す。
const EditArea: FC = () => {
	const slides = useSlideStore((s) => s.slides);
	const selectedIndex = useSlideStore((s) => s.selectedIndex);
	const meta = useViewerDocumentStore((s) => s.meta);
	const slide = selectedIndex >= 0 ? slides[selectedIndex] : null;

	// 編集シェルのキーボードショートカット (Ctrl+C/V/X) を配線 (D-8)。
	useShellKeyboard();

	const stageRef = useRef<HTMLDivElement>(null);
	const [size, setSize] = useState<{ w: number; h: number }>({ w: 0, h: 0 });

	useEffect(() => {
		const el = stageRef.current;
		if (!el) return;
		const ro = new ResizeObserver((entries) => {
			const r = entries[0].contentRect;
			setSize({ w: r.width, h: r.height });
		});
		ro.observe(el);
		return () => ro.disconnect();
	}, []);

	const editAreaStyle: CSSProperties = {
		flex: 1,
		minWidth: 0,
		minHeight: 0,
		display: "flex",
		flexDirection: "row",
	};
	// 左カラム = 上部ツールバー + canvas (縦積み)。canvas のみ ResizeObserver 計測対象。
	const editMainStyle: CSSProperties = {
		flex: 1,
		minWidth: 0,
		minHeight: 0,
		display: "flex",
		flexDirection: "column",
	};
	const toolbarRowStyle: CSSProperties = {
		flex: "0 0 auto",
		padding: 6,
		borderBottom: "1px solid #dee2e6",
		background: "#fff",
	};
	const stageStyle: CSSProperties = {
		flex: 1,
		minWidth: 0,
		minHeight: 0,
		position: "relative",
		background: "#f1f3f5",
	};
	const sideRailStyle: CSSProperties = {
		flex: "0 0 320px",
		width: 320,
		borderLeft: "1px solid #dee2e6",
		overflowY: "auto",
		padding: 8,
		background: "#fff",
	};

	return (
		<div style={editAreaStyle} data-edit-area>
			<div style={editMainStyle}>
				{/* アプリ一般の編集操作 (undo/redo・テキスト追加・rectEdit) ツールバー */}
				<div style={toolbarRowStyle}>
					<EditToolbar />
				</div>
				<div ref={stageRef} style={stageStyle} data-edit-stage-area>
					{slide && size.w > 0 && size.h > 0 ? (
						<SlideEditView
							slide={slide}
							bgColor={meta?.bgColor}
							fitAreaWidth={size.w}
							fitAreaHeight={size.h}
						/>
					) : (
						<Box p="lg">
							<Text size="sm" c="dimmed">
								{slide ? "..." : "編集対象の slide を一覧から選択してください"}
							</Text>
						</Box>
					)}
				</div>
			</div>
			<aside style={sideRailStyle} data-edit-side-rail>
				<Stack gap="sm">
					<EditOpsPanel />
					<LayerListPanel />
				</Stack>
			</aside>
		</div>
	);
};

const newModeLayoutStyle: CSSProperties = {
	display: "flex",
	flexDirection: "column",
	width: "100vw",
	height: "100vh",
};
const sidePaneStyle: CSSProperties = {
	flex: "0 0 auto",
	maxHeight: "60vh",
	overflowY: "auto",
	borderBottom: "1px solid #dee2e6",
};

export const AppShell: FC = () => (
	<MantineProvider>
		{isNewMode ? (
			<>
				<div style={newModeLayoutStyle}>
					<div style={sidePaneStyle}>
						<NewSidePanel />
					</div>
					<EditArea />
				</div>
				<Anchor href="/" style={modeSwitchLinkStyle} underline="never">
					→ legacy
				</Anchor>
			</>
		) : (
			<Anchor href="/?new=1" style={modeSwitchLinkStyle} underline="never">
				→ new (v3)
			</Anchor>
		)}
		<ProgressBar />
		<AlertHost />
	</MantineProvider>
);
