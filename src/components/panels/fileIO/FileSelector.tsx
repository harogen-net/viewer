import type { StoredDoc } from "@/hooks/useStorage";
import type { DocId } from "@/types/DocId";
import { adjacentTitleIndex } from "@/utils/fileNavOps";
import { Button, Group, Select, Tooltip } from "@mantine/core";
import { IconChevronLeft, IconChevronRight } from "@tabler/icons-react";
import type { FC } from "react";

// 保存ファイル選択 UI (前/次ナビ + ドロップダウン)。
// **純粋な表示コンポーネント**: 選択を onChange で親へ通知するだけで、ロード・未保存確認・トーストは
// 行わない (親 FileIOToolbar.handleSelectChange が一元的に担う)。
// 以前は FileSelector でも load/setDocument していたため、選択ごとにロードが二重に走っていた。
//
// **Select の value は docId。** title は自由入力で重複しうるので value に使えない
// (同名が 2 件あると選択が壊れる)。表示は title、値は docId。
export const FileSelector: FC<{
	docs: StoredDoc[];
	selectedId: DocId | null;
	onChange: (id: DocId | null) => void;
}> = ({ selectedId, docs, onChange }) => {
	// 保存ファイルの前後移動 (レガシー FileSelector の .fileSelect.up / .down 相当)。
	// 一覧 (update 降順) を 1 件ずつ移動して選択通知。端ではボタン無効 (ラップしない)。
	const currentIndex = selectedId ? docs.findIndex((d) => d.id === selectedId) : -1;
	const prevIndex = adjacentTitleIndex(docs.length, currentIndex, "prev");
	const nextIndex = adjacentTitleIndex(docs.length, currentIndex, "next");
	const goToIndex = (target: number): void => {
		if (target < 0) return;
		onChange(docs[target].id);
	};

	const selectData = docs.map((d) => ({ value: d.id, label: d.title }));

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
				value={selectedId}
				onChange={onChange}
				data={selectData}
				size="xs"
				style={{ flex: "1 1 140px", minWidth: 120, maxWidth: 240 }}
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
