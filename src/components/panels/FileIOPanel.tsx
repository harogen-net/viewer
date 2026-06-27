import { ActionIcon, Button, Group, Menu, Paper, Select, Stack, Tooltip } from "@mantine/core";
import {
	IconBookDownload,
	IconChevronLeft,
	IconChevronRight,
	IconDeviceFloppy,
	IconDotsVertical,
	IconFileSpark,
	IconFileText,
	IconPackageExport,
	IconPackageImport,
	IconReload,
	IconTrash,
} from "@tabler/icons-react";
import type { ChangeEvent, FC } from "react";
import { useCallback, useEffect, useRef, useState } from "react";
import { useAlert } from "../../hooks/useAlert";
import { useFileIO } from "../../hooks/useFileIO";
import { useStorage, type StoredDocThumbnail, type StoredSlideTitle } from "../../hooks/useStorage";
import { useToast } from "../../hooks/useToast";
import { useImageLibraryStore } from "../../state/imageLibraryStore";
import { useSlideStore } from "../../state/slideStore";
import { useViewerDocumentStore } from "../../state/viewerDocumentStore";
import type { ViewerDocument } from "../../types/ViewerDocument";
import { DateUtil } from "../../utils/DateUtil";
import { adjacentTitleIndex } from "../../utils/fileNavOps";
import { generateDocThumbnailStrip } from "../../utils/slideThumbnail";
import { createNewViewerDocument } from "../../utils/viewerDocumentFactory";
import { DocumentPickerModal } from "./DocumentPickerModal";

// ファイル IO パネル (v3 Group B build、§0-10 新側内製、Mantine UI)。
// レガシー src/viewController/file/FileSelector.ts (jQuery) + Viewer.ts の
// .save / .load / .new / .import / .export ハンドラ群を 1 component に統合。
//
// 役割分担:
//   - 新規 / 一覧 / 開く / 保存 / 削除: 本 component + useStorage (IDB)
//   - import / export (HVD/HVZ/PNG):  useFileIO に委譲 (doc / imageMap を注入)
//   - store 反映 (setDocument / setImageLibrary) は本 component 側で行う

/** imageLibraryStore から imageId → dataURL の map を集める (export 用)。 */
const collectImageMap = (): Record<string, string> => {
	const imageMap: Record<string, string> = {};
	const library = useImageLibraryStore.getState().imageById;
	for (const [id, entry] of Object.entries(library)) {
		imageMap[id] = entry.dataURL;
	}
	return imageMap;
};

