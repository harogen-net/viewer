import { Anchor, Box, Button, Group, MantineProvider, Stack, Text, Title } from "@mantine/core";
import type { CSSProperties, FC } from "react";
import { useEffect, useRef, useState } from "react";
import { useSlideStore } from "../state/slideStore";
import { useViewerDocumentStore } from "../state/viewerDocumentStore";
import { EditOpsPanel } from "./panels/EditOpsPanel";
import { FileIOPanel } from "./panels/FileIOPanel";
import { LayerListPanel } from "./panels/LayerListPanel";
import { SlideListPanel } from "./panels/SlideListPanel";
import { ProgressBar } from "./ProgressBar";
import { SlideEditView } from "./slide/SlideEditView";
import { SlideshowShell } from "./SlideshowShell";

// `?new=1` 起動か判定 (v3 §0-8 dual entrypoint)。
// 新側モードでは Group A の build 中につき placeholder を出す。
// 通常モード (レガシー) では従来通り ProgressBar のみ。
const isNewMode =
	typeof window !== "undefined" &&
	new URLSearchParams(window.location.search).get("new") === "1";

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
	const slideCount = useSlideStore((s) => s.slides.length);
	const [showSlideshow, setShowSlideshow] = useState(false);

	return (
		<>
			<Box p="lg">
				<Stack gap="md">
					<Title order={3}>v3 new side</Title>
					<FileIOPanel />
					<SlideListPanel />
					<Group gap="sm" align="center">
						<Button
							color="green"
							onClick={() => setShowSlideshow(true)}
							disabled={slideCount === 0}
						>
							▶ slideshow 開始
						</Button>
						{slideCount === 0 && (
							<Text size="xs" c="dimmed">
								document をロードしてから slideshow を開始
							</Text>
						)}
					</Group>
				</Stack>
			</Box>
			<SlideshowShell open={showSlideshow} onClose={() => setShowSlideshow(false)} />
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
	</MantineProvider>
);

