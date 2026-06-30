import { useSlideStore } from "@/state/slideStore";
import { useViewerDocumentStore } from "@/state/viewerDocumentStore";
import { Group, Paper, Stack } from "@mantine/core";
import type { FC } from "react";
import { FileIOToolbar } from "./fileIO/FileIOToolbar";

// ファイル IO パネル (v3 Group B build、§0-10 新側内製、Mantine UI)。
// レガシー src/viewController/file/FileSelector.ts (jQuery) + Viewer.ts の
// .save / .load / .new / .import / .export ハンドラ群を 1 component に統合。
//
// 役割分担:
//   - 新規 / 一覧 / 開く / 保存 / 削除: 本 component + useStorage (IDB)
//   - import / export (HVD/HVZ/PNG):  useFileIO に委譲 (doc / imageMap を注入)
//   - store 反映 (setDocument / setImageLibrary) は本 component 側で行う

// readOnly (閲覧モード) では書込系 (新規 / 保存 / 上書き / import / 削除 / 元に戻す) を隠し、
// 開く (一覧 / 前後移動 / ギャラリー) と出力 (PNG/HVD/HVZ/ZIP) のみ残す。
export const FileIOPanel: FC<{ readOnly?: boolean }> = ({ readOnly = false }) => {
	const meta = useViewerDocumentStore((s) => s.meta);
	const modified = useViewerDocumentStore((s) => s.modified);
	const slides = useSlideStore((s) => s.slides);

	return (
		<>
			{/* <Paper withBorder p="6" radius="sm"> */}
			<Stack gap="xs">
				{/* <Stack gap="xs"> */}
				<FileIOToolbar readOnly={readOnly} />

				<Paper withBorder p="6" radius="sm" className="r">
					{!meta ? (
						<div className="text-xs text-center text-gray-500">ドキュメント未ロード</div>
					) : (
						<>
							<Group>
								<div className="text-xs text-gray-500">
									{meta.title} ({slides.length} slides)
								</div>
								<div className="text-xs text-gray-500">
									{modified ? "未保存の変更あり" : "保存済み"}
								</div>
							</Group>
						</>
					)}
				</Paper>
			</Stack>
		</>
	);
};
