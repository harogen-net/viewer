import { Paper, ScrollArea, Stack, Text, Title } from "@mantine/core";
import type { CSSProperties, FC } from "react";
import { Fragment } from "react";
import { useSlideStore } from "../../state/slideStore";
import { useViewerDocumentStore } from "../../state/viewerDocumentStore";
import type { Slide } from "../../types/Slide";
import { SlideDisplayMode } from "../../types/Slide";
import { SlideView } from "../slide/SlideView";

// SlideListPanel (v4 Group C build C-3、§0-10 新側内製、Mantine UI)。
// レガシー src/viewController/ListViewController.ts (jQuery + ThumbSlideView class) は
// import せず新規実装。サムネイル描画は components/slide/SlideView.tsx の mode="thumb" を利用。
//
// C-3 スコープ (本ファイル):
//   - スライド一覧の横並び表示 (横スクロール)
//   - サムネクリックで選択 (setSelectedIndex)
//   - 選択中 / disabled の視覚状態
//   - joining 状態の視覚化 (隣接 slide との連結インジケーター)
//
// C-4 以降で追加予定:
//   - DnD 並び替え (@dnd-kit)
//   - 前後移動ボタン
//   - 追加 / 削除 / 複製ボタン
//   - コンテキストメニュー (Mantine Menu)

const THUMB_HEIGHT = 110;

interface SlideThumbItemProps {
	slide: Slide;
	index: number;
	selected: boolean;
	bgColor?: string;
	onClick: () => void;
}

/** 1 枚のサムネイル + 選択枠 + disabled 表示 (クリックで選択)。 */
const SlideThumbItem: FC<SlideThumbItemProps> = ({ slide, index, selected, bgColor, onClick }) => {
	const itemStyle: CSSProperties = {
		position: "relative",
		flex: "0 0 auto",
		// 選択時は青枠、未選択時は同じ太さの透明枠 (border でレイアウトずれないように)
		border: selected ? "2px solid #228be6" : "2px solid transparent",
		borderRadius: 4,
		// disabled は半透明
		opacity: slide.disabled ? 0.35 : 1,
		cursor: "pointer",
		boxSizing: "content-box",
		background: "#fff",
		boxShadow: selected ? "0 0 0 1px rgba(34,139,230,0.3)" : "0 0 1px rgba(0,0,0,0.2)",
	};
	const indexLabelStyle: CSSProperties = {
		position: "absolute",
		bottom: 2,
		left: 4,
		color: "#fff",
		background: "rgba(0,0,0,0.55)",
		fontSize: 10,
		lineHeight: 1,
		padding: "2px 4px",
		borderRadius: 2,
		fontFamily: "monospace",
		pointerEvents: "none",
	};
	return (
		<div
			style={itemStyle}
			data-slide-index={index}
			data-selected={selected ? "true" : "false"}
			data-disabled={slide.disabled ? "true" : "false"}
			onClick={onClick}
		>
			<SlideView slide={slide} bgColor={bgColor} mode={SlideDisplayMode.THUMB} thumbHeight={THUMB_HEIGHT} />
			<span style={indexLabelStyle}>{index + 1}</span>
		</div>
	);
};

/**
 * 隣接スライド間の joining インジケーター。
 * joining=true: 細い接続線 (1 つに繋がっている) + 4px ギャップ
 * joining=false: 区切り線 + 12px ギャップ
 */
const SlideJoinIndicator: FC<{ joining: boolean }> = ({ joining }) => {
	if (joining) {
		const style: CSSProperties = {
			alignSelf: "center",
			width: 8,
			height: 2,
			background: "#868e96",
			flex: "0 0 auto",
		};
		return <div style={style} data-join="true" />;
	}
	const style: CSSProperties = {
		alignSelf: "stretch",
		width: 1,
		margin: "0 8px",
		background: "#dee2e6",
		flex: "0 0 auto",
	};
	return <div style={style} data-join="false" />;
};

export const SlideListPanel: FC = () => {
	const slides = useSlideStore((s) => s.slides);
	const selectedIndex = useSlideStore((s) => s.selectedIndex);
	const setSelectedIndex = useSlideStore((s) => s.setSelectedIndex);
	const bgColor = useViewerDocumentStore((s) => s.meta?.bgColor);

	const isEmpty = slides.length === 0;

	return (
		<Paper withBorder p="sm" radius="sm">
			<Stack gap="xs">
				<Title order={5}>Slide List</Title>
				{isEmpty ? (
					<Text size="xs" c="dimmed">
						スライドがありません (document をロード or 新規作成)
					</Text>
				) : (
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
									<SlideThumbItem
										slide={slide}
										index={i}
										selected={i === selectedIndex}
										bgColor={bgColor}
										onClick={() => setSelectedIndex(i)}
									/>
									{i < slides.length - 1 && (
										<SlideJoinIndicator joining={slide.joining} />
									)}
								</Fragment>
							))}
						</div>
					</ScrollArea>
				)}
				<Text size="xs" c="dimmed" ff="monospace">
					{slides.length} slides
					{selectedIndex >= 0 && ` / selected: #${selectedIndex + 1}`}
				</Text>
			</Stack>
		</Paper>
	);
};