// readOnly (閲覧モード) では書込系 (新規 / 保存 / 上書き / import / 削除 / 元に戻す) を隠し、
// 開く (一覧 / 前後移動 / ギャラリー) と出力 (PNG/HVD/HVZ/ZIP) のみ残す。
export const FileIOPanel: FC<{ readOnly?: boolean }> = ({ readOnly = false }) => {
	const { listTitles, loadByTitle, save, deleteByTitle, loadThumbnails } = useStorage();
	const { exportHvd, exportHvz, exportPng, importFile, exportAllSlidesZip } = useFileIO();
	const setDocument = useViewerDocumentStore((s) => s.setDocument);
	const markSaved = useViewerDocumentStore((s) => s.markSaved);
	const meta = useViewerDocumentStore((s) => s.meta);
	const modified = useViewerDocumentStore((s) => s.modified);
	const slides = useSlideStore((s) => s.slides);
	const alert = useAlert();
	const toast = useToast();

	const [titles, setTitles] = useState<StoredSlideTitle[]>([]);
	const [selectedTitle, setSelectedTitle] = useState<string | null>(null);
	const [pickerOpen, setPickerOpen] = useState(false);
	const [thumbnails, setThumbnails] = useState<Record<string, StoredDocThumbnail>>({});
	const fileInputRef = useRef<HTMLInputElement>(null);

	// title 一覧を refresh (update 降順)。
	const refreshTitles = useCallback(async (): Promise<StoredSlideTitle[]> => {
		const ts = await listTitles();
		ts.sort((a, b) => b.update - a.update);
		setTitles(ts);
		return ts;
	}, [listTitles]);

	useEffect(() => {
		refreshTitles().catch((e) => console.error("[FileIOPanel] refreshTitles error:", e));
	}, [refreshTitles]);

	const wrap = (action: () => Promise<void>) => async () => {
		try {
			await action();
		} catch (e) {
			console.error("[FileIOPanel] error:", e);
			toast.error(`エラー: ${String(e)}`);
		}
	};

	// 現在 document を置き換える操作 (新規 / ロード / import) の前に、未保存変更があれば確認する。
	// modified は最新を getState() で読む (load/new/import 後は setDocument が false にリセット)。
	const confirmDiscardIfModified = async (): Promise<boolean> => {
		if (!useViewerDocumentStore.getState().modified) return true;
		return alert.confirm("未保存の変更があります。破棄して続行しますか?", {
			okLabel: "破棄して続行",
			cancelLabel: "キャンセル",
		});
	};

	// ビジュアルピッカー: 一覧 + サムネをまとめ読みしてギャラリーを開く。
	const handleOpenPicker = wrap(async () => {
		await refreshTitles();
		setThumbnails(await loadThumbnails());
		setPickerOpen(true);
	});
	// ギャラリーでカードを選択 → 閉じてロード (未保存ガードは handleSelectChange 内)。
	const handlePick = (title: string): void => {
		setPickerOpen(false);
		handleSelectChange(title);
	};

	// 新規はモーダルを開かず、すべて既定値で document を即作成する (legacy 寄せ)。
	// 既定: title=date string / 画面 landscape 寸法 / 白背景 / slides 空。
	const handleNew = wrap(async () => {
		if (!(await confirmDiscardIfModified())) return;
		setSelectedTitle(null);
		setDocument({ ...createNewViewerDocument(), title: DateUtil.getDateString() });
		toast.success("新規ドキュメントを作成しました");
	});

	// title を選んだ瞬間にロードする (レガシー FileSelector と同挙動)。
	// null クリア時はロードしない (選択のみ解除)。未保存変更があれば確認し、
	// キャンセル時は選択も変えない (Select は controlled なので元の値に戻る)。
	const handleSelectChange = (v: string | null): void => {
		if (!v) {
			setSelectedTitle(null);
			return;
		}
		wrap(async () => {
			if (!(await confirmDiscardIfModified())) return;
			setSelectedTitle(v);
			const doc = await loadByTitle(v);
			if (doc) {
				setDocument(doc);
				toast.success(`ロードしました: ${doc.title} (${doc.slides.length} slides)`);
			} else {
				toast.error(`データが見つかりません: ${v}`);
			}
		})();
	};

	// 現在開いているドキュメントを保存時の状態へ戻す (再読み込み)。
	// 同一 title を Select で選び直しても onChange が発火しないため、専用導線を用意。
	const handleReload = wrap(async () => {
		if (!meta) return;
		const title = meta.title;
		const confirmed = await alert.confirm(
			`"${title}" を保存時の状態に戻します。未保存の変更は失われます。`,
			{
				okLabel: "元に戻す",
				cancelLabel: "キャンセル",
			}
		);
		if (!confirmed) return;
		const doc = await loadByTitle(title);
		if (doc) {
			setDocument(doc);
			setSelectedTitle(doc.title);
			toast.success(`再ロードしました: ${doc.title}`);
		} else {
			toast.error(`データが見つかりません: ${title}`);
		}
	});

	const handleSave = (override: boolean) =>
		wrap(async () => {
			if (!meta) {
				toast.info("ドキュメントが未ロードです");
				return;
			}
			const doc: ViewerDocument = { ...meta, slides };
			// ビジュアルピッカー用の連結サムネ (active から均等ピック→横連結1枚+コマ数) を生成
			// (best-effort、失敗時は null = サムネ無し)。
			// PNG (可逆): 白地に細い色線の簡易イラストは JPEG だと滲み/ブロックで激しく劣化するため。
			const thumbnail = await generateDocThumbnailStrip(doc, collectImageMap(), {
				frameMaxPx: 320,
				mimeType: "image/png",
			}).catch(() => null);
			const { title } = await save(doc, { override, thumbnail });
			// 保存名を meta へ同期し modified を解除 (beforeunload / 未保存ガードの誤発火を防ぐ。
			// override 時は同名、新規時は採番された日付 title を反映 → 直後の上書きが正しい対象になる)。
			markSaved(title);
			toast.success(`保存しました: ${title}`);
			await refreshTitles();
		});

	const handleExportHvd = wrap(async () => {
		if (!meta) {
			toast.info("ドキュメントが未ロードです");
			return;
		}
		toast.success(await exportHvd({ ...meta, slides }, collectImageMap()));
	});
	const handleExportHvz = wrap(async () => {
		if (!meta) {
			toast.info("ドキュメントが未ロードです");
			return;
		}
		toast.success(await exportHvz({ ...meta, slides }, collectImageMap()));
	});
	const handleExportPng = wrap(async () => {
		if (!meta) {
			toast.info("ドキュメントが未ロードです");
			return;
		}
		toast.success(await exportPng({ ...meta, slides }, collectImageMap()));
	});
	// 有効スライドを全て画像 PNG 化して ZIP 書き出し (§10)。
	const handleExportZip = wrap(async () => {
		if (!meta) {
			toast.info("ドキュメントが未ロードです");
			return;
		}
		toast.success(await exportAllSlidesZip({ ...meta, slides }, collectImageMap()));
	});

	const onFileSelected = (e: ChangeEvent<HTMLInputElement>): void => {
		const file = e.target.files?.[0];
		e.target.value = ""; // 同じファイルを連続選択できるよう reset
		if (!file) return;
		wrap(async () => {
			if (!(await confirmDiscardIfModified())) return;
			const result = await importFile(file);
			if (!result) {
				toast.error(`未対応の拡張子です: ${file.name}`);
				return;
			}
			setDocument(result.doc);
			useImageLibraryStore.getState().setImageLibrary(result.imageData);
			setSelectedTitle(null);
			toast.success(`インポートしました: ${result.doc.title} (${result.doc.slides.length} slides)`);
		})();
	};

	const handleDelete = wrap(async () => {
		if (!selectedTitle) {
			toast.info("削除する title を選択してください");
			return;
		}
		if (!(await alert.confirm(`delete "${selectedTitle}" ?`))) return;
		await deleteByTitle(selectedTitle);
		toast.success(`削除しました: ${selectedTitle}`);
		setSelectedTitle(null);
		await refreshTitles();
	});

	const canOverride = !!meta && meta.title !== "" && meta.title !== "(new)";
	const hasSlides = slides.length > 0;
	const hasEnabledSlide = slides.some((s) => !s.disabled);
	const selectData = titles.map((t) => ({ value: t.title, label: t.title }));
	// 再読み込み可否: 現在の document が保存済み (titles に存在) かつ未保存変更がある時のみ。
	const currentSaved = !!meta && titles.some((t) => t.title === meta.title);
	const canReload = currentSaved && modified;

	// 保存 (統合): 名前付き document は上書き (該当レコードが無ければ save 内で add = 新規保存)。
	// 未命名 ("(new)"/"") は新規 (date string title) として保存。
	// 「新規ドキュメントとして保存」(常に新 title) はプルダウンの handleSave(false)。
	const handleSavePrimary = handleSave(canOverride);

	// 保存ファイルの前後移動 (レガシー FileSelector の .fileSelect.up / .down 相当)。
	// 一覧 (update 降順) を 1 件ずつ移動して即ロード。端ではボタン無効 (ラップしない)。
	const currentTitleIndex = selectedTitle ? titles.findIndex((t) => t.title === selectedTitle) : -1;
	const prevIndex = adjacentTitleIndex(titles.length, currentTitleIndex, "prev");
	const nextIndex = adjacentTitleIndex(titles.length, currentTitleIndex, "next");
	const goToIndex = (target: number): void => {
		if (target < 0) return;
		handleSelectChange(titles[target].title);
	};

	return (
		<Paper withBorder p="6" radius="sm">
			<Stack gap="xs">
				{/* <Group justify="space-between" align="center">
					<Title order={5}>File IO</Title>
					<Text size="xs" c="dimmed" ff="monospace">
						document: {meta?.title ?? "(none)"} / slides: {slides.length}
					</Text>
				</Group> */}
				<Group gap="xs" wrap="wrap">
					<Button
						leftSection={<IconFileText stroke={2} />}
						size="xs"
						variant="default"
						onClick={handleOpenPicker}
						data-action="open-picker">
						開く
					</Button>
					<input
						ref={fileInputRef}
						type="file"
						accept=".hvd,.hvz,.png"
						onChange={onFileSelected}
						style={{ display: "none" }}
					/>
					<Group gap={0} wrap="nowrap">
						<Tooltip label="前の保存ファイル">
							<ActionIcon
								size="md"
								variant="default"
								onClick={() => goToIndex(prevIndex)}
								disabled={prevIndex < 0}
								data-file-nav="prev"
								aria-label="前の保存ファイル">
								<IconChevronLeft stroke={2} />
							</ActionIcon>
						</Tooltip>
						<Select
							placeholder="開くファイルを選択"
							value={selectedTitle}
							onChange={handleSelectChange}
							data={selectData}
							clearable
							size="xs"
							w={260}
							nothingFoundMessage="(該当なし)"
						/>
						<Tooltip label="次の保存ファイル">
							<ActionIcon
								size="md"
								variant="default"
								onClick={() => goToIndex(nextIndex)}
								disabled={nextIndex < 0}
								data-file-nav="next"
								aria-label="次の保存ファイル">
								<IconChevronRight stroke={2} />
							</ActionIcon>
						</Tooltip>
					</Group>
					{!readOnly && (
						<>
							<Tooltip label="保存時の状態に戻す (未保存の変更を破棄)" disabled={canReload}>
								<Button
									leftSection={<IconReload stroke={2} />}
									size="xs"
									variant="default"
									onClick={handleReload}
									disabled={!canReload}
									data-action="reload">
									再ロード
								</Button>
							</Tooltip>
							<Button
								leftSection={<IconDeviceFloppy stroke={2} />}
								size="xs"
								variant="filled"
								color="blue"
								onClick={handleSavePrimary}
								disabled={!hasSlides}
								data-action="save">
								保存
							</Button>
						</>
					)}

					{!readOnly && (
						<Button
							leftSection={<IconTrash stroke={2} />}
							size="xs"
							variant="default"
							color="red"
							onClick={handleDelete}
							disabled={!selectedTitle}
							aria-label="削除"
							data-action="delete">
							削除
						</Button>
					)}

					<Menu shadow="md" width={200}>
						<Menu.Target>
							<ActionIcon
								variant="default"
								size="input-xs"
								data-action="open-picker"
								aria-label="その他の操作">
								<IconDotsVertical stroke={2} />
							</ActionIcon>
						</Menu.Target>
						<Menu.Dropdown>
							{!readOnly && (
								<>
									<Menu.Item
										leftSection={<IconFileSpark stroke={2} />}
										onClick={handleNew}
										data-action="new">
										新規
									</Menu.Item>
									<Menu.Item
										leftSection={<IconDeviceFloppy stroke={2} />}
										onClick={handleSave(false)}
										disabled={!hasSlides}
										data-action="save-new">
										新規ドキュメントとして保存
									</Menu.Item>
									<Menu.Item
										leftSection={<IconPackageImport stroke={2} />}
										onClick={() => fileInputRef.current?.click()}
										data-action="import">
										インポート
									</Menu.Item>
								</>
							)}
							<Menu.Item
								leftSection={<IconPackageExport stroke={2} />}
								onClick={handleExportHvd}
								disabled={!hasSlides}
								data-action="export-hvd">
								HVDエクスポート
							</Menu.Item>
							<Menu.Item
								leftSection={<IconPackageExport stroke={2} />}
								onClick={handleExportHvz}
								disabled={!hasSlides}
								data-action="export-hvz">
								HVZエクスポート
							</Menu.Item>
							<Menu.Item
								leftSection={<IconPackageExport stroke={2} />}
								onClick={handleExportPng}
								disabled={!hasSlides}
								data-action="export-png">
								PNGエクスポート
							</Menu.Item>
							<Menu.Item
								leftSection={<IconBookDownload stroke={2} />}
								onClick={handleExportZip}
								disabled={!hasEnabledSlide}
								data-action="export-zip">
								全スライド ZIP ダウンロード
							</Menu.Item>
						</Menu.Dropdown>
					</Menu>
				</Group>
			</Stack>
			<DocumentPickerModal
				opened={pickerOpen}
				onClose={() => setPickerOpen(false)}
				titles={titles}
				thumbnails={thumbnails}
				selectedTitle={selectedTitle}
				onPick={handlePick}
			/>
		</Paper>
	);
};
