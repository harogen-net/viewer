import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import type { CSSProperties, FC } from "react";
import { SlideThumbView } from "./SlideThumbView";
import type { SlideViewProps } from "./SlideView";

// SortableSlideThumb (v4 Group C C-4、§0-10 新側内製)。
// SlideThumbView を dnd-kit/sortable でラップする薄いブリッジ FC。
//
// 設計方針 (C-3R で確立した責務分離の継続):
//   - SlideView      = 描画コア (dnd 知らない)
//   - SlideThumbView = thumb 装飾 + scale + click (dnd 知らない)
//   - SortableSlideThumb = DnD wiring のみ (本 FC)
//
// SortableContext 配下で render される前提。親 SlideListPanel が DndContext +
// SortableContext を提供する。

interface SortableSlideThumbProps extends SlideViewProps {
	/** SortableContext に渡す item id (slide.uuid を渡す)。 */
	id: string;
	index: number;
	selected: boolean;
	onClick: () => void;
	onDoubleClick?: () => void;
	onEdit?: () => void;
	onDuplicate?: () => void;
	onDelete?: () => void;
	onSetDuration: (ratio: number) => void;
	onToggleJoining: () => void;
	onToggleDisabled: () => void;
	thumbHeight?: number;
}

export const SortableSlideThumb: FC<SortableSlideThumbProps> = ({
	id,
	slide,
	bgColor,
	index,
	selected,
	onClick,
	onDoubleClick,
	onEdit,
	onDuplicate,
	onDelete,
	onSetDuration,
	onToggleJoining,
	onToggleDisabled,
	thumbHeight,
}) => {
	const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
		id,
	});

	const style: CSSProperties = {
		transform: CSS.Transform.toString(transform),
		transition,
		// ドラッグ中の元位置は半透明表示
		opacity: isDragging ? 0.4 : 1,
		// flex item 寸法は SlideThumbView 内側に従う
		flex: "0 0 auto",
		// activationConstraint で 8px 移動するまでは click 扱いになる (sensor 設定参照)
		touchAction: "none",
	};

	return (
		<div ref={setNodeRef} style={style} {...attributes} {...listeners} data-sortable-id={id}>
			<SlideThumbView
				slide={slide}
				bgColor={bgColor}
				index={index}
				selected={selected}
				onClick={onClick}
				onDoubleClick={onDoubleClick}
				onEdit={onEdit}
				onDuplicate={onDuplicate}
				onDelete={onDelete}
				onSetDuration={onSetDuration}
				onToggleJoining={onToggleJoining}
				onToggleDisabled={onToggleDisabled}
				thumbHeight={thumbHeight}
			/>
		</div>
	);
};
