import {
	ActionIcon,
	Button,
	Collapse,
	Group,
	NumberInput,
	Paper,
	Stack,
	Switch,
	Title,
} from "@mantine/core";
import { useDisclosure } from "@mantine/hooks";
import type { FC } from "react";
import { useSlideStore } from "../../state/slideStore";
import { useSlideshowStore } from "../../state/slideshowStore";

// スライドショー操作パネル (§9)。legacy のツールバー散在 UI を 1 パネルに集約:
//   - 開始ボタン (旧 NewSidePanel の「▶ slideshow 開始」をここへ移設)
//   - interval (自動進行間隔) / duration (クロスフェード時間) 数値入力
//   - flipX / flipY (ミラー H/V) トグル
//   - 全画面で開始 トグル
// 実行状態 + 設定は slideshowStore に集約し、SlideshowShell が購読する。

export const SlideShowOpsPanel: FC = () => {
	const slideCount = useSlideStore((s) => s.slides.length);
	const intervalMs = useSlideshowStore((s) => s.intervalMs);
	const durationMs = useSlideshowStore((s) => s.durationMs);
	const flipX = useSlideshowStore((s) => s.flipX);
	const flipY = useSlideshowStore((s) => s.flipY);
	const startFullscreen = useSlideshowStore((s) => s.startFullscreen);
	const start = useSlideshowStore((s) => s.start);
	const setIntervalMs = useSlideshowStore((s) => s.setIntervalMs);
	const setDurationMs = useSlideshowStore((s) => s.setDurationMs);
	const setFlipX = useSlideshowStore((s) => s.setFlipX);
	const setFlipY = useSlideshowStore((s) => s.setFlipY);
	const setStartFullscreen = useSlideshowStore((s) => s.setStartFullscreen);

	const [expanded, { toggle }] = useDisclosure(false);

	return (
		<Paper withBorder p="sm" radius="sm" data-slideshow-ops>
			<Stack gap="xs">
				<Title order={5}>
					SlideShow{" "}
					<ActionIcon variant="subtle" onClick={toggle}>
						{expanded ? "▲" : "▼"}
					</ActionIcon>
				</Title>
				<Button
					color="red"
					size="sm"
					onClick={start}
					disabled={slideCount === 0}
					data-ss-op="start">
					▶
				</Button>
				<Collapse in={expanded}>
					<Group gap="xs" grow>
						<div data-ss-op="interval">
							<NumberInput
								label="間隔 interval (ms)"
								value={intervalMs}
								onChange={(v) => setIntervalMs(typeof v === "number" ? v : Number(v) || 0)}
								min={0}
								step={500}
								size="xs"
							/>
						</div>
						<div data-ss-op="duration">
							<NumberInput
								label="フェード duration (ms)"
								value={durationMs}
								onChange={(v) => setDurationMs(typeof v === "number" ? v : Number(v) || 0)}
								min={0}
								step={100}
								size="xs"
							/>
						</div>
					</Group>
					<Group gap="md">
						<div data-ss-op="flip-x">
							<Switch
								label="左右反転 (flipX)"
								checked={flipX}
								onChange={(e) => setFlipX(e.currentTarget.checked)}
								size="xs"
							/>
						</div>
						<div data-ss-op="flip-y">
							<Switch
								label="上下反転 (flipY)"
								checked={flipY}
								onChange={(e) => setFlipY(e.currentTarget.checked)}
								size="xs"
							/>
						</div>
					</Group>
					<div data-ss-op="fullscreen">
						<Switch
							label="全画面で開始"
							checked={startFullscreen}
							onChange={(e) => setStartFullscreen(e.currentTarget.checked)}
							size="xs"
						/>
					</div>
				</Collapse>
			</Stack>
		</Paper>
	);
};
