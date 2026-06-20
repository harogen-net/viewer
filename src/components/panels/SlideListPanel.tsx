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
	horizontalListSortingStrategy,
	SortableContext,
	sortableKeyboardCoordinates,
} from "@dnd-kit/sortable";
import { ActionIcon, Group, Paper, ScrollArea, Stack, Text, Title, Tooltip } from "@mantine/core";
import type { FC } from "react";
import { Fragment } from "react";
import { useSlideMutation } from "../../hooks/useSlideMutation";
import { useSlideStore } from "../../state/slideStore";
import { useViewerDocumentStore } from "../../state/viewerDocumentStore";
import { SlideJoinIndicator } from "../slide/SlideJoinIndicator";
import { SortableSlideThumb } from "../slide/SortableSlideThumb";
import { SlideListContextMenu } from "./SlideListContextMenu";

// SlideListPanel (v4 Group C build C-3、C-3R で slide view を slide/ に統合、C-4 で DnD + 前後ボタン、
//                 C-5 で 追加/削除/複製、C-6 でコンテキストメニュー、C-7 後にコンテキスト切出)。
// レガシー src/viewController/ListViewController.ts (jQuery + ThumbSlideView class) は
// import せず新規実装。
//
// 本 FC の責務 (本体ボタン群 + 横スクロール一覧):
//   - 横スクロール ScrollArea + DnD コンテキスト (@dnd-kit)
//   - 前後移動 (◀ ▶) / 追加 (➕) / 複製 (⧉) / 削除 (🗑) ボタン
//   - slides を SortableSlideThumb 列に展開、間に SlideJoinIndicator を挿入
//   - 状態テキスト (N slides / selected: #M)
//   - クリックで store.setSelectedIndex
//   - 並び替えは useSlideMutation.moveSlide 経由 (history 自動記録)
//
// コンテキストメニュー (右クリック → per-slide / 一括操作) は SlideListContextMenu に分離。
// 本 FC は SlideListContextMenu で wrap して onContextMenu を委譲する。

const THUMB_HEIGHT = 110;

