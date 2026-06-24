import { ActionIcon, Paper, ScrollArea, Stack, Text, Title, Tooltip } from "@mantine/core";
import type { CSSProperties, FC } from "react";
import { useLayerMutation } from "../../hooks/useLayerMutation";
import { useLayerStore } from "../../state/layerStore";
import { useSlideStore } from "../../state/slideStore";
import type { Layer } from "../../types/Layer";
import { LayerType } from "../../types/Layer";

// LayerListPanel (v4 Group D D-5、§0-10 新側内製、Mantine UI)。
// レガシー src/viewController/edit/EditLayerListItem.ts / EditLayerViewController.ts は
// import せず新規実装。
//
// D-5 スコープ (本ファイル):
//   - 選択 slide の layers を縦リスト表示
//   - 表示順は **配列を反転**: 上=前面 (描画順末尾) / 下=背面 (描画順先頭)
//   - 1 row に type アイコン / ラベル / visible/locked/shared インジケータ
//   - クリックで setSelectedLayer (layerStore)
//   - 選択 layer に青枠ハイライト (SlideListPanel と同色)
//
// 後の chunk で追加予定:
//   - D-2: visible/locked toggle, レイヤー削除, レイヤー順序変更などの mutation
//   - D-3: SlideEditView 側の選択枠表示 (本パネルで select → canvas に枠出る)
//   - DnD で順序変更 (D-2 ops + dnd-kit)

// ラベル生成: 種別 + #id + 内容スニペット
const labelOf = (layer: Layer): string => {
	if (layer.name) return `#${layer.id} ${layer.name}`;
	if (layer.type === LayerType.IMAGE) {
		// imageId が長いので先頭 8 文字に縮める
		return `#${layer.id} ${layer.imageId.slice(0, 8)}`;
	}
	// 残り = TextLayer (discriminated union narrowing)
	const snippet = layer.text.slice(0, 20).replace(/\s+/g, " ");
	return `#${layer.id} "${snippet}${layer.text.length > 20 ? "…" : ""}"`;
};

// type アイコン (絵文字、視認用)
const iconOf = (layer: Layer): string => {
	if (layer.type === LayerType.IMAGE) return "🖼";
	return "T";
};

interface LayerRowProps {
	layer: Layer;
	displayIndex: number; // 1-indexed (UI 上の順位、反転表示後)
	selected: boolean;
	onClick: () => void;
}

const LayerRow: FC<LayerRowProps> = ({ layer, displayIndex, selected, onClick }) => {
	const rowStyle: CSSProperties = {
		display: "flex",
		alignItems: "center",
		gap: 6,
		padding: "4px 6px",
		borderRadius: 4,
		cursor: "pointer",
		fontSize: 12,
		fontFamily: "monospace",
		border: selected ? "1px solid #228be6" : "1px solid transparent",
		background: selected ? "rgba(34,139,230,0.08)" : "transparent",
		opacity: layer.visible ? 1 : 0.5,
	};
	const indexBadgeStyle: CSSProperties = {
		minWidth: 20,
		textAlign: "right",
		color: "#868e96",
	};
	const iconStyle: CSSProperties = {
		minWidth: 16,
		textAlign: "center",
	};
	const labelStyle: CSSProperties = {
		flex: 1,
		whiteSpace: "nowrap",
		overflow: "hidden",
		textOverflow: "ellipsis",
	};
	const indicatorStyle: CSSProperties = {
		minWidth: 14,
		textAlign: "center",
		opacity: 0.7,
	};

	return (
		<div
			style={rowStyle}
			data-layer-uuid={layer.uuid}
			data-layer-id={layer.id}
			data-selected={selected ? "true" : "false"}
			onClick={onClick}>
			<span style={indexBadgeStyle}>{displayIndex}</span>
			<span style={iconStyle}>{iconOf(layer)}</span>
			<span style={labelStyle}>{labelOf(layer)}</span>
			{!layer.visible && (
				<span style={indicatorStyle} title="非表示" data-indicator="hidden">
					🚫
				</span>
			)}
			{layer.locked && (
				<span style={indicatorStyle} title="ロック中" data-indicator="locked">
					🔒
				</span>
			)}
			{layer.shared && (
				<span style={indicatorStyle} title="shared" data-indicator="shared">
					🔗
				</span>
			)}
		</div>
	);
};

