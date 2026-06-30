import { Button, Group, Select, Tooltip } from "@mantine/core";
import { IconChevronLeft, IconChevronRight } from "@tabler/icons-react";
import type { FC } from "react";
import type { StoredSlideTitle } from "../../../hooks/useStorage";
import { adjacentTitleIndex } from "../../../utils/fileNavOps";

// 保存ファイル選択 UI (前/次ナビ + ドロップダウン)。
// **純粋な表示コンポーネント**: 選択を onChange で親へ通知するだけで、ロード・未保存確認・トーストは
// 行わない (親 FileIOToolbar.handleSelectChange が一元的に担う)。
// 以前は FileSelector でも loadByTitle/setDocument していたため、選択ごとにロードが二重に走っていた。
export const FileSelector: FC<{
	titles: StoredSlideTitle[];
	selectedTitle: string | null;
	onChange: (title: string | null) => void;
}> = ({ selectedTitle, titles, onChange }) => {
	// 保存ファイルの前後移動 (レガシー FileSelector の .fileSelect.up / .down 相当)。
	// 一覧 (update 降順) を 1 件ずつ移動して選択通知。端ではボタン無効 (ラップしない)。
	const currentTitleIndex = selectedTitle ? titles.findIndex((t) => t.title === selectedTitle) : -1;
	const prevIndex = adjacentTitleIndex(titles.length, currentTitleIndex, "prev");
	const nextIndex = adjacentTitleIndex(titles.length, currentTitleIndex, "next");
	const goToIndex = (target: number): void => {
		if (target < 0) return;
		onChange(titles[target].title);
	};

	const selectData = titles.map((t) => ({ value: t.title, label: t.title }));

	return (
		<Group gap={0} wrap="nowrap">
			<Tooltip label="前の保存ファイル">
				<Button
					size="xs"
					variant="default"
					onClick={() => goToIndex(prevIndex)}
					disabled={prevIndex < 0}
					data-file-nav="prev"
					aria-label="前の保存ファイル"
					px={4}
					style={{
						borderTopRightRadius: 0,
						borderBottomRightRadius: 0,
						borderRightWidth: 0,
					}}>
					<IconChevronLeft stroke={2} />
				</Button>
			</Tooltip>
			<Select
				placeholder="開くファイルを選択"
				value={selectedTitle}
				onChange={onChange}
				data={selectData}
				size="xs"
				w={200}
				nothingFoundMessage="(該当なし)"
				radius={0}
			/>
			<Tooltip label="次の保存ファイル">
				<Button
					size="xs"
					variant="default"
					onClick={() => goToIndex(nextIndex)}
					disabled={nextIndex < 0}
					data-file-nav="next"
					aria-label="次の保存ファイル"
					px={4}
					style={{
						borderTopLeftRadius: 0,
						borderBottomLeftRadius: 0,
						borderLeftWidth: 0,
					}}>
					<IconChevronRight stroke={2} />
				</Button>
			</Tooltip>
		</Group>
	);
};
