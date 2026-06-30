import { useAlert } from "@/hooks/useAlert";
import { useDocSettingsStore } from "@/state/docSettingsStore";
import { useImageLibraryStore } from "@/state/imageLibraryStore";
import { useViewerDocumentStore } from "@/state/viewerDocumentStore";
import { ActionIcon, Button, Group, Paper, Pill, Stack, Text, Tooltip } from "@mantine/core";
import { IconFileSettings, IconLibraryPhoto } from "@tabler/icons-react";
import type { FC } from "react";
import { useState } from "react";
import { DocumentSettingsModal } from "./DocumentSettingsModal";
import { FileIOToolbar } from "./fileIO/FileIOToolbar";
import { ImageLibraryPanel } from "./ImageLibraryPanel";

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
	const alert = useAlert();
	const meta = useViewerDocumentStore((s) => s.meta);
	const modified = useViewerDocumentStore((s) => s.modified);
	const [showImageLibrary, setShowImageLibrary] = useState(false);
	const openDocSettings = useDocSettingsStore((s) => s.openEdit);
	const imageCount = useImageLibraryStore((s) => Object.keys(s.imageById).length);

	// ドキュメントを閉じる (store クリア)。未保存変更があれば破棄確認してから。
	const handleCloseDocument = async (): Promise<void> => {
		if (modified) {
			const ok = await alert.confirm(
				"ドキュメントを閉じます。保存していない変更は破棄されます。よろしいですか?",
				{ title: "ドキュメントを閉じる" }
			);
			if (!ok) return;
		}
		useViewerDocumentStore.getState().setDocument(null);
	};

	return (
		<>
			{/* <Paper withBorder p="6" radius="sm"> */}
			<Stack gap="xs">
				{/* <Stack gap="xs"> */}
				<FileIOToolbar readOnly={readOnly} />

				<Paper withBorder p="6" radius="sm">
					{!meta ? (
						<Text size="sm" c="dimmed">
							ドキュメント未ロード
						</Text>
					) : (
						<Group justify="space-between" align="center">
							<Group>
								<Tooltip label="ドキュメントを閉じる">
									<ActionIcon
										variant="default"
										onClick={handleCloseDocument}
										data-action="close-document"
										aria-label="ドキュメントを閉じる">
										✕
									</ActionIcon>
								</Tooltip>
								<Text size="sm">{meta.title}</Text>
								{modified ? (
									<Pill
										size="xs"
										styles={{
											root: {
												backgroundColor: `var(--mantine-primary-color-filled)`,
												color: `var(--mantine-primary-color-contrast)`,
											},
										}}>
										変更あり
									</Pill>
								) : null}
							</Group>
							{!readOnly && (
								<Group gap="xs">
									<Button
										variant="filled"
										color="gray"
										size="xs"
										leftSection={<IconFileSettings stroke={2} />}
										onClick={openDocSettings}
										data-open-doc-settings>
										ドキュメント設定
									</Button>
									<Button
										variant="filled"
										color="gray"
										size="xs"
										leftSection={<IconLibraryPhoto stroke={2} />}
										rightSection={
											imageCount > 0 ? <span className="text-xs">({imageCount})</span> : null
										}
										onClick={() => setShowImageLibrary(true)}
										data-open-image-library>
										画像ライブラリ
									</Button>
								</Group>
							)}
						</Group>
					)}
				</Paper>
			</Stack>
			{!readOnly && (
				<>
					<ImageLibraryPanel opened={showImageLibrary} onClose={() => setShowImageLibrary(false)} />
					<DocumentSettingsModal />
				</>
			)}
		</>
	);
};
