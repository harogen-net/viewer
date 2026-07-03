import { useLayerDelete } from "@/hooks/useLayerDelete";
import { useLayerMutation } from "@/hooks/useLayerMutation";
import { useLayerStore } from "@/state/layerStore";
import { useSlideStore } from "@/state/slideStore";
import type { Layer } from "@/types/Layer";
import { LayerType } from "@/types/Layer";
import {
	closestCenter,
	DndContext,
	type DragEndEvent,
	KeyboardSensor,
	PointerSensor,
	useSensor,
	useSensors,
} from "@dnd-kit/core";
import {
	SortableContext,
	sortableKeyboardCoordinates,
	useSortable,
	verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Button, Paper, ScrollArea, Stack, Text, Tooltip } from "@mantine/core";
import type { CSSProperties, FC } from "react";

// LayerListPanel (v4 Group D D-5、§0-10 新側内製、Mantine UI)。
// レガシー src/viewController/edit/EditLayerListItem.ts / EditLayerViewController.ts は
// import せず新規実装。
//
// D-5 スコープ (本ファイル):
//   - 選択 slide の layers を縦リスト表示
//   - 表示順は **配列を反転**: 上=前面 (描画順末尾) / 下=背面 (描画順先頭)
//   - 1 row に type アイコン / ラベル / visible/locked/shared トグル (D-19)
//   - クリックで setSelectedLayer (layerStore)
//   - 選択 layer に青枠ハイライト (SlideListPanel と同色)
//   - 順序変更 (bring/send) は選択 layer 対象 (上部ボタン群)
//
// D-19 (§7「レイヤー可視/ロック (UI 経由)」+ shared):
//   - 各行の visible / locked / shared を行内トグルで切替 (updateLayer 経由 = 1 履歴)
//   - shared 層の visible/locked は連動更新で兄弟へ伝播 (withLayerSync、locked 行でも操作可)

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
	selected: boolean;
	onClick: () => void;
	onToggleVisible: () => void;
	onToggleLocked: () => void;
	onToggleShared: () => void;
	onDelete: () => void;
}

