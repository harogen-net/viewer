import {
    ActionIcon,
    Box,
    Button,
    Drawer,
    FileButton,
    Group,
    Paper,
    ScrollArea,
    SimpleGrid,
    Stack,
    Text,
    Tooltip
} from "@mantine/core";
import type { CSSProperties, FC, DragEvent as ReactDragEvent } from "react";
import { useState } from "react";
import { useImageLibraryMutation } from "../../hooks/useImageLibraryMutation";
import { useImageLibraryStore } from "../../state/imageLibraryStore";
import { useSlideStore } from "../../state/slideStore";
import { ConfirmDialog } from "../common/ConfirmDialog";

// ImageLibraryPanel (v4 Group D D-6a、§0-10 新側内製、Mantine Drawer + Modal)。
// レガシー src/utils/ImageManager.ts (jQuery + singleton DOM) は import せず新規実装。
//
// D-6a スコープ:
//   - 画像一覧表示 (imageLibraryStore.imageById の thumbnail grid)
//   - ファイル picker での画像追加 (Mantine FileButton)
//   - panel 全体への drop zone (ファイル drop で追加、複数ファイル対応)
//   - 画像削除 (ConfirmDialog で「使用中の N レイヤーも削除されます」確認)
//
// 後の chunk:
//   - D-6b: 画像差し替え (単体 / 同一参照まとめて) + 別タブダウンロード
//
// UI:
//   - Mantine Drawer (size=80%、画面右側スライドイン)
//   - 上部に追加 (FileButton) + 件数表示
//   - 中央に Grid (4 列、各画像 thumb クリックで選択ハイライト、削除アイコン)
//   - drop zone: panel 全体に dragover で半透明 overlay 表示
//
// 状態:
//   - props.opened / onClose で controlled
//   - 削除確認 dialog の opened は内部 state
//   - drop hover state も内部 state

export interface ImageLibraryPanelProps {
	opened: boolean;
	onClose: () => void;
}

interface DeleteTarget {
	imageId: string;
	usedLayerCount: number;
}

// 利用 layer 数を数える (確認 dialog の表示用、削除前計算)
const countLayersUsingImage = (imageId: string): number => {
	const slides = useSlideStore.getState().slides;
	let n = 0;
	for (const s of slides) {
		for (const l of s.layers) {
			if (l.type === "image" && l.imageId === imageId) n++;
		}
	}
	return n;
};

export const ImageLibraryPanel: FC<ImageLibraryPanelProps> = ({ opened, onClose }) => {
	const imageById = useImageLibraryStore((s) => s.imageById);
	const { addImageFile, deleteImage, placeImageOnSlide } = useImageLibraryMutation();
	const selectedSlideIndex = useSlideStore((s) => s.selectedIndex);
	const canPlace = selectedSlideIndex >= 0;
	const [dragOver, setDragOver] = useState(false);
	const [addError, setAddError] = useState<string | null>(null);
	const [deleteTarget, setDeleteTarget] = useState<DeleteTarget | null>(null);

	const entries = Object.entries(imageById);

	const handleFilePicker = async (files: File[] | null) => {
		if (!files || files.length === 0) return;
		setAddError(null);
		for (const f of files) {
			try {
				await addImageFile(f);
			} catch (e) {
				setAddError(e instanceof Error ? e.message : String(e));
			}
		}
	};

	const handleDrop = async (e: ReactDragEvent<HTMLDivElement>) => {
		e.preventDefault();
		setDragOver(false);
		const files = Array.from(e.dataTransfer?.files ?? []);
		if (files.length === 0) return;
		setAddError(null);
		for (const f of files) {
			if (!f.type.startsWith("image/")) continue;
			try {
				await addImageFile(f);
			} catch (err) {
				setAddError(err instanceof Error ? err.message : String(err));
			}
		}
	};

	const handleDragOver = (e: ReactDragEvent<HTMLDivElement>) => {
		// drop イベント発火のために必須
		e.preventDefault();
		if (!dragOver) setDragOver(true);
	};
	const handleDragLeave = (e: ReactDragEvent<HTMLDivElement>) => {
		// 子要素間移動でちらつかないよう、関連要素が panel 外なら解除
		const related = e.relatedTarget as Node | null;
		if (related && (e.currentTarget as Node).contains(related)) return;
		setDragOver(false);
	};

	const requestDelete = (imageId: string) => {
		const usedLayerCount = countLayersUsingImage(imageId);
		setDeleteTarget({ imageId, usedLayerCount });
	};

	const confirmDelete = () => {
		if (!deleteTarget) return;
		deleteImage(deleteTarget.imageId);
		setDeleteTarget(null);
	};

	// タイル click で 選択中 slide に画像を中央 contain 配置 → drawer を閉じる
	const handlePlace = async (imageId: string) => {
		if (!canPlace) return;
		const ok = await placeImageOnSlide(imageId);
		if (ok) onClose();
	};

	const dropOverlayStyle: CSSProperties = {
		position: "absolute",
		inset: 0,
		background: "rgba(34, 139, 230, 0.1)",
		border: "2px dashed #228be6",
		borderRadius: 8,
		display: dragOver ? "flex" : "none",
		alignItems: "center",
		justifyContent: "center",
		zIndex: 100,
		pointerEvents: "none",
		fontSize: 18,
		color: "#228be6",
		fontWeight: 600,
	};

	const wrapStyle: CSSProperties = {
		position: "relative",
		minHeight: "100%",
	};

	return (
		<>
			<Drawer
				opened={opened}
				onClose={onClose}
				title="画像ライブラリ"
				position="right"
				size="80%"
				padding="md"
				data-image-library-panel
				keepMounted={false}
			>
				<Box
					style={wrapStyle}
					onDrop={handleDrop}
					onDragOver={handleDragOver}
					onDragLeave={handleDragLeave}
					data-image-library-drop-zone
				>
					<Stack gap="md">
						<Group justify="space-between" align="center">
							<Text size="sm" c="dimmed">
								{entries.length} 件
							</Text>
							<FileButton
								onChange={handleFilePicker}
								accept="image/*"
								multiple
							>
								{(props) => (
									<Button {...props} variant="filled" size="sm" data-image-add-button>
										＋ 画像を追加
									</Button>
								)}
							</FileButton>
						</Group>

						{addError && (
							<Text size="sm" c="red" data-image-add-error>
								{addError}
							</Text>
						)}

						{/* slide 選択状態インジケータ (画像 click で 配置されることを告知) */}
						{entries.length > 0 && (
							<Text
								size="xs"
								c={canPlace ? "blue" : "dimmed"}
								data-image-place-hint
							>
								{canPlace
									? "画像をクリックで選択中のスライドに中央配置します"
									: "(スライドを選択すると画像をクリックして配置できます)"}
							</Text>
						)}

						{entries.length === 0 ? (
							<Paper
								withBorder
								p="xl"
								radius="sm"
								style={{ textAlign: "center" }}
								data-image-empty
							>
								<Text c="dimmed">
									ファイルをここにドロップ または「画像を追加」ボタンで追加
								</Text>
							</Paper>
						) : (
							<ScrollArea h="calc(100vh - 200px)" type="auto" scrollbarSize={8}>
								<SimpleGrid cols={4} spacing="sm" data-image-grid>
									{entries.map(([id, entry]) => (
										<ImageTile
											key={id}
											imageId={id}
											dataURL={entry.dataURL}
											name={entry.name}
											onDelete={() => requestDelete(id)}
											onPlace={canPlace ? () => handlePlace(id) : undefined}
										/>
									))}
								</SimpleGrid>
							</ScrollArea>
						)}
					</Stack>

					{/* drop overlay (dragOver=true で表示) */}
					<div style={dropOverlayStyle} data-image-drop-overlay>
						ドロップして画像を追加
					</div>
				</Box>
			</Drawer>

			<ConfirmDialog
				opened={deleteTarget !== null}
				onClose={() => setDeleteTarget(null)}
				onConfirm={confirmDelete}
				title="画像を削除"
				message={
					deleteTarget
						? deleteTarget.usedLayerCount > 0
							? `この画像を参照しているレイヤー ${deleteTarget.usedLayerCount} 件も削除されます。よろしいですか?`
							: "この画像を削除します。よろしいですか?"
						: undefined
				}
				confirmLabel="削除"
			/>
		</>
	);
};

