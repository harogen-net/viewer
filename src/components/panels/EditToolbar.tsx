import { ActionIcon, Button, Divider, Group, Text, Tooltip } from "@mantine/core";
import type { FC } from "react";
import { useAlert } from "../../hooks/useAlert";
import { useDocumentMutation } from "../../hooks/useDocumentMutation";
import { useFileIO } from "../../hooks/useFileIO";
import { useLayerClipboard } from "../../hooks/useLayerClipboard";
import { useLayerDelete } from "../../hooks/useLayerDelete";
import { useLayerMutation } from "../../hooks/useLayerMutation";
import { useEditViewStore } from "../../state/editViewStore";
import { useHistoryStore } from "../../state/historyStore";
import { useLayerStore } from "../../state/layerStore";
import { useSlideStore } from "../../state/slideStore";
import { useViewerDocumentStore } from "../../state/viewerDocumentStore";
import { collectImageMap } from "../../utils/collectImageMap";
import type { AlignEdge } from "../../utils/layerOps";

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
	const { exportSlidePng } = useFileIO();
	const alert = useAlert();
	const meta = useViewerDocumentStore((s) => s.meta);

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

	// 選択レイヤー操作のうち「数値を伴わない」もの (複製/削除/spread/回転±90/フィット/整列) は
	// EditOpsPanel から本ツールバーへ移設 (EditOpsPanel は数値編集 + リセット系に純化)。
	const deleteLayer = useLayerDelete();

	// fit / align は wrapper の content size を実測する必要がある (edit canvas の scaled 配下に限定)。
	const measureContentSize = (): { w: number; h: number } | null => {
		if (!selectedLayer) return null;
		const wrapper = document.querySelector<HTMLElement>(
			`[data-slide-edit-scaled] [data-layer-id="${selectedLayer.id}"]`
		);
		if (!wrapper) return null;
		const w = wrapper.offsetWidth;
		const h = wrapper.offsetHeight;
		if (w <= 0 || h <= 0) return null;
		return { w, h };
	};

	const handleSpread = async () => {
		if (!hasSelection) return;
		const ok = await alert.confirm(
			"選択レイヤーを前後の連続スライドへ展開 (shared 化) します。よろしいですか?"
		);
		if (!ok) return;
		layer.spreadLayer(layerIndex);
	};
	const handleRemove = () => {
		if (!canEditLayer) return;
		void deleteLayer(layerIndex);
	};
	const handleFit = () => {
		if (!selectedLayer || !selectedSlide || layerIndex < 0) return;
		const size = measureContentSize();
		if (!size) return;
		layer.fitToSlide(layerIndex, selectedSlide.width, selectedSlide.height, size.w, size.h);
	};
	const handleAlign = (edge: AlignEdge) => {
		if (!selectedLayer || !selectedSlide || layerIndex < 0) return;
		const size = measureContentSize();
		if (!size) return;
		layer.alignTo(layerIndex, edge, selectedSlide.width, selectedSlide.height, size.w, size.h);
	};

	// 選択中スライドを native 寸法 PNG で書き出す (§4、背景は doc.bgColor)。
	const handleExportSlidePng = async () => {
		if (!meta || selectedSlideIndex < 0) return;
		try {
			await exportSlidePng({ ...meta, slides }, collectImageMap(), selectedSlideIndex);
		} catch (e) {
			console.error("[EditToolbar] export slide png error:", e);
		}
	};

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
		<Group data-edit-toolbar role="toolbar" gap="sm" align="center" wrap="wrap">
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

				<Divider orientation="vertical" />

				{/* 選択レイヤー操作 (数値を伴わないもの。EditOpsPanel から移設)。 */}
				{/* 複製 / 削除 / spread */}
				<Group gap={4} align="center">
					<Tooltip label="複製">
						<ActionIcon
							variant="default"
							onClick={() => layer.duplicateLayer(layerIndex)}
							disabled={!canEditLayer}
							data-edit-op="duplicate"
							aria-label="duplicate">
							⎘
						</ActionIcon>
					</Tooltip>
					<Tooltip label="削除">
						<ActionIcon
							variant="default"
							color="red"
							onClick={handleRemove}
							disabled={!canEditLayer}
							data-edit-op="remove"
							aria-label="remove">
							✕
						</ActionIcon>
					</Tooltip>
					<Tooltip label="全スライドへ展開 (spread)">
						<ActionIcon
							variant="default"
							onClick={handleSpread}
							disabled={!hasSelection}
							data-edit-op="spread"
							aria-label="spread">
							⇉
						</ActionIcon>
					</Tooltip>
				</Group>

				{/* 回転 ±90° (リセットは EditOpsPanel に残留) */}
				<Group gap={4} align="center">
					<Tooltip label="左に 90°">
						<ActionIcon
							variant="default"
							onClick={() => layer.rotateBy(layerIndex, -90)}
							disabled={!canEditLayer}
							data-edit-op="rotate-left"
							aria-label="rotate left 90">
							↺
						</ActionIcon>
					</Tooltip>
					<Tooltip label="右に 90°">
						<ActionIcon
							variant="default"
							onClick={() => layer.rotateBy(layerIndex, 90)}
							disabled={!canEditLayer}
							data-edit-op="rotate-right"
							aria-label="rotate right 90">
							↻
						</ActionIcon>
					</Tooltip>
				</Group>

				{/* slide フィット */}
				<Tooltip label="slide にフィット (中央配置、scale1↔scale2 toggle)">
					<ActionIcon
						variant="default"
						onClick={handleFit}
						disabled={!canEditLayer || !selectedSlide}
						data-edit-op="fit"
						aria-label="fit to slide">
						⛶
					</ActionIcon>
				</Tooltip>

				{/* 位置揃え (上/右/下/左) */}
				<ActionIcon.Group>
					<Tooltip label="上端揃え">
						<ActionIcon
							variant="default"
							onClick={() => handleAlign("top")}
							disabled={!canEditLayer || !selectedSlide}
							data-edit-op="align-top"
							aria-label="align top">
							↥
						</ActionIcon>
					</Tooltip>
					<Tooltip label="右端揃え">
						<ActionIcon
							variant="default"
							onClick={() => handleAlign("right")}
							disabled={!canEditLayer || !selectedSlide}
							data-edit-op="align-right"
							aria-label="align right">
							↦
						</ActionIcon>
					</Tooltip>
					<Tooltip label="下端揃え">
						<ActionIcon
							variant="default"
							onClick={() => handleAlign("bottom")}
							disabled={!canEditLayer || !selectedSlide}
							data-edit-op="align-bottom"
							aria-label="align bottom">
							↧
						</ActionIcon>
					</Tooltip>
					<Tooltip label="左端揃え">
						<ActionIcon
							variant="default"
							onClick={() => handleAlign("left")}
							disabled={!canEditLayer || !selectedSlide}
							data-edit-op="align-left"
							aria-label="align left">
							↤
						</ActionIcon>
					</Tooltip>
				</ActionIcon.Group>

				<Divider orientation="vertical" />

				{/* スライド PNG ダウンロード (slide 単位、レイヤー非依存。FileIOPanel から移設) */}
				<Tooltip label="選択中スライドを PNG 画像で保存">
					<ActionIcon
						variant="default"
						onClick={handleExportSlidePng}
						disabled={!selectedSlide}
						data-edit-op="export-slide-png"
						aria-label="export slide png">
						🖼
					</ActionIcon>
				</Tooltip>
			</Group>
		</Group >
	);
};
