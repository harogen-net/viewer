import { Anchor, Box, Button, Group, MantineProvider, Stack, Text, Title } from "@mantine/core";
import type { CSSProperties, FC } from "react";
import { useState } from "react";
import { useSlideStore } from "../state/slideStore";
import { FileIOPanel } from "./panels/FileIOPanel";
import { SlideListPanel } from "./panels/SlideListPanel";
import { ProgressBar } from "./ProgressBar";
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

export const AppShell: FC = () => (
	<MantineProvider>
		{isNewMode ? (
			<>
				<NewSidePanel />
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

