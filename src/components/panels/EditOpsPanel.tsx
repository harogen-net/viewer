import { ActionIcon, Group, Paper, Slider, Stack, Text, Title, Tooltip } from "@mantine/core";
import type { FC } from "react";
import { useDocumentMutation } from "../../hooks/useDocumentMutation";
import { useLayerMutation } from "../../hooks/useLayerMutation";
import { useHistoryStore } from "../../state/historyStore";
import { useLayerStore } from "../../state/layerStore";
import { useSlideStore } from "../../state/slideStore";

// EditOpsPanel (v4 Group D D-4a、§0-10 新側内製、Mantine UI)。
// レガシー src/viewController/EditViewController.ts (446 行 jQuery) は import せず新規実装。
//
// D-4a スコープ:
//   - undo / redo ボタン (`useDocumentMutation.undo/redo`, `canUndo/canRedo`)
//   - layer 順序変更 (bringToFront / bringForward / sendBackward / sendToBack)
//   - layer 削除 (removeLayer)
//   - layer 複製 (duplicateLayer)
//   - 透明度スライダー (opacity 0-1, updateLayer)
//
// 後の chunk:
//   - D-4b: 回転 (±90°) / 反転 (mirrorH/V) / フィット配置 / 位置揃え
//   - D-8: カット/コピー/ペースト (keyboard shortcut とセット)
//
// 配置: AppShell の右側 rail 内、LayerListPanel の上。

// useLayerMutation の facade は layer index を受け取るため、selectedLayer の現在 index を求めて渡す。
// (LayerListPanel と異なり、こちらは index を直接 prop で受け取らないので毎回 findIndex する)

export const EditOpsPanel: FC = () => {
	const { undo, redo } = useDocumentMutation();
	const layer = useLayerMutation();
	const past = useHistoryStore((s) => s.past);
	const future = useHistoryStore((s) => s.future);
	const canUndo = past.length > 0;
	const canRedo = future.length > 0;
	const lastLabel = past.length > 0 ? past[past.length - 1].label : null;

	const selectedLayer = useLayerStore((s) => s.selectedLayer);
	const selectedSlideIndex = useSlideStore((s) => s.selectedIndex);
	const slides = useSlideStore((s) => s.slides);
	const selectedSlide = selectedSlideIndex >= 0 ? slides[selectedSlideIndex] : null;
	const layerIndex = selectedSlide && selectedLayer
		? selectedSlide.layers.findIndex((l) => l.uuid === selectedLayer.uuid)
		: -1;
	const hasSelection = layerIndex >= 0;
	const isLocked = selectedLayer?.locked ?? false;
	const canEditLayer = hasSelection && !isLocked;

	// 透明度は 0-100 の slider にする (Mantine の Slider は数値変換が楽)。
	const opacityPercent = Math.round((selectedLayer?.opacity ?? 1) * 100);
	const handleOpacityChange = (value: number) => {
		if (layerIndex < 0) return;
		const next = Math.max(0, Math.min(1, value / 100));
		// 値変化なしの場合は layerOps.updateLayer が null を返し no-op + history 記録なし
		layer.updateLayer(layerIndex, { opacity: next });
	};

	return (
		<Paper withBorder p="sm" radius="sm">
			<Stack gap="xs">
				<Title order={5}>Edit Ops</Title>

				{/* Undo / Redo */}
				<Group gap={4}>
					<Tooltip label={canUndo && lastLabel ? `Undo: ${lastLabel}` : "Undo"}>
						<ActionIcon
							variant="default"
							onClick={undo}
							disabled={!canUndo}
							data-edit-op="undo"
							aria-label="undo"
						>
							↶
						</ActionIcon>
					</Tooltip>
					<Tooltip label="Redo">
						<ActionIcon
							variant="default"
							onClick={redo}
							disabled={!canRedo}
							data-edit-op="redo"
							aria-label="redo"
						>
							↷
						</ActionIcon>
					</Tooltip>
					<Text size="xs" c="dimmed" ff="monospace">
						{past.length} / {past.length + future.length}
					</Text>
				</Group>

				{/* Layer 順序変更 */}
				<Group gap={4}>
					<Tooltip label="最前面">
						<ActionIcon
							variant="default"
							onClick={() => layer.bringToFront(layerIndex)}
							disabled={!canEditLayer}
							data-edit-op="bring-to-front"
							aria-label="bring to front"
						>
							⤒
						</ActionIcon>
					</Tooltip>
					<Tooltip label="1 段上げる">
						<ActionIcon
							variant="default"
							onClick={() => layer.bringForward(layerIndex)}
							disabled={!canEditLayer}
							data-edit-op="bring-forward"
							aria-label="bring forward"
						>
							↑
						</ActionIcon>
					</Tooltip>
					<Tooltip label="1 段下げる">
						<ActionIcon
							variant="default"
							onClick={() => layer.sendBackward(layerIndex)}
							disabled={!canEditLayer}
							data-edit-op="send-backward"
							aria-label="send backward"
						>
							↓
						</ActionIcon>
					</Tooltip>
					<Tooltip label="最背面">
						<ActionIcon
							variant="default"
							onClick={() => layer.sendToBack(layerIndex)}
							disabled={!canEditLayer}
							data-edit-op="send-to-back"
							aria-label="send to back"
						>
							⤓
						</ActionIcon>
					</Tooltip>
				</Group>

				{/* 複製 / 削除 */}
				<Group gap={4}>
					<Tooltip label="複製">
						<ActionIcon
							variant="default"
							onClick={() => layer.duplicateLayer(layerIndex)}
							disabled={!canEditLayer}
							data-edit-op="duplicate"
							aria-label="duplicate"
						>
							⎘
						</ActionIcon>
					</Tooltip>
					<Tooltip label="削除">
						<ActionIcon
							variant="default"
							color="red"
							onClick={() => layer.removeLayer(layerIndex)}
							disabled={!canEditLayer}
							data-edit-op="remove"
							aria-label="remove"
						>
							✕
						</ActionIcon>
					</Tooltip>
				</Group>

				{/* 透明度 */}
				<Stack gap={2} data-edit-op-group="opacity">
					<Group gap={6} justify="space-between">
						<Text size="xs" c="dimmed">
							透明度
						</Text>
						<Text size="xs" ff="monospace">
							{opacityPercent}%
						</Text>
					</Group>
					<Slider
						value={opacityPercent}
						onChange={handleOpacityChange}
						disabled={!canEditLayer}
						min={0}
						max={100}
						step={1}
						label={null}
						data-edit-op="opacity"
					/>
				</Stack>

				{!hasSelection && (
					<Text size="xs" c="dimmed">
						レイヤーを選択してください
					</Text>
				)}
				{hasSelection && isLocked && (
					<Text size="xs" c="dimmed">
						このレイヤーはロックされています
					</Text>
				)}
			</Stack>
		</Paper>
	);
};