// レガシー EditLayerListItem の行構成に寄せる:
//   [種類アイコン] [状態トグル列 (visible / locked / shared)] [名前] [削除ボタン]
const LayerRow: FC<LayerRowProps> = ({
	layer,
	selected,
	onClick,
	onToggleVisible,
	onToggleLocked,
	onToggleShared,
	onDelete,
}) => {
	const rowStyle: CSSProperties = {
		display: "flex",
		alignItems: "center",
		gap: 6,
		padding: "4px 6px",
		borderRadius: 4,
		// ロック済みは選択不可なので pointer カーソルにしない。
		cursor: layer.locked ? "default" : "pointer",
		fontSize: 12,
		fontFamily: "monospace",
		border: selected ? "1px solid #228be6" : "1px solid transparent",
		background: selected ? "rgba(34,139,230,0.08)" : "transparent",
		opacity: layer.visible ? 1 : 0.5,
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
	// 行内トグルボタン (visible / locked / shared)。on=有効時に不透明、off で淡色。
	const toggleBtnStyle = (on: boolean): CSSProperties => ({
		minWidth: 18,
		height: 18,
		lineHeight: "16px",
		textAlign: "center",
		padding: 0,
		border: "none",
		background: "transparent",
		cursor: "pointer",
		fontSize: 12,
		opacity: on ? 1 : 0.28,
	});
	const deleteBtnStyle: CSSProperties = {
		minWidth: 18,
		height: 18,
		lineHeight: "16px",
		textAlign: "center",
		padding: 0,
		border: "none",
		background: "transparent",
		cursor: "pointer",
		fontSize: 12,
		color: "#e03131",
	};
	// 行 onClick (選択) を起こさないよう stopPropagation してからトグル/削除を実行。
	const stop = (fn: () => void) => (e: { stopPropagation: () => void }) => {
		e.stopPropagation();
		fn();
	};

	return (
		<div
			style={rowStyle}
			data-layer-uuid={layer.uuid}
			data-layer-id={layer.id}
			data-selected={selected ? "true" : "false"}
			onClick={onClick}>
			{/* 種類アイコン */}
			<span style={iconStyle}>{iconOf(layer)}</span>
			{/* 状態トグル列 */}
			<button
				type="button"
				style={toggleBtnStyle(layer.visible)}
				title={layer.visible ? "表示中 (クリックで非表示)" : "非表示 (クリックで表示)"}
				data-toggle="visible"
				data-on={layer.visible ? "true" : "false"}
				aria-label="toggle visible"
				onClick={stop(onToggleVisible)}>
				{layer.visible ? "👁" : "🚫"}
			</button>
			<button
				type="button"
				style={toggleBtnStyle(layer.locked)}
				title={layer.locked ? "ロック中 (クリックで解除)" : "未ロック (クリックでロック)"}
				data-toggle="locked"
				data-on={layer.locked ? "true" : "false"}
				aria-label="toggle locked"
				onClick={stop(onToggleLocked)}>
				{layer.locked ? "🔒" : "🔓"}
			</button>
			<button
				type="button"
				style={toggleBtnStyle(layer.shared)}
				title={layer.shared ? "shared (クリックで解除)" : "非 shared (クリックで shared 化)"}
				data-toggle="shared"
				data-on={layer.shared ? "true" : "false"}
				aria-label="toggle shared"
				onClick={stop(onToggleShared)}>
				🔗
			</button>
			{/* 名前 */}
			<span style={labelStyle}>{labelOf(layer)}</span>
			{/* 削除ボタン (レガシー: その slide からこの layer を削除) */}
			<button
				type="button"
				style={deleteBtnStyle}
				title="このレイヤーを削除"
				data-toggle="delete"
				aria-label="delete layer"
				onClick={stop(onDelete)}>
				🗑
			</button>
		</div>
	);
};

// LayerRow を dnd-kit/sortable でラップする薄いブリッジ。
// listeners は行全体に付与 (PointerSensor distance:8 でクリック=選択/トグルと両立)。
const SortableLayerRow: FC<LayerRowProps> = (props) => {
	const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
		id: props.layer.uuid,
	});
	const style: CSSProperties = {
		transform: CSS.Transform.toString(transform),
		transition,
		opacity: isDragging ? 0.4 : 1,
		touchAction: "none",
	};
	return (
		<div
			ref={setNodeRef}
			style={style}
			{...attributes}
			{...listeners}
			data-sortable-layer={props.layer.uuid}>
			<LayerRow {...props} />
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
	// 行削除は EditOpsPanel と同一の shared 連鎖確認ロジックを共有。
	const deleteLayer = useLayerDelete();
	const slides = useSlideStore((s) => s.slides);
	const selectedSlide = selectedSlideIndex >= 0 ? slides[selectedSlideIndex] : null;
	const layerIndex =
		selectedSlide && selectedLayer
			? selectedSlide.layers.findIndex((l) => l.uuid === selectedLayer.uuid)
			: -1;
	const hasSelection = layerIndex >= 0;
	const isLocked = selectedLayer?.locked ?? false;
	const canEditLayer = hasSelection && !isLocked;

	// DnD sensors: PointerSensor は 8px 移動するまで click 扱い (= 行クリックで選択/トグルが成立)。
	const sensors = useSensors(
		useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
		useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
	);

	// reversed 表示でドラッグするが、reorderLayer は実 index 直接でよい
	// (reorderLayer は splice+splice の arrayMove 互換なので、from/to を実 index で渡せば
	//  表示の入れ替えと一致する)。
	const handleDragEnd = (event: DragEndEvent): void => {
		const { active, over } = event;
		if (!over || active.id === over.id) return;
		const from = layers.findIndex((l) => l.uuid === active.id);
		const to = layers.findIndex((l) => l.uuid === over.id);
		if (from < 0 || to < 0) return;
		layerMutation.reorderLayer(from, to);
	};

	return (
		// レール半分 (5:5) を埋める。Title/順序ボタンは固定、リスト部のみ内部スクロール。
		<Paper
			withBorder
			p="sm"
			radius="sm"
			style={{ flex: 1, minHeight: 0, display: "flex", flexDirection: "column" }}>
			<Stack gap="xs" style={{ flex: 1, minHeight: 0 }}>
				{/* Layer 順序変更 */}
				<Button.Group style={{ width: "100%" }} >
					<Tooltip label="最前面">
						<Button
							variant="default"
							size="compact-sm"
							onClick={() => layerMutation.bringToFront(layerIndex)}
							disabled={!canEditLayer}
							data-edit-op="bring-to-front"
							aria-label="bring to front">
							⤒
						</Button>
					</Tooltip>
					<Tooltip label="1 段上げる">
						<Button
							variant="default"
							size="compact-sm"
							style={{ flex: 1 }}
							onClick={() => layerMutation.bringForward(layerIndex)}
							disabled={!canEditLayer}
							data-edit-op="bring-forward"
							aria-label="bring forward">
							↑
						</Button>
					</Tooltip>
					<Tooltip label="1 段下げる">
						<Button
							variant="default"
							size="compact-sm"
							style={{ flex: 1 }}
							onClick={() => layerMutation.sendBackward(layerIndex)}
							disabled={!canEditLayer}
							data-edit-op="send-backward"
							aria-label="send backward">
							↓
						</Button>
					</Tooltip>
					<Tooltip label="最背面">
						<Button
							variant="default"
							size="compact-sm"
							onClick={() => layerMutation.sendToBack(layerIndex)}
							disabled={!canEditLayer}
							data-edit-op="send-to-back"
							aria-label="send to back">
							⤓
						</Button>
					</Tooltip>
				</Button.Group>
				{noSlide ? (
					<Text size="xs" c="dimmed">
						スライドを選択してください
					</Text>
				) : noLayer ? (
					<Text size="xs" c="dimmed">
						このスライドにはレイヤーがありません
					</Text>
				) : (
					<ScrollArea type="auto" scrollbarSize={8} style={{ flex: 1, minHeight: 0 }}>
						<DndContext
							sensors={sensors}
							collisionDetection={closestCenter}
							onDragEnd={handleDragEnd}>
							<SortableContext
								items={reversed.map((l) => l.uuid)}
								strategy={verticalListSortingStrategy}>
								<Stack gap={2} data-layer-count={layers.length}>
									{reversed.map((layer, displayIdx) => {
										// reversed 表示なので slide.layers 内の実 index は末尾からの距離。
										const realIndex = layers.length - 1 - displayIdx;
										return (
											<SortableLayerRow
												key={layer.uuid}
												layer={layer}
												selected={selectedLayer?.uuid === layer.uuid}
												onClick={() => {
													// ロック済みレイヤーは選択不可 (canvas の pointer-events:none と整合)。
													if (!layer.locked) setSelectedLayer(layer);
												}}
												onToggleVisible={() =>
													layerMutation.updateLayer(realIndex, { visible: !layer.visible })
												}
												onToggleLocked={() => {
													const willLock = !layer.locked;
													layerMutation.updateLayer(realIndex, { locked: willLock });
													// ロックしたら選択を解除する (locked は選択対象外)。
													if (willLock && selectedLayer?.uuid === layer.uuid) {
														setSelectedLayer(null);
													}
												}}
												onToggleShared={() =>
													layerMutation.updateLayer(realIndex, { shared: !layer.shared })
												}
												onDelete={() => void deleteLayer(realIndex)}
											/>
										);
									})}
								</Stack>
							</SortableContext>
						</DndContext>
					</ScrollArea>
				)}
			</Stack>
		</Paper>
	);
};
