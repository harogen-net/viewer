import { ConfirmDialog } from "@/components/common/ConfirmDialog";
import { useImageLibraryMutation } from "@/hooks/useImageLibraryMutation";
import { useLayerMutation } from "@/hooks/useLayerMutation";
import { useToast } from "@/hooks/useToast";
import { useImageLibraryStore } from "@/state/imageLibraryStore";
import { useSlideStore } from "@/state/slideStore";
import { downloadDataUrl } from "@/utils/domUtils";
import {
	ActionIcon,
	Box,
	Button,
	Drawer,
	FileButton,
	Group,
	Menu,
	Paper,
	ScrollArea,
	SimpleGrid,
	Slider,
	Stack,
	Text,
} from "@mantine/core";
import {
	IconDotsVertical,
	IconDownload,
	IconPlus,
	IconRefresh,
	IconTrash,
} from "@tabler/icons-react";
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

// グリッド 1 行あたりの画像数 (列数)。スライダーで変更し、localStorage に永続化する
// (Drawer は keepMounted=false で開くたび state がリセットされるため)。
const COLS_KEY = "imageLibrary.cols";
const COLS_MIN = 1;
const COLS_MAX = 8;
const COLS_DEFAULT = 4;
const clampCols = (n: number): number => Math.min(COLS_MAX, Math.max(COLS_MIN, Math.round(n)));
const readColsPref = (): number => {
	try {
		const raw = localStorage.getItem(COLS_KEY);
		const n = raw != null ? Number(raw) : Number.NaN;
		return Number.isFinite(n) ? clampCols(n) : COLS_DEFAULT;
	} catch {
		return COLS_DEFAULT;
	}
};
const writeColsPref = (n: number): void => {
	try {
		localStorage.setItem(COLS_KEY, String(n));
	} catch {
		/* localStorage 不可でも致命的でない */
	}
};

