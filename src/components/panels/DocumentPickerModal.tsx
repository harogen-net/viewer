import { Modal, SimpleGrid, Text } from "@mantine/core";
import type { CSSProperties, FC } from "react";
import type { StoredSlideTitle } from "../../hooks/useStorage";

// 保存ドキュメントを「見た目で選ぶ」ビジュアルピッカー (v4 Group D 補間、§0-10 新側内製)。
// FileIOPanel の <Select> を補完する、サムネ + タイトルのギャラリー。
//   - titles: 表示する一覧 (呼び出し側で update 降順ソート済みを渡す)
//   - thumbnails: {title: dataURL}。サムネ未生成 (今後の保存分のみ生成) の title は欠落 → N/A 表示
//   - カードクリックで onPick(title) (呼び出し側でロード + close)
//
// 責務分離 (SlideView/SortableSlideThumb と同方針):
//   - DocumentPickerGrid  = カード描画コア (Modal を知らない = jsdom で素直にテストできる)
//   - DocumentPickerModal = Modal ラッパー (開閉アニメーションあり、薄い配線のみ)

interface DocumentPickerGridProps {
	titles: StoredSlideTitle[];
	thumbnails: Record<string, string>;
	selectedTitle: string | null;
	onPick: (title: string) => void;
}

const cardStyle = (selected: boolean): CSSProperties => ({
	display: "flex",
	flexDirection: "column",
	gap: 4,
	padding: 6,
	border: selected ? "2px solid #228be6" : "1px solid #dee2e6",
	borderRadius: 6,
	background: selected ? "rgba(34,139,230,0.06)" : "#fff",
	cursor: "pointer",
	textAlign: "left",
	width: "100%",
});
// サムネ表示枠 (自由比率、contain で全体表示)。N/A も同枠で揃える。
const thumbBoxStyle: CSSProperties = {
	width: "100%",
	height: 160,
	display: "flex",
	alignItems: "center",
	justifyContent: "center",
	background: "#f1f3f5",
	borderRadius: 4,
	overflow: "hidden",
};
const imgStyle: CSSProperties = {
	width: "100%",
	height: "100%",
	objectFit: "cover",
	display: "block",
};
const titleStyle: CSSProperties = {
	fontSize: 11,
	fontFamily: "monospace",
	whiteSpace: "nowrap",
	overflow: "hidden",
	textOverflow: "ellipsis",
};

export const DocumentPickerGrid: FC<DocumentPickerGridProps> = ({
	titles,
	thumbnails,
	selectedTitle,
	onPick,
}) => {
	if (titles.length === 0) {
		return (
			<Text size="sm" c="dimmed">
				保存済みドキュメントがありません。
			</Text>
		);
	}
	return (
		<SimpleGrid cols={{ base: 2, sm: 3, md: 4, lg: 5 }} spacing="sm" verticalSpacing="sm">
			{titles.map((t) => {
				const thumb = thumbnails[t.title];
				const selected = t.title === selectedTitle;
				return (
					<button
						type="button"
						key={t.id}
						style={cardStyle(selected)}
						data-picker-item={t.title}
						data-selected={selected ? "true" : "false"}
						onClick={() => onPick(t.title)}>
						<div style={thumbBoxStyle}>
							{thumb ? (
								<img src={thumb} alt={t.title} style={imgStyle} data-picker-thumb />
							) : (
								<Text size="xs" c="dimmed" data-picker-na>
									N/A
								</Text>
							)}
						</div>
						<span style={titleStyle}>{t.title}</span>
					</button>
				);
			})}
		</SimpleGrid>
	);
};

interface DocumentPickerModalProps extends DocumentPickerGridProps {
	opened: boolean;
	onClose: () => void;
}

export const DocumentPickerModal: FC<DocumentPickerModalProps> = ({ opened, onClose, ...grid }) => (
	<Modal
		opened={opened}
		onClose={onClose}
		title="保存ドキュメントを開く"
		centered
		size="90vw"
		styles={{ content: { minHeight: "50vh" } }}
		data-doc-picker>
		<DocumentPickerGrid {...grid} />
	</Modal>
);
