import { ConfirmDialog } from "@/components/common/ConfirmDialog";
import { useImageLibraryMutation } from "@/hooks/useImageLibraryMutation";
import { useLayerMutation } from "@/hooks/useLayerMutation";
import { useToast } from "@/hooks/useToast";
import { useImageLibraryStore } from "@/state/imageLibraryStore";
import { useLayerStore } from "@/state/layerStore";
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
	Tooltip,
} from "@mantine/core";
import {
	IconDotsVertical,
	IconDownload,
	IconPlus,
	IconRefresh,
	IconReplace,
	IconTrash,
} from "@tabler/icons-react";
import type {
	CSSProperties,
	FC,
	ChangeEvent as ReactChangeEvent,
	DragEvent as ReactDragEvent,
} from "react";
import { useEffect, useRef, useState } from "react";

// ImageLibraryPanel (v4 Group D D-6a、§0-10 新側内製、Mantine Drawer + Modal)。
// レガシー src/utils/ImageManager.ts (jQuery + singleton DOM) は import せず新規実装。
//
// D-6a スコープ:
//   - 画像一覧表示 (imageLibraryStore.imageById の thumbnail grid)
//   - ファイル picker での画像追加 (Mantine FileButton)
//   - panel 全体への drop zone (ファイル drop で追加、複数ファイル対応)
//   - 画像削除 (ConfirmDialog で「使用中の N レイヤーも削除されます」確認)
//
// 操作はタイル右上の … メニューで明示的に行う (クリック自動配置・mode タブは廃止):
//   - 配置: 選択中スライドにこの画像を中央 contain 配置
//   - 別ファイルに一括差し替え: タイルの画像を "外部ファイル" で全 slide 一括差し替え
//                    (LayerOps の同一画像差し替え = replaceImageIdAll と同等、旧画像は孤児なら除去)
//   - DL / 削除
//   - タイル本体は編集 canvas へのドラッグ元 (D-11、imageId を dataTransfer に載せる)
//
// 差し替えモード (ライブラリ内画像で選択レイヤーを差し替え):
//   - 未ロックの ImageLayer を選択中にライブラリを開くと、各タイル左上に差し替えアイコンが出て、
//     押下でそのタイルの画像に "選択中レイヤーのみ" を差し替える (replaceImageId、transform 維持)。
//   - 現在画像のタイルは差し替えアイコンを非表示。差し替え後は Drawer を閉じて結果を見せる。
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
	const { replaceImageId, replaceImageIdAll } = useLayerMutation();
	const selectedSlideIndex = useSlideStore((s) => s.selectedIndex);
	const slides = useSlideStore((s) => s.slides);
	const selectedLayer = useLayerStore((s) => s.selectedLayer);
	const toast = useToast();
	const canPlace = selectedSlideIndex >= 0;

	// 選択中レイヤーの差し替え (ライブラリ内画像で置換)。
	// EditOpsPanel と同様に selectedLayer の現在 index を毎回 findIndex で求める。
	// 対象は「選択中スライドにある、未ロックの ImageLayer」のみ (対象範囲は選択レイヤー 1 枚)。
	const selectedSlide = selectedSlideIndex >= 0 ? slides[selectedSlideIndex] : null;
	const selectedLayerIndex =
		selectedSlide && selectedLayer
			? selectedSlide.layers.findIndex((l) => l.uuid === selectedLayer.uuid)
			: -1;
	const selectedImageLayer =
		selectedLayerIndex >= 0 && selectedSlide ? selectedSlide.layers[selectedLayerIndex] : null;
	// 差し替え可否: ImageLayer かつ未ロックのときだけタイルを差し替えボタン化する。
	const canReplaceSelected = selectedImageLayer?.type === "image" && !selectedImageLayer.locked;
	const selectedLayerImageId =
		selectedImageLayer?.type === "image" ? selectedImageLayer.imageId : null;

	// タイル押下で選択レイヤーの imageId をそのタイルの画像へ差し替え、Drawer を閉じて結果を見せる。
	// 同一画像なら no-op (layerOps.replaceImageId 側でも弾かれるが、close/通知の無駄も避ける)。
	const handleReplaceSelectedLayer = (imageId: string) => {
		if (!canReplaceSelected || selectedLayerIndex < 0) return;
		if (imageId === selectedLayerImageId) return;
		replaceImageId(selectedLayerIndex, imageId);
		toast.success("選択中レイヤーの画像を差し替えました");
		onClose();
	};
	// ライブラリ画像をドラッグ中は Drawer を閉じて下のキャンバスへドロップできるようにする。
	// document レベルで dragstart/dragend/mouseup を監視 (per-tile 遅延 true と dragend の
	// 競合による stuck を避け、また Drawer 内部からドラッグが始まるので portal をまたぐ問題を回避)。
	const [dragging, setDragging] = useState(false);
	const shrinkTimer = useRef<number | null>(null);
	useEffect(() => {
		// [DIAG imglib-drag] 特定端末 (Windows Chrome PWA) で dragend/mouseup が発火せず
		// dragging=true に stuck する報告あり。原因切り分け用に一時ロギングを仕込む。
		// 抽出方法: DevTools コンソールで `imglib-drag` フィルタ。問題確認後に撤去する。
		const LOG_TAG = "[imglib-drag]";
		const t0 = performance.now();
		const log = (evt: string, extra?: Record<string, unknown>): void => {
			// eslint-disable-next-line no-console
			console.log(LOG_TAG, `${(performance.now() - t0).toFixed(0)}ms`, evt, extra ?? {});
		};
		const stuckWatchdog = { id: null as number | null };
		const armWatchdog = (): void => {
			if (stuckWatchdog.id != null) clearTimeout(stuckWatchdog.id);
			// 10s 経っても解除イベントが来なければ stuck 判定 (=dragend/mouseup 未発火の証拠)
			stuckWatchdog.id = window.setTimeout(() => {
				log("STUCK-DETECTED (>10s no dragend/mouseup)", { dragging: true });
			}, 10_000);
		};
		const disarmWatchdog = (): void => {
			if (stuckWatchdog.id != null) {
				clearTimeout(stuckWatchdog.id);
				stuckWatchdog.id = null;
			}
		};
		const targetInfo = (e: Event): Record<string, unknown> => {
			const t = e.target as HTMLElement | null;
			return {
				tag: t?.tagName,
				id: t?.id,
				tile: !!t?.closest?.("[data-image-tile]"),
				imgId: t?.closest?.("[data-image-tile]")?.getAttribute("data-image-id") ?? null,
			};
		};

		const clearPending = (): void => {
			if (shrinkTimer.current != null) {
				clearTimeout(shrinkTimer.current);
				shrinkTimer.current = null;
			}
		};
		// ライブラリ発源のドラッグが in-flight の間だけログ/state 変更を有効化。
		// (無関係な UI クリックの pointerup/mouseup/blur を拾ってノイズ + 意図せぬ setDragging(false) を防ぐ)
		let inDrag = false;
		const onDocDragStart = (e: DragEvent): void => {
			// ライブラリ画像のドラッグのときだけ反応 (タイル内発源で判定)。
			const target = e.target as HTMLElement | null;
			if (!target?.closest?.("[data-image-tile]")) return;
			log("dragstart(doc)", targetInfo(e));
			inDrag = true;
			clearPending();
			// dragstart 内で同期的に state を変えると Chrome がドラッグを中止するため次 tick で反映。
			shrinkTimer.current = window.setTimeout(() => {
				log("setDragging(true) fired via setTimeout");
				setDragging(true);
				armWatchdog();
			}, 0);
		};
		const endDrag =
			(source: string) =>
			(e: Event): void => {
				if (!inDrag) return; // ライブラリ drag 中でなければ無視 (無関係なクリック等)
				log(`endDrag via ${source}`, targetInfo(e));
				inDrag = false;
				clearPending(); // 遅延 true が残っていれば取り消して stuck を防ぐ
				disarmWatchdog();
				setDragging(false);
			};
		// 追加の観測用 (発火してるかどうかを見るため。状態変更は endDrag 経路のみ)
		const observe =
			(name: string) =>
			(e: Event): void => {
				if (!inDrag) return;
				log(`observe: ${name}`, targetInfo(e));
			};
		const onStart = onDocDragStart;
		const onEndDragEnd = endDrag("dragend");
		const onEndMouseUp = endDrag("mouseup");
		const onEndPointerUp = endDrag("pointerup");
		const onEndPointerCancel = endDrag("pointercancel");
		const onEndDrop = endDrag("drop");
		const onEndBlur = endDrag("window.blur");
		const onEndVisChange = (): void => {
			if (document.visibilityState === "hidden") endDrag("visibilitychange.hidden")(new Event("v"));
		};
		const onObserveDragOver = observe("dragover");
		const onObserveDragEnter = observe("dragenter");
		const onObserveDragLeave = observe("dragleave");

		document.addEventListener("dragstart", onStart, true);
		document.addEventListener("mouseup", onEndMouseUp, true);
		document.addEventListener("dragend", onEndDragEnd, true);
		document.addEventListener("pointerup", onEndPointerUp, true);
		document.addEventListener("pointercancel", onEndPointerCancel, true);
		document.addEventListener("drop", onEndDrop, true);
		window.addEventListener("blur", onEndBlur, true);
		document.addEventListener("visibilitychange", onEndVisChange, true);
		// 発火有無の観測 (throttle しないと大量に出るので dragover は 1s に 1 回だけ)
		let lastOverLog = 0;
		const onOverThrottled = (e: Event): void => {
			const now = performance.now();
			if (now - lastOverLog > 1000) {
				lastOverLog = now;
				onObserveDragOver(e);
			}
		};
		document.addEventListener("dragover", onOverThrottled, true);
		document.addEventListener("dragenter", onObserveDragEnter, true);
		document.addEventListener("dragleave", onObserveDragLeave, true);
		log("listeners attached");
		return () => {
			document.removeEventListener("dragstart", onStart, true);
			document.removeEventListener("mouseup", onEndMouseUp, true);
			document.removeEventListener("dragend", onEndDragEnd, true);
			document.removeEventListener("pointerup", onEndPointerUp, true);
			document.removeEventListener("pointercancel", onEndPointerCancel, true);
			document.removeEventListener("drop", onEndDrop, true);
			window.removeEventListener("blur", onEndBlur, true);
			document.removeEventListener("visibilitychange", onEndVisChange, true);
			document.removeEventListener("dragover", onOverThrottled, true);
			document.removeEventListener("dragenter", onObserveDragEnter, true);
			document.removeEventListener("dragleave", onObserveDragLeave, true);
			disarmWatchdog();
			clearPending();
			log("listeners detached");
		};
	}, []);
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

	const wrapStyle: CSSProperties = {
		minHeight: "100%",
	};

	return (
		<>
			<Drawer
				opened={opened && !dragging}
				onClose={onClose}
				title="画像ライブラリ"
				position="bottom"
				size={"80vh"}
				padding="md"
				// ドラッグ中だけ非モーダル化 (overlay / trap / scroll lock / click-outside を切る):
				// Drawer は opened=false で閉じるが、モーダル behaviour が残ると裏の canvas への
				// ドロップを奪う可能性があるので念のため全て !dragging に連動。
				// 非ドラッグ時は通常の Drawer (backdrop クリックで閉じる)。
				withOverlay={!dragging}
				trapFocus={!dragging}
				lockScroll={!dragging}
				closeOnClickOutside={!dragging}
				data-image-library-panel
				// keepMounted は dragging に連動: drag 中だけ mount を保って drag 元の <img> が
				// unmount されないようにする (source が消えると一部ブラウザで drag が abort する)。
				// 通常 close 時は unmount して DOM/メモリを解放。
				keepMounted={dragging}>
				<Box style={wrapStyle}>
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
								<Text c="dimmed">「画像を追加」ボタン、またはメインエリアへのドロップで追加</Text>
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
											canReplaceSelected={canReplaceSelected}
											isCurrentLayerImage={id === selectedLayerImageId}
											onReplaceSelectedLayer={() => handleReplaceSelectedLayer(id)}
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
				</Box>
			</Drawer>

			{/* ドラッグ中だけ画面下部に出るキャンセルゾーン。Mantine を通さない素の div なので
			    Drawer の size 遷移や overlay 再構築と競合しない。ここへドロップすると何もしない (= キャンセル)。 */}
			{dragging && (
				<div
					style={{
						position: "fixed",
						left: 0,
						right: 0,
						bottom: 0,
						height: "20vh",
						zIndex: 300,
						background: "white",
						boxSizing: "border-box",
						boxShadow: "0 0 8px rgba(0,0,0,0.3)",
						pointerEvents: "auto",
						padding: 16,
					}}
					onDragOver={(e) => e.preventDefault()}
					onDrop={(e) => e.preventDefault()}
					data-image-cancel-zone>
					<div
						style={{
							fontSize: 14,
							userSelect: "none",
							border: "1px solid #dee2e6",
							background: "#f8f9fa",
							padding: 8,
							borderRadius: 4,
							width: "100%",
							height: "100%",
							display: "flex",
							alignItems: "center",
							justifyContent: "center",
						}}>
						<Text size="sm" c="dimmed">
							ここへ戻すとキャンセル (ESC でも中断)
						</Text>
					</div>
				</div>
			)}

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
	// canReplaceSelected: 選択中レイヤー (未ロック ImageLayer) があり、タイルを差し替えボタン化できる。
	canReplaceSelected: boolean;
	// isCurrentLayerImage: このタイルが選択中レイヤーの現在画像 (= 差し替え不要、使用中表示)。
	isCurrentLayerImage: boolean;
	onReplaceSelectedLayer: () => void;
	onPlace: () => void;
	onReplace: () => void;
	onDelete: () => void;
	onDownload: () => void;
}> = ({
	imageId,
	dataURL,
	name,
	canPlace,
	canReplaceSelected,
	isCurrentLayerImage,
	onReplaceSelectedLayer,
	onPlace,
	onReplace,
	onDelete,
	onDownload,
}) => {
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
		transition: "box-shadow 120ms",
	};
	// 画像だけを draggable にする (ゴーストは画像のみ)。カーソルは通常の画像同様デフォルト。
	const imgStyle: CSSProperties = {
		maxWidth: "100%",
		maxHeight: "100%",
		objectFit: "contain",
	};
	// 操作 (…) メニュートリガー (右上)。
	const menuWrapStyle: CSSProperties = {
		position: "absolute",
		top: 4,
		right: 4,
		zIndex: 2,
	};
	// 差し替えモード時のみタイル左上に出る差し替えアイコンボタン (… メニューと左右対)。
	// canReplaceSelected の間だけ表示し、押下でそのタイルの画像に選択レイヤーを差し替える。
	// 現在画像のタイルは差し替え不要なのでボタン自体を非表示にする (下の JSX 条件)。
	const replaceBtnStyle: CSSProperties = {
		position: "absolute",
		top: 4,
		left: 4,
		zIndex: 2,
	};
	const labelStyle: CSSProperties = {
		position: "absolute",
		zIndex: 2,
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
	// ドラッグ元は画像 (<img>) 自身にする (§11、legacy: dataTransfer.setData("imageId"))。
	// tile <div> 全体を draggable にするとゴーストがラベル/メニュー込みになり、カーソルも grab に
	// なってしまうため、<img> だけを draggable にして「画像だけ」をドラッグする。
	// 編集 canvas / スライド一覧の useDrop が imageId を受けて配置 (D-11)。
	const handleDragStart = (e: ReactDragEvent<HTMLImageElement>) => {
		e.dataTransfer.setData("imageId", imageId);
		e.dataTransfer.effectAllowed = "copy";
	};
	return (
		<div style={tileStyle} data-image-tile data-image-id={imageId}>
			<img
				src={dataURL}
				alt={name ?? imageId.slice(0, 8)}
				style={imgStyle}
				draggable
				onDragStart={handleDragStart}
			/>
			{/* 差し替えモード (選択中に未ロック ImageLayer あり): タイル左上に差し替えアイコンを出す。
			    押下でそのタイルの画像へ選択レイヤーを差し替える。現在画像のタイルは非表示。 */}
			{canReplaceSelected && !isCurrentLayerImage && (
				<Tooltip label="この画像に差し替え" withArrow>
					<ActionIcon
						variant="filled"
						size="md"
						style={replaceBtnStyle}
						onClick={(e) => {
							e.stopPropagation();
							onReplaceSelectedLayer();
						}}
						data-image-replace-selected
						aria-label={"選択中レイヤーをこの画像に差し替え"}>
						<IconReplace size={16} stroke={2} />
					</ActionIcon>
				</Tooltip>
			)}
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
							size="md"
							variant="default"
							data-image-menu
							aria-label="画像の操作メニュー"
							onClick={(e) => e.stopPropagation()}>
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
