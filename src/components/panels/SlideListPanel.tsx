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
import { ActionIcon, Group, Menu, Paper, ScrollArea, Stack, Text, Title, Tooltip } from "@mantine/core";
import type { FC, MouseEvent as ReactMouseEvent } from "react";
import { Fragment, useState } from "react";
import { useSlideMutation } from "../../hooks/useSlideMutation";
import { useSlideStore } from "../../state/slideStore";
import { useViewerDocumentStore } from "../../state/viewerDocumentStore";
import { SlideJoinIndicator } from "../slide/SlideJoinIndicator";
import { SortableSlideThumb } from "../slide/SortableSlideThumb";

// SlideListPanel (v4 Group C build C-3、C-3R で slide view を slide/ に統合、C-4 で DnD + 前後ボタン)。
// レガシー src/viewController/ListViewController.ts (jQuery + ThumbSlideView class) は
// import せず新規実装。
//
// 本 FC の責務:
//   - 横スクロール ScrollArea + DnD コンテキスト (@dnd-kit)
//   - 前後移動ボタン (← →) で選択スライドを 1 つ前後に動かす
//   - slides を SortableSlideThumb 列に展開、間に SlideJoinIndicator を挿入
//   - 状態テキスト (N slides / selected: #M)
//   - クリックで store.setSelectedIndex
//   - 並び替えは useSlideMutation.moveSlide 経由 (history 自動記録)

const THUMB_HEIGHT = 110;

export const SlideListPanel: FC = () => {
	const slides = useSlideStore((s) => s.slides);
	const selectedIndex = useSlideStore((s) => s.selectedIndex);
	const setSelectedIndex = useSlideStore((s) => s.setSelectedIndex);
	const meta = useViewerDocumentStore((s) => s.meta);
	const bgColor = meta?.bgColor;
	const {
		moveSlide,
		addSlide,
		duplicateSlide,
		deleteSlide,
		setSlideJoining,
		setSlideDisabled,
		setAllJoining,
		setAllDisabled,
		deleteAllDisabled,
	} = useSlideMutation();

	const isEmpty = slides.length === 0;
	const canMovePrev = selectedIndex > 0;
	const canMoveNext = selectedIndex >= 0 && selectedIndex < slides.length - 1;
	const canAdd = !!meta;
	const canModifySelected = selectedIndex >= 0;

	// コンテキストメニュー状態。targetIndex = null はパネル背景を右クリック (一括操作のみ)、
	// targetIndex 有りは特定 slide を右クリック (per-slide + 一括操作)。
	const [ctxMenu, setCtxMenu] = useState<
		{ x: number; y: number; targetIndex: number | null } | null
	>(null);
	const closeCtxMenu = (): void => setCtxMenu(null);

	const targetSlide =
		ctxMenu?.targetIndex != null ? slides[ctxMenu.targetIndex] ?? null : null;
	const allJoined = slides.length > 0 && slides.every((s) => s.joining);
	const hasDisabled = slides.some((s) => s.disabled);

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

	// --- context menu handlers ---
	const handleContextMenu = (e: ReactMouseEvent<HTMLDivElement>): void => {
		if (slides.length === 0) return; // 空 list ではメニューを出さない (legacy 互換)
		const el = (e.target as HTMLElement).closest<HTMLElement>("[data-slide-index]");
		const targetIndex = el ? Number(el.getAttribute("data-slide-index")) : null;
		e.preventDefault();
		setCtxMenu({ x: e.clientX, y: e.clientY, targetIndex });
	};
	const handleToggleSlideJoining = (): void => {
		if (!targetSlide || ctxMenu?.targetIndex == null) return;
		setSlideJoining(ctxMenu.targetIndex, !targetSlide.joining);
	};
	const handleToggleSlideDisabled = (): void => {
		if (!targetSlide || ctxMenu?.targetIndex == null) return;
		setSlideDisabled(ctxMenu.targetIndex, !targetSlide.disabled);
	};
	const handleDuplicateTarget = (): void => {
		if (ctxMenu?.targetIndex == null) return;
		duplicateSlide(ctxMenu.targetIndex);
	};
	const handleDeleteTarget = (): void => {
		if (ctxMenu?.targetIndex == null) return;
		if (!window.confirm(`スライド #${ctxMenu.targetIndex + 1} を削除しますか?`)) return;
		deleteSlide(ctxMenu.targetIndex);
	};
	const handleToggleAllJoining = (): void => setAllJoining(!allJoined);
	const handleEnableAll = (): void => setAllDisabled(false);
	const handleDisableAll = (): void => setAllDisabled(true);
	const handleDeleteAllDisabled = (): void => {
		if (!window.confirm("無効スライドをすべて削除しますか?")) return;
		deleteAllDisabled();
	};

	return (
		<Paper withBorder p="sm" radius="sm" onContextMenu={handleContextMenu}>
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
			{/* コンテキストメニュー: 仮想ターゲットを fixed 位置に配して右クリック位置に出す */}
			<Menu
				opened={ctxMenu !== null}
				onClose={closeCtxMenu}
				position="bottom-start"
				withinPortal
				shadow="md"
				transitionProps={{ duration: 0 }}
			>
				<Menu.Target>
					<div
						aria-hidden
						style={{
							position: "fixed",
							left: ctxMenu?.x ?? 0,
							top: ctxMenu?.y ?? 0,
							width: 1,
							height: 1,
							pointerEvents: "none",
						}}
					/>
				</Menu.Target>
				<Menu.Dropdown data-context-menu="slide-list">
					{targetSlide && ctxMenu?.targetIndex != null && (
						<>
							<Menu.Label>スライド #{ctxMenu.targetIndex + 1}</Menu.Label>
							<Menu.Item
								onClick={handleToggleSlideJoining}
								data-ctx-action="toggle-joining"
							>
								{targetSlide.joining ? "結合解除" : "結合"}
							</Menu.Item>
							<Menu.Item
								onClick={handleToggleSlideDisabled}
								data-ctx-action="toggle-disabled"
							>
								{targetSlide.disabled ? "有効化" : "無効化"}
							</Menu.Item>
							<Menu.Item
								onClick={handleDuplicateTarget}
								data-ctx-action="duplicate-target"
							>
								複製
							</Menu.Item>
							<Menu.Item
								onClick={handleDeleteTarget}
								data-ctx-action="delete-target"
								color="red"
							>
								削除
							</Menu.Item>
							<Menu.Divider />
						</>
					)}
					<Menu.Label>一括操作</Menu.Label>
					<Menu.Item onClick={handleToggleAllJoining} data-ctx-action="all-joining">
						{allJoined ? "すべて分割" : "すべて結合"}
					</Menu.Item>
					<Menu.Item onClick={handleEnableAll} data-ctx-action="enable-all">
						全有効化
					</Menu.Item>
					<Menu.Item onClick={handleDisableAll} data-ctx-action="disable-all">
						全無効化
					</Menu.Item>
					<Menu.Item
						onClick={handleDeleteAllDisabled}
						data-ctx-action="delete-disabled"
						color="red"
						disabled={!hasDisabled}
					>
						無効スライドを一括削除
					</Menu.Item>
				</Menu.Dropdown>
			</Menu>
		</Paper>
	);
};
