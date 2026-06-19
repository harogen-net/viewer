import { Button, Group, Paper, Switch } from "@mantine/core";
import {
	useViewerSlideshowPlayback,
	useViewerSlideshowSettings,
} from "../bridge/useViewerBridge";
import { useViewerDocument } from "../hooks/useViewerDocument";

// R5: スライドショー再生中の上部ツールバー (`RuntimeShell` から抽出)。
export function SlideshowToolbar() {
	const slideShowSettings = useViewerSlideshowSettings();
	const slideShowPlayback = useViewerSlideshowPlayback();
	const { actions: docActions } = useViewerDocument();

	return (
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
				<Button size="xs" color="red" variant="light" onClick={() => docActions.stopSlideshow()}>
					Exit
				</Button>
				<Button size="xs" variant="default" onClick={() => docActions.showPreviousSlide()}>
					Back
				</Button>
				<Button size="xs" variant="default" onClick={() => docActions.toggleSlideshowPause()}>
					{slideShowPlayback.isPause ? "Play" : "Pause"}
				</Button>
				<Button size="xs" variant="default" onClick={() => docActions.showNextSlide()}>
					Next
				</Button>
				<Switch
					size="xs"
					label="Full"
					checked={slideShowSettings.fullscreen}
					onChange={(e) => docActions.setFullscreen(e.currentTarget.checked)}
				/>
				<Switch
					size="xs"
					label="H"
					checked={slideShowSettings.mirrorH}
					onChange={(e) => docActions.setMirrorH(e.currentTarget.checked)}
				/>
				<Switch
					size="xs"
					label="V"
					checked={slideShowSettings.mirrorV}
					onChange={(e) => docActions.setMirrorV(e.currentTarget.checked)}
				/>
			</Group>
		</Paper>
	);
}
