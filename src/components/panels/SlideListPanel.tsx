import { Paper, ScrollArea, Stack, Text, Title } from "@mantine/core";
import type { FC } from "react";
import { Fragment } from "react";
import { useSlideStore } from "../../state/slideStore";
import { useViewerDocumentStore } from "../../state/viewerDocumentStore";
import { SlideJoinIndicator } from "../slide/SlideJoinIndicator";
import { SlideThumbView } from "../slide/SlideThumbView";

// SlideListPanel (v4 Group C build C-3、C-3R で slide view を slide/ に統合)。
// レガシー src/viewController/ListViewController.ts (jQuery + ThumbSlideView class) は
// import せず新規実装。
//
// 本 FC は「一覧パネルの組立て」のみ:
//   - 横スクロール ScrollArea
//   - slides を SlideThumbView 列に展開、間に SlideJoinIndicator を挿入
//   - 状態テキスト (N slides / selected: #M)
//   - クリックで store.setSelectedIndex
//
// 描画 / scale / 装飾はすべて slide/ 配下の FC に集約済 (SlideView / SlideThumbView /
// SlideJoinIndicator)。C-4 以降の DnD / 前後ボタン / 追加削除複製 / コンテキストメニュー
// は本 FC または slide/ 配下に追加していく。

const THUMB_HEIGHT = 110;

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
									<SlideThumbView
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
				)}
				<Text size="xs" c="dimmed" ff="monospace">
					{slides.length} slides
					{selectedIndex >= 0 && ` / selected: #${selectedIndex + 1}`}
				</Text>
			</Stack>
		</Paper>
	);
};