export const SlideListPanel: FC = () => {
	const slides = useSlideStore((s) => s.slides);
	const selectedIndex = useSlideStore((s) => s.selectedIndex);
	const setSelectedIndex = useSlideStore((s) => s.setSelectedIndex);
	const meta = useViewerDocumentStore((s) => s.meta);
	const bgColor = meta?.bgColor;
	const { moveSlide, addSlide, duplicateSlide, deleteSlide } = useSlideMutation();

	const isEmpty = slides.length === 0;
	const canMovePrev = selectedIndex > 0;
	const canMoveNext = selectedIndex >= 0 && selectedIndex < slides.length - 1;
	const canAdd = !!meta;
	const canModifySelected = selectedIndex >= 0;

	// DnD sensors: PointerSensor は 8px 移動するまで click 扱い (= サムネクリックで選択が成立)
	const sensors = useSensors(
		useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
		useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
	);

	const handleDragEnd = (event: DragEndEvent): void => {
		const { active, over } = event;
		if (!over || active.id === over.id) return;
		const from = slides.findIndex((s) => s.uuid === active.id);
		const to = slides.findIndex((s) => s.uuid === over.id);
		if (from < 0 || to < 0) return;
		moveSlide(from, to);
	};

	const handleMovePrev = (): void => {
		if (!canMovePrev) return;
		moveSlide(selectedIndex, selectedIndex - 1);
	};
	const handleMoveNext = (): void => {
		if (!canMoveNext) return;
		moveSlide(selectedIndex, selectedIndex + 1);
	};

	const handleAddSlide = (): void => {
		if (!meta) return;
		// legacy ListVC と同じく document の screen 寸法で末尾に追加、追加後選択も切替
		const nextIndex = slides.length;
		addSlide(meta.width, meta.height);
		setSelectedIndex(nextIndex);
	};
	const handleDuplicate = (): void => {
		if (!canModifySelected) return;
		duplicateSlide(selectedIndex);
	};
	const handleDelete = (): void => {
		if (!canModifySelected) return;
		if (!window.confirm(`スライド #${selectedIndex + 1} を削除しますか?`)) return;
		deleteSlide(selectedIndex);
	};

	return (
		<SlideListContextMenu>
			<Paper withBorder p="sm" radius="sm">
				<Stack gap="xs">
					<Group justify="space-between" align="center">
						<Title order={5}>Slide List</Title>
						<Group gap={4}>
							<Tooltip label="前に移動" disabled={!canMovePrev}>
								<ActionIcon
									size="sm"
									variant="default"
									onClick={handleMovePrev}
									disabled={!canMovePrev}
									aria-label="前に移動"
									data-action="move-prev"
								>
									◀
								</ActionIcon>
							</Tooltip>
							<Tooltip label="後ろに移動" disabled={!canMoveNext}>
								<ActionIcon
									size="sm"
									variant="default"
									onClick={handleMoveNext}
									disabled={!canMoveNext}
									aria-label="後ろに移動"
									data-action="move-next"
								>
									▶
								</ActionIcon>
							</Tooltip>
							<Tooltip label="末尾にスライド追加" disabled={!canAdd}>
								<ActionIcon
									size="sm"
									variant="default"
									color="blue"
									onClick={handleAddSlide}
									disabled={!canAdd}
									aria-label="スライド追加"
									data-action="add"
								>
									➕
								</ActionIcon>
							</Tooltip>
							<Tooltip label="選択スライドを複製" disabled={!canModifySelected}>
								<ActionIcon
									size="sm"
									variant="default"
									onClick={handleDuplicate}
									disabled={!canModifySelected}
									aria-label="スライド複製"
									data-action="duplicate"
								>
									⧉
								</ActionIcon>
							</Tooltip>
							<Tooltip label="選択スライドを削除" disabled={!canModifySelected}>
								<ActionIcon
									size="sm"
									variant="default"
									color="red"
									onClick={handleDelete}
									disabled={!canModifySelected}
									aria-label="スライド削除"
									data-action="delete"
								>
									🗑
								</ActionIcon>
							</Tooltip>
						</Group>
					</Group>
					{isEmpty ? (
						<Text size="xs" c="dimmed">
							スライドがありません (document をロード or 新規作成)
						</Text>
					) : (
						<DndContext
							sensors={sensors}
							collisionDetection={closestCenter}
							onDragEnd={handleDragEnd}
							// drag 中の自動スクロールは完全に無効化 (祖先要素に波及してページ縦スクロールが起きるため)。
							// 端まで運ぶ場合はユーザが先に手動スクロールしてからドラッグ。
							autoScroll={false}
						>
							<SortableContext
								items={slides.map((s) => s.uuid)}
								strategy={horizontalListSortingStrategy}
							>
								<ScrollArea type="auto" scrollbarSize={8}>
									<div
										style={{
											display: "flex",
											flexDirection: "row",
											alignItems: "center",
											gap: 4,
											paddingBottom: 4,
											minHeight: THUMB_HEIGHT + 12,
										}}
										data-slide-count={slides.length}
									>
										{slides.map((slide, i) => (
											<Fragment key={slide.uuid}>
												<SortableSlideThumb
													id={slide.uuid}
													slide={slide}
													index={i}
													selected={i === selectedIndex}
													bgColor={bgColor}
													onClick={() => setSelectedIndex(i)}
													thumbHeight={THUMB_HEIGHT}
												/>
												{i < slides.length - 1 && (
													<SlideJoinIndicator joining={slide.joining} />
												)}
											</Fragment>
										))}
									</div>
								</ScrollArea>
							</SortableContext>
						</DndContext>
					)}
					<Text size="xs" c="dimmed" ff="monospace">
						{slides.length} slides
						{selectedIndex >= 0 && ` / selected: #${selectedIndex + 1}`}
					</Text>
				</Stack>
			</Paper>
		</SlideListContextMenu>
	);
};
