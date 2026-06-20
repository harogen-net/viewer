import { Menu } from "@mantine/core";
import type { FC, MouseEvent as ReactMouseEvent, ReactNode } from "react";
import { useState } from "react";
import { useSlideMutation } from "../../hooks/useSlideMutation";
import { useSlideStore } from "../../state/slideStore";

// SlideListPanel 用のコンテキストメニュー (v4 Group C C-6、C-7 後で SlideListPanel から切出)。
//
// 役割: children を wrap し onContextMenu を受け取り、右クリック位置に Mantine Menu を出す。
//   - 空 list は早期 return (legacy 互換)
//   - closest("[data-slide-index]") で右クリック対象 slide を逆引き
//   - target 指定時は per-slide 項目 (結合切替 / 有効無効切替 / 複製 / 削除) + 一括操作
//   - 背景クリック (target null) は一括操作のみ
//
// 設計: 自己完結 (store / mutation を直接購読、parent から props 不要)。
//   - state: ctxMenu 位置 + targetIndex
//   - 操作: useSlideMutation の handler を組合せ
//   - SlideListPanel 側は <SlideListContextMenu> でラップするだけ

interface SlideListContextMenuProps {
	children: ReactNode;
}

export const SlideListContextMenu: FC<SlideListContextMenuProps> = ({ children }) => {
	const slides = useSlideStore((s) => s.slides);
	const {
		duplicateSlide,
		deleteSlide,
		setSlideJoining,
		setSlideDisabled,
		setAllJoining,
		setAllDisabled,
		deleteAllDisabled,
	} = useSlideMutation();

	const [ctxMenu, setCtxMenu] = useState<
		{ x: number; y: number; targetIndex: number | null } | null
	>(null);
	const closeCtxMenu = (): void => setCtxMenu(null);

	const targetSlide =
		ctxMenu?.targetIndex != null ? slides[ctxMenu.targetIndex] ?? null : null;
	const allJoined = slides.length > 0 && slides.every((s) => s.joining);
	const hasDisabled = slides.some((s) => s.disabled);

	const handleContextMenu = (e: ReactMouseEvent<HTMLDivElement>): void => {
		if (slides.length === 0) return;
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
		// display: contents で wrapping div が layout に影響しないようにする (event は bubble する)
		<div onContextMenu={handleContextMenu} style={{ display: "contents" }}>
			{children}
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
		</div>
	);
};
