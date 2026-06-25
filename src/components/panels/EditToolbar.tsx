import { ActionIcon, Button, Group, Paper, Text, Tooltip } from "@mantine/core";
import type { FC } from "react";
import { useAlert } from "../../hooks/useAlert";
import { useDocumentMutation } from "../../hooks/useDocumentMutation";
import { useLayerClipboard } from "../../hooks/useLayerClipboard";
import { useLayerMutation } from "../../hooks/useLayerMutation";
import { useEditViewStore } from "../../state/editViewStore";
import { useHistoryStore } from "../../state/historyStore";
import { useLayerStore } from "../../state/layerStore";
import { useSlideStore } from "../../state/slideStore";

// 編集キャンバス上部ツールバー (アプリ一般の編集操作シェル)。
// EditOpsPanel から「選択レイヤーに依存しない」操作を分離したもの:
//   - Undo / Redo + 履歴カウンタ (ドキュメント全体の履歴。レイヤー非依存)
//   - ＋テキスト (選択レイヤーではなく現在 slide へのレイヤー新規作成)
//   - rectEdit (矩形連動編集) トグル (編集モードのグローバル切替)
//
// EditOpsPanel は「選択中レイヤーの編集」専用に純化される (§ EditOps シェルの整理)。
// 配置: AppShell EditArea の canvas 上部 (legacy canvas .menu の undo/redo/text/same 相当)。

export const EditToolbar: FC = () => {
	const { undo, redo } = useDocumentMutation();
	const layer = useLayerMutation();
	const clipboard = useLayerClipboard();
	const alert = useAlert();

	const past = useHistoryStore((s) => s.past);
	const future = useHistoryStore((s) => s.future);
	const canUndo = past.length > 0;
	const canRedo = future.length > 0;
	const lastLabel = past.length > 0 ? past[past.length - 1].label : null;

	const selectedLayer = useLayerStore((s) => s.selectedLayer);
	const selectedSlideIndex = useSlideStore((s) => s.selectedIndex);
	const slides = useSlideStore((s) => s.slides);
	const selectedSlide = selectedSlideIndex >= 0 ? slides[selectedSlideIndex] : null;
	const layerIndex =
		selectedSlide && selectedLayer
			? selectedSlide.layers.findIndex((l) => l.uuid === selectedLayer.uuid)
			: -1;
	const hasSelection = layerIndex >= 0;
	const canEditLayer = hasSelection && !(selectedLayer?.locked ?? false);

	const rectEdit = useEditViewStore((s) => s.rectEdit);
	const toggleRectEdit = useEditViewStore((s) => s.toggleRectEdit);

	// テキストレイヤー追加 (legacy `.text` 基準): prompt の初期テキストで追加し、当該 layer を選択。
	const handleAddText = async () => {
		if (!selectedSlide) return;
		const input = await alert.prompt("テキストを入力:", "");
		if (input === null || input === "") return;
		layer.addTextLayer(input, selectedSlide.width, selectedSlide.height);
		const updated = useSlideStore.getState().slides[selectedSlideIndex];
		const added = updated?.layers[updated.layers.length - 1];
		if (added) useLayerStore.getState().setSelectedLayer(added);
	};

	return (
		<Paper withBorder p={6} radius="sm" data-edit-toolbar>
			<Group gap="sm" align="center" wrap="wrap">
				{/* Undo / Redo + 履歴カウンタ */}
				<Group gap={4} align="center">
					<Tooltip label={canUndo && lastLabel ? `Undo: ${lastLabel}` : "Undo"}>
						<ActionIcon
							variant="default"
							onClick={undo}
							disabled={!canUndo}
							data-edit-op="undo"
							aria-label="undo">
							↶
						</ActionIcon>
					</Tooltip>
					<Tooltip label="Redo">
						<ActionIcon
							variant="default"
							onClick={redo}
							disabled={!canRedo}
							data-edit-op="redo"
							aria-label="redo">
							↷
						</ActionIcon>
					</Tooltip>
					<Text size="xs" c="dimmed" ff="monospace">
						{past.length} / {past.length + future.length}
					</Text>
				</Group>

				{/* レイヤー追加 (テキスト) */}
				<Button
					size="xs"
					variant="default"
					onClick={handleAddText}
					disabled={!selectedSlide}
					data-edit-op="add-text">
					＋ テキスト
				</Button>

				{/* 汎用 clipboard: コピー / カット / ペースト (形状コピペは EditOpsPanel) */}
				<Group gap={4} align="center">
					<Tooltip label="コピー (Ctrl+C)">
						<ActionIcon
							variant="default"
							onClick={clipboard.copy}
							disabled={!hasSelection}
							data-edit-op="copy"
							aria-label="copy">
							⧉
						</ActionIcon>
					</Tooltip>
					<Tooltip label="カット (Ctrl+X)">
						<ActionIcon
							variant="default"
							onClick={clipboard.cut}
							disabled={!canEditLayer}
							data-edit-op="cut"
							aria-label="cut">
							✂
						</ActionIcon>
					</Tooltip>
					<Tooltip label="ペースト (Ctrl+V)">
						<ActionIcon
							variant="default"
							onClick={clipboard.paste}
							disabled={!clipboard.canPaste}
							data-edit-op="paste"
							aria-label="paste">
							📋
						</ActionIcon>
					</Tooltip>
				</Group>

				{/* rectEdit (矩形連動編集) トグル */}
				<Tooltip label="矩形連動編集 (rectEdit): 同じ位置・サイズの画像をまとめて変形">
					<ActionIcon
						variant={rectEdit ? "filled" : "default"}
						color={rectEdit ? "blue" : undefined}
						onClick={toggleRectEdit}
						data-edit-op="toggle-rect-edit"
						data-active={rectEdit ? "true" : "false"}
						aria-label="toggle rect edit"
						aria-pressed={rectEdit}>
						▦
					</ActionIcon>
				</Tooltip>
			</Group>
		</Paper>
	);
};