export const ImageLibraryPanel: FC<ImageLibraryPanelProps> = ({ opened, onClose }) => {
	const imageById = useImageLibraryStore((s) => s.imageById);
	const { addImageFile, deleteImage, placeImageOnSlide, pruneOrphanImage, pruneUnusedImages } =
		useImageLibraryMutation();
	const { replaceImageIdAll } = useLayerMutation();
	const selectedSlideIndex = useSlideStore((s) => s.selectedIndex);
	const slides = useSlideStore((s) => s.slides);
	const toast = useToast();
	const canPlace = selectedSlideIndex >= 0;
	const [dragOver, setDragOver] = useState(false);
	const [cols, setCols] = useState<number>(readColsPref); // 1 行あたりの画像数
	const handleColsChange = (v: number): void => {
		const c = clampCols(v);
		setCols(c);
		writeColsPref(c);
	};
	const [addError, setAddError] = useState<string | null>(null);
	const [deleteTarget, setDeleteTarget] = useState<DeleteTarget | null>(null);
	const [pruneConfirmOpen, setPruneConfirmOpen] = useState(false);
	// 差し替え対象の imageId (タイルの「差し替え」押下で記録 → ファイル選択後に置換)。
	const replaceTargetRef = useRef<string | null>(null);
	const replaceInputRef = useRef<HTMLInputElement>(null);

	const entries = Object.entries(imageById);

	// どの ImageLayer からも参照されていない画像の件数 (未使用一括削除ボタン用)。
	const referencedImageIds = new Set<string>();
	for (const s of slides) {
		for (const l of s.layers) {
			if (l.type === "image") referencedImageIds.add(l.imageId);
		}
	}
	const unusedCount = entries.filter(([id]) => !referencedImageIds.has(id)).length;

	// 未使用画像を一括削除 (どのスライドにも使われていない = 削除しても表示に影響しない)。
	// 確認は ConfirmDialog (オンデマンド mount = Drawer より手前に出る。alert は常時 mount で裏に隠れる)。
	const confirmPruneUnused = () => {
		const removed = pruneUnusedImages();
		toast.success(`未使用画像を ${removed} 件削除しました`);
	};

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
		downloadDataUrl(dataUrl, name ?? `${imageId.slice(0, 8)}.png`);
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
				position="bottom"
				size="60vh"
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
								{entries.length} 件{unusedCount > 0 ? `（未使用 ${unusedCount}）` : ""}
							</Text>
							<Group gap="sm">
								<Button
									variant="default"
									color="red"
									size="sm"
									disabled={unusedCount === 0}
									onClick={() => setPruneConfirmOpen(true)}
									data-image-prune-unused>
									未使用を削除{unusedCount > 0 ? ` (${unusedCount})` : ""}
								</Button>
								<FileButton onChange={handleFilePicker} accept="image/*" multiple>
									{(props) => (
										<Button {...props} variant="filled" size="sm" data-image-add-button>
											＋ 画像を追加
										</Button>
									)}
								</FileButton>
							</Group>
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
						{/* 1 行あたりの画像数 (列数) スライダー。値は localStorage に永続化。 */}
						{entries.length > 0 && (
							<Group gap="sm" align="center" data-image-cols-control>
								<Text size="xs" c="dimmed" style={{ whiteSpace: "nowrap" }}>
									列数: {cols}
								</Text>
								<Slider
									min={COLS_MIN}
									max={COLS_MAX}
									step={1}
									value={cols}
									onChange={handleColsChange}
									style={{ width: 200 }}
									label={null}
									data-image-cols-slider
									aria-label="1列あたりの画像数"
								/>
							</Group>
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
							<ScrollArea type="auto" scrollbarSize={8}>
								<SimpleGrid cols={cols} spacing="sm" data-image-grid>
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

			<ConfirmDialog
				opened={pruneConfirmOpen}
				onClose={() => setPruneConfirmOpen(false)}
				onConfirm={confirmPruneUnused}
				title="未使用画像を削除"
				message={`どのスライドにも使われていない画像 ${unusedCount} 件を削除します。よろしいですか?`}
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
	// 操作 (…) メニュートリガー (右上)。
	const menuWrapStyle: CSSProperties = {
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
			{/* 操作は右上の … メニューに集約 (配置 / 差し替え / DL / 削除)。FileIOSubMenu と同方針。 */}
			<div style={menuWrapStyle}>
				<Menu
					shadow="md"
					width={240}
					position="bottom-end"
					withinPortal
					transitionProps={{ duration: 0 }}>
					<Menu.Target>
						<ActionIcon
							size="sm"
							variant="default"
							data-image-menu
							aria-label="画像の操作メニュー"
							onClick={(e) => e.stopPropagation()}
							onDragStart={(e) => e.stopPropagation()}>
							<IconDotsVertical size={16} stroke={2} />
						</ActionIcon>
					</Menu.Target>
					<Menu.Dropdown>
						<Menu.Item
							leftSection={<IconPlus size={16} />}
							disabled={!canPlace}
							onClick={onPlace}
							data-image-place>
							選択中スライドに配置
						</Menu.Item>
						<Menu.Item
							leftSection={<IconRefresh size={16} />}
							onClick={onReplace}
							data-image-replace>
							別ファイルに一括差し替え
						</Menu.Item>
						<Menu.Item
							leftSection={<IconDownload size={16} />}
							onClick={onDownload}
							data-image-download>
							ダウンロード
						</Menu.Item>
						<Menu.Divider />
						<Menu.Item
							color="red"
							leftSection={<IconTrash size={16} />}
							onClick={onDelete}
							data-image-delete>
							削除
						</Menu.Item>
					</Menu.Dropdown>
				</Menu>
			</div>
			<div style={labelStyle} title={name ?? imageId}>
				{name ?? `${imageId.slice(0, 8)}…`}
			</div>
		</div>
	);
};
