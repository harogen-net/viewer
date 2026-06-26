import { Group, Modal, NumberInput, Stack, Switch } from "@mantine/core";
import type { FC } from "react";
import { useSlideshowStore } from "../../state/slideshowStore";

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

	return (
		<Modal
			opened={opened}
			onClose={onClose}
			title="スライドショー設定"
			centered
			data-slideshow-settings>
			<Stack gap="md">
				<Group gap="xs" grow>
					<div data-ss-op="interval">
						<NumberInput
							label="間隔 interval (ms)"
							value={intervalMs}
							onChange={(v) => setIntervalMs(typeof v === "number" ? v : Number(v) || 0)}
							min={0}
							step={500}
							size="sm"
						/>
					</div>
					<div data-ss-op="duration">
						<NumberInput
							label="フェード duration (ms)"
							value={durationMs}
							onChange={(v) => setDurationMs(typeof v === "number" ? v : Number(v) || 0)}
							min={0}
							step={100}
							size="sm"
						/>
					</div>
				</Group>
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
				<div data-ss-op="fullscreen">
					<Switch
						label="全画面で開始"
						checked={startFullscreen}
						onChange={(e) => setStartFullscreen(e.currentTarget.checked)}
						size="sm"
					/>
				</div>
			</Stack>
		</Modal>
	);
};