export const LayerListPanel: FC = () => {
	const layers = useLayerStore((s) => s.layers);
	const selectedLayer = useLayerStore((s) => s.selectedLayer);
	const setSelectedLayer = useLayerStore((s) => s.setSelectedLayer);
	const selectedSlideIndex = useSlideStore((s) => s.selectedIndex);

	const noSlide = selectedSlideIndex < 0;
	const noLayer = !noSlide && layers.length === 0;

	// 配列順 = 描画順 (先頭=背面、末尾=前面)。UI では上=前面に見せる。
	const reversed = [...layers].reverse();

	const layerMutation = useLayerMutation();
	const slides = useSlideStore((s) => s.slides);
	const selectedSlide = selectedSlideIndex >= 0 ? slides[selectedSlideIndex] : null;
	const layerIndex =
		selectedSlide && selectedLayer
			? selectedSlide.layers.findIndex((l) => l.uuid === selectedLayer.uuid)
			: -1;
	const hasSelection = layerIndex >= 0;
	const isLocked = selectedLayer?.locked ?? false;
	const canEditLayer = hasSelection && !isLocked;

	return (
		<Paper withBorder p="sm" radius="sm">
			<Stack gap="xs">
				<Title order={5}>Layer List</Title>
				{/* Layer 順序変更 */}
				<ActionIcon.Group>
					<Tooltip label="最前面">
						<ActionIcon
							variant="default"
							onClick={() => layerMutation.bringToFront(layerIndex)}
							disabled={!canEditLayer}
							data-edit-op="bring-to-front"
							aria-label="bring to front">
							⤒
						</ActionIcon>
					</Tooltip>
					<Tooltip label="1 段上げる">
						<ActionIcon
							variant="default"
							onClick={() => layerMutation.bringForward(layerIndex)}
							disabled={!canEditLayer}
							data-edit-op="bring-forward"
							aria-label="bring forward">
							↑
						</ActionIcon>
					</Tooltip>
					<Tooltip label="1 段下げる">
						<ActionIcon
							variant="default"
							onClick={() => layerMutation.sendBackward(layerIndex)}
							disabled={!canEditLayer}
							data-edit-op="send-backward"
							aria-label="send backward">
							↓
						</ActionIcon>
					</Tooltip>
					<Tooltip label="最背面">
						<ActionIcon
							variant="default"
							onClick={() => layerMutation.sendToBack(layerIndex)}
							disabled={!canEditLayer}
							data-edit-op="send-to-back"
							aria-label="send to back">
							⤓
						</ActionIcon>
					</Tooltip>
				</ActionIcon.Group>
				{noSlide ? (
					<Text size="xs" c="dimmed">
						スライドを選択してください
					</Text>
				) : noLayer ? (
					<Text size="xs" c="dimmed">
						このスライドにはレイヤーがありません
					</Text>
				) : (
					<ScrollArea type="auto" scrollbarSize={8} mah={240}>
						<Stack gap={2} data-layer-count={layers.length}>
							{reversed.map((layer, displayIdx) => (
								<LayerRow
									key={layer.uuid}
									layer={layer}
									displayIndex={displayIdx + 1}
									selected={selectedLayer?.uuid === layer.uuid}
									onClick={() => setSelectedLayer(layer)}
								/>
							))}
						</Stack>
					</ScrollArea>
				)}
				<Text size="xs" c="dimmed" ff="monospace">
					{layers.length} layers
					{selectedLayer && ` / selected: ${labelOf(selectedLayer)}`}
				</Text>
			</Stack>
		</Paper>
	);
};