// 1 枚分の thumbnail tile (内部用)
// onPlace が指定されている間は tile 本体がクリック可 (slide 選択中)、
// 未指定なら click 不可 (cursor default + hover エフェクトなし)。
const ImageTile: FC<{
	imageId: string;
	dataURL: string;
	name?: string;
	onDelete: () => void;
	onPlace?: () => void;
}> = ({ imageId, dataURL, name, onDelete, onPlace }) => {
	const placeable = !!onPlace;
	const tileStyle: CSSProperties = {
		position: "relative",
		border: "1px solid #dee2e6",
		borderRadius: 4,
		overflow: "hidden",
		background: "#f8f9fa",
		aspectRatio: "1 / 1",
		display: "flex",
		alignItems: "center",
		justifyContent: "center",
		cursor: placeable ? "pointer" : "default",
		transition: "box-shadow 120ms",
	};
	const imgStyle: CSSProperties = {
		maxWidth: "100%",
		maxHeight: "100%",
		objectFit: "contain",
	};
	const deleteBtnStyle: CSSProperties = {
		position: "absolute",
		top: 2,
		right: 2,
	};
	const labelStyle: CSSProperties = {
		position: "absolute",
		left: 0,
		right: 0,
		bottom: 0,
		padding: "2px 4px",
		fontSize: 10,
		fontFamily: "monospace",
		background: "rgba(0,0,0,0.55)",
		color: "#fff",
		whiteSpace: "nowrap",
		overflow: "hidden",
		textOverflow: "ellipsis",
	};
	const handleTileClick = () => {
		if (onPlace) onPlace();
	};
	return (
		<Tooltip label={placeable ? "クリックでスライドに配置" : "スライドを選択するとクリックで配置できます"}>
			<div
				style={tileStyle}
				data-image-tile
				data-image-id={imageId}
				data-placeable={placeable ? "true" : "false"}
				onClick={placeable ? handleTileClick : undefined}
			>
				<img src={dataURL} alt={name ?? imageId.slice(0, 8)} style={imgStyle} draggable={false} />
				<Tooltip label="削除">
					<ActionIcon
						size="sm"
						color="red"
						variant="filled"
						style={deleteBtnStyle}
						onClick={(e) => {
							// tile click と骨ぶつかるのを防ぐ
							e.stopPropagation();
							onDelete();
						}}
						data-image-delete
						aria-label="delete image"
					>
						✕
					</ActionIcon>
				</Tooltip>
				<div style={labelStyle} title={name ?? imageId}>
					{name ?? `${imageId.slice(0, 8)}…`}
				</div>
			</div>
		</Tooltip>
	);
};
