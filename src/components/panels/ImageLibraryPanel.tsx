import { ConfirmDialog } from "@/components/common/ConfirmDialog";
import { useImageLibraryMutation } from "@/hooks/useImageLibraryMutation";
import { useLayerMutation } from "@/hooks/useLayerMutation";
import { useImageLibraryStore } from "@/state/imageLibraryStore";
import { useSlideStore } from "@/state/slideStore";
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
	Tooltip,
} from "@mantine/core";
import type {
	CSSProperties,
	FC,
	ChangeEvent as ReactChangeEvent,
	DragEvent as ReactDragEvent,
} from "react";
import { useRef, useState } from "react";

// ImageLibraryPanel (v4 Group D D-6a、§0-10 新側内製、Mantine Drawer + Modal)。
// レガシー src/utils/ImageManager.ts (jQuery + singleton DOM) は import せず新規実装。
//
// D-6a スコープ:
//   - 画像一覧表示 (imageLibraryStore.imageById の thumbnail grid)
//   - ファイル picker での画像追加 (Mantine FileButton)
//   - panel 全体への drop zone (ファイル drop で追加、複数ファイル対応)
//   - 画像削除 (ConfirmDialog で「使用中の N レイヤーも削除されます」確認)
//
// 操作はタイル上のボタンで明示的に行う (クリック自動配置・mode タブは廃止):
//   - 配置 (＋): 選択中スライドにこの画像を中央 contain 配置
//   - 差し替え (🔄): 選択中 ImageLayer の画像をこの画像で全 slide 一括差し替え
//                    (LayerOps の同一画像差し替え = replaceImageIdAll と同等、旧画像は孤児なら除去)
//   - DL (↓) / 削除 (✕)
//   - タイル本体は編集 canvas へのドラッグ元 (D-11、imageId を dataTransfer に載せる)
//
// UI:
//   - Mantine Drawer (size=80%、画面右側スライドイン)
//   - 上部に追加 (FileButton) + 件数表示
//   - 中央に Grid (4 列、各タイルに配置/差し替え/DL/削除ボタン)
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
	const { addImageFile, deleteImage, placeImageOnSlide, pruneOrphanImage } =
		useImageLibraryMutation();
	const { replaceImageIdAll } = useLayerMutation();
	const selectedSlideIndex = useSlideStore((s) => s.selectedIndex);
	const canPlace = selectedSlideIndex >= 0;
	const [dragOver, setDragOver] = useState(false);
	const [addError, setAddError] = useState<string | null>(null);
	const [deleteTarget, setDeleteTarget] = useState<DeleteTarget | null>(null);
	// 差し替え対象の imageId (タイルの「差し替え」押下で記録 → ファイル選択後に置換)。
	const replaceTargetRef = useRef<string | null>(null);
	const replaceInputRef = useRef<HTMLInputElement>(null);

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

	// 配置ボタン: 選択中 slide にこの画像を中央 contain 配置 → drawer を閉じる。
	const handlePlace = async (imageId: string) => {
		if (!canPlace) return;
		const ok = await placeImageOnSlide(imageId);
		if (ok) onClose();
	};

	// 差し替えボタン (画像対画像、Layer 非依存): タイルの imageId を対象に記録してファイル選択を開く。
	const handleRequestReplace = (imageId: string) => {
		replaceTargetRef.current = imageId;
		replaceInputRef.current?.click();
	};
	// ファイル選択後: 対象画像 (oldImageId) が使われている全箇所を新ファイルへ一括差し替え
	// (LayerOps の「同一画像差し替え」= replaceImageIdAll と同等)。旧画像が孤児になれば library から除去。
	const handleReplaceFileSelected = async (e: ReactChangeEvent<HTMLInputElement>) => {
		const file = e.target.files?.[0];
		e.target.value = "";
		const oldImageId = replaceTargetRef.current;
		replaceTargetRef.current = null;
		if (!file || !oldImageId) return;
		setAddError(null);
		try {
			const newImageId = await addImageFile(file); // 未対応形式 (HEIC 等) は reject
			if (newImageId === oldImageId) return; // 同一画像 = 変化なし
			replaceImageIdAll(oldImageId, newImageId);
			pruneOrphanImage(oldImageId);
		} catch (err) {
			setAddError(err instanceof Error ? err.message : String(err));
		}
	};

	// 別タブ DL: 一時 <a download> を作って click
	const handleDownload = (imageId: string, dataUrl: string, name?: string) => {
		const a = document.createElement("a");
		a.href = dataUrl;
		a.download = name ?? `${imageId.slice(0, 8)}.png`;
		document.body.appendChild(a);
		a.click();
		document.body.removeChild(a);
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
				keepMounted={false}>
				<Box
					style={wrapStyle}
					onDrop={handleDrop}
					onDragOver={handleDragOver}
					onDragLeave={handleDragLeave}
					data-image-library-drop-zone>
					<Stack gap="md">
						<Group justify="space-between" align="center">
							<Text size="sm" c="dimmed">
								{entries.length} 件
							</Text>
							<FileButton onChange={handleFilePicker} accept="image/*" multiple>
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

						{/* 操作はタイル上のボタン (配置 / 差し替え) で行う。クリック自動配置は廃止。 */}
						{entries.length > 0 && (
							<Text size="xs" c="dimmed" data-image-hint>
								各画像の「配置」で選択中スライドに追加 /「差し替え」でその画像を別ファイルに一括置換
							</Text>
						)}
						{/* 差し替え用の隠し file input (タイルの「差し替え」から起動)。 */}
						<input
							ref={replaceInputRef}
							type="file"
							accept="image/*"
							onChange={handleReplaceFileSelected}
							style={{ display: "none" }}
							data-image-replace-input
						/>

						{entries.length === 0 ? (
							<Paper withBorder p="xl" radius="sm" style={{ textAlign: "center" }} data-image-empty>
								<Text c="dimmed">ファイルをここにドロップ または「画像を追加」ボタンで追加</Text>
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
											canPlace={canPlace}
											onPlace={() => handlePlace(id)}
											onReplace={() => handleRequestReplace(id)}
											onDelete={() => requestDelete(id)}
											onDownload={() => handleDownload(id, entry.dataURL, entry.name)}
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

// 1 枚分の thumbnail tile (内部用)。
// クリック自動配置は廃止。配置/差し替えはタイル上のボタンで明示的に行う。
// tile 本体は編集 canvas へのドラッグ元としてのみ機能する (D-11)。
const ImageTile: FC<{
	imageId: string;
	dataURL: string;
	name?: string;
	canPlace: boolean;
	onPlace: () => void;
	onReplace: () => void;
	onDelete: () => void;
	onDownload: () => void;
}> = ({ imageId, dataURL, name, canPlace, onPlace, onReplace, onDelete, onDownload }) => {
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
		cursor: "grab",
		transition: "box-shadow 120ms",
	};
	const imgStyle: CSSProperties = {
		maxWidth: "100%",
		maxHeight: "100%",
		objectFit: "contain",
	};
	const topRightGroupStyle: CSSProperties = {
		position: "absolute",
		top: 2,
		right: 2,
		display: "flex",
		gap: 2,
	};
	// 配置 / 差し替えボタン (左上)。
	const topLeftGroupStyle: CSSProperties = {
		position: "absolute",
		top: 2,
		left: 2,
		display: "flex",
		gap: 2,
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
	// ドラッグ元 (§11、legacy: dataTransfer.setData("imageId"))。
	// tile を編集 canvas へドラッグ → SlideEditView の useDrop が imageId を受けて配置 (D-11)。
	const handleDragStart = (e: ReactDragEvent<HTMLDivElement>) => {
		e.dataTransfer.setData("imageId", imageId);
		e.dataTransfer.effectAllowed = "copy";
	};
	return (
		<div
			style={tileStyle}
			data-image-tile
			data-image-id={imageId}
			draggable
			onDragStart={handleDragStart}>
			<img src={dataURL} alt={name ?? imageId.slice(0, 8)} style={imgStyle} draggable={false} />
			{/* 配置 / 差し替え (左上) */}
			<div style={topLeftGroupStyle}>
				<Tooltip label={canPlace ? "選択中スライドに配置" : "スライドを選択すると配置できます"}>
					<ActionIcon
						size="sm"
						color="blue"
						variant="filled"
						disabled={!canPlace}
						onClick={(e) => {
							e.stopPropagation();
							onPlace();
						}}
						data-image-place
						aria-label="place image">
						＋
					</ActionIcon>
				</Tooltip>
				<Tooltip label="この画像を別ファイルに一括差し替え (使用中の全箇所)">
					<ActionIcon
						size="sm"
						color="grape"
						variant="filled"
						onClick={(e) => {
							e.stopPropagation();
							onReplace();
						}}
						data-image-replace
						aria-label="replace image">
						🔄
					</ActionIcon>
				</Tooltip>
			</div>
			<div style={topRightGroupStyle}>
				<Tooltip label="DL (別タブダウンロード)">
					<ActionIcon
						size="sm"
						color="blue"
						variant="filled"
						onClick={(e) => {
							e.stopPropagation();
							onDownload();
						}}
						data-image-download
						aria-label="download image">
						↓
					</ActionIcon>
				</Tooltip>
				<Tooltip label="削除">
					<ActionIcon
						size="sm"
						color="red"
						variant="filled"
						onClick={(e) => {
							// tile click と骨ぶつかるのを防ぐ
							e.stopPropagation();
							onDelete();
						}}
						data-image-delete
						aria-label="delete image">
						✕
					</ActionIcon>
				</Tooltip>
			</div>
			<div style={labelStyle} title={name ?? imageId}>
				{name ?? `${imageId.slice(0, 8)}…`}
			</div>
		</div>
	);
};
