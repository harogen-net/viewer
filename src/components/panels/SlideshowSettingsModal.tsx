import { useDeviceMode } from "@/hooks/useDeviceMode";
import { DURATION_DEFAULT_MS, INTERVAL_DEFAULT_MS, useSlideshowStore } from "@/state/slideshowStore";
import { ActionIcon, Button, Group, Modal, Slider, Stack, Switch, Text } from "@mantine/core";
import { IconRestore } from "@tabler/icons-react";
import type { FC } from "react";

// legacy (index.html) の select 選択肢を参考にした範囲:
// - interval: 500..15000 (legacy 選択肢は 500, 1000, 2000..15000。全て step=500 で網羅可能)
// - duration: 0..5000 (legacy 選択肢は 1(=表示"0"), 500, 1000, 2000..5000)
const INTERVAL_MIN = 500;
const INTERVAL_MAX = 15000;
const INTERVAL_STEP = 500;
const DURATION_MIN = 0;
const DURATION_MAX = 5000;
const DURATION_STEP = 500;

// スライドショー設定モーダル (§9)。SlideShowOpsPanel に散在していた設定 UI
// (interval / duration / flipX / flipY / 全画面で開始) をモーダルへ分離。
// 開閉は呼び出し側 (AppShell TopBar) の local state。設定値は slideshowStore に集約。
// SlideShowOpsPanel は実質スタートボタンのみに簡素化される。

interface SlideshowSettingsModalProps {
	opened: boolean;
	onClose: () => void;
}

export const SlideshowSettingsModal: FC<SlideshowSettingsModalProps> = ({ opened, onClose }) => {
	const intervalMs = useSlideshowStore((s) => s.intervalMs);
	const durationMs = useSlideshowStore((s) => s.durationMs);
	const flipX = useSlideshowStore((s) => s.flipX);
	const flipY = useSlideshowStore((s) => s.flipY);
	const startFullscreen = useSlideshowStore((s) => s.startFullscreen);
	const setIntervalMs = useSlideshowStore((s) => s.setIntervalMs);
	const setDurationMs = useSlideshowStore((s) => s.setDurationMs);
	const setFlipX = useSlideshowStore((s) => s.setFlipX);
	const setFlipY = useSlideshowStore((s) => s.setFlipY);
	const setStartFullscreen = useSlideshowStore((s) => s.setStartFullscreen);
	// mobile では Fullscreen API が事実上使えない (iOS Safari 非対応 + PWA は既に全画面) ため
	// トグルを隠す。設定値自体は残す (mobile→PC で復帰した時に戻る)。
	const { isMobile } = useDeviceMode();

	return (
		<Modal
			opened={opened}
			onClose={onClose}
			title="スライドショー設定"
			centered
			data-slideshow-settings>
			<Stack gap="md">
				<div data-ss-op="interval">
					<Group gap={4} align="center" mb={4}>
						<Text size="sm">間隔 interval: {intervalMs} ms</Text>
						<ActionIcon
							variant="subtle"
							size="sm"
							onClick={() => setIntervalMs(INTERVAL_DEFAULT_MS)}
							disabled={intervalMs === INTERVAL_DEFAULT_MS}
							aria-label="間隔を既定値に戻す"
							data-ss-op="interval-reset">
							<IconRestore size={14} />
						</ActionIcon>
					</Group>
					<Slider
						value={intervalMs}
						onChange={setIntervalMs}
						min={INTERVAL_MIN}
						max={INTERVAL_MAX}
						step={INTERVAL_STEP}
						label={(v) => `${v} ms`}
						size="sm"
					/>
				</div>
				<div data-ss-op="duration">
					<Group gap={4} align="center" mb={4}>
						<Text size="sm">フェード duration: {durationMs} ms</Text>
						<ActionIcon
							variant="subtle"
							size="sm"
							onClick={() => setDurationMs(DURATION_DEFAULT_MS)}
							disabled={durationMs === DURATION_DEFAULT_MS}
							aria-label="フェードを既定値に戻す"
							data-ss-op="duration-reset">
							<IconRestore size={14} />
						</ActionIcon>
					</Group>
					<Slider
						value={durationMs}
						onChange={setDurationMs}
						min={DURATION_MIN}
						max={DURATION_MAX}
						step={DURATION_STEP}
						label={(v) => `${v} ms`}
						size="sm"
					/>
				</div>
				<Group gap="md">
					<div data-ss-op="flip-x">
						<Switch
							label="左右反転 (flipX)"
							checked={flipX}
							onChange={(e) => setFlipX(e.currentTarget.checked)}
							size="sm"
						/>
					</div>
					<div data-ss-op="flip-y">
						<Switch
							label="上下反転 (flipY)"
							checked={flipY}
							onChange={(e) => setFlipY(e.currentTarget.checked)}
							size="sm"
						/>
					</div>
				</Group>
				{!isMobile && (
					<div data-ss-op="fullscreen">
						<Switch
							label="全画面で開始"
							checked={startFullscreen}
							onChange={(e) => setStartFullscreen(e.currentTarget.checked)}
							size="sm"
						/>
					</div>
				)}
				<Group justify="flex-end" mt="sm">
					<Button onClick={onClose} data-ss-op="ok">
						OK
					</Button>
				</Group>
			</Stack>
		</Modal>
	);
};
