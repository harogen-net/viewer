import {
	ActionIcon,
	Button,
	Group,
	Paper,
	Select,
	Stack,
	Text,
	Title,
	Tooltip,
} from "@mantine/core";
import type { ChangeEvent, FC } from "react";
import { useCallback, useEffect, useRef, useState } from "react";
import { useAlert } from "../../hooks/useAlert";
import { useFileIO } from "../../hooks/useFileIO";
import { useStorage, type StoredSlideTitle } from "../../hooks/useStorage";
import { useDocSettingsStore } from "../../state/docSettingsStore";
import { useImageLibraryStore } from "../../state/imageLibraryStore";
import { useSlideStore } from "../../state/slideStore";
import { useViewerDocumentStore } from "../../state/viewerDocumentStore";
import type { ViewerDocument } from "../../types/ViewerDocument";
import { adjacentTitleIndex } from "../../utils/fileNavOps";
import { generateSlideThumbnailDataURL } from "../../utils/slideThumbnail";
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

export const FileIOPanel: FC = () => {
	const { listTitles, loadByTitle, save, deleteByTitle, loadThumbnails } = useStorage();
	const { exportHvd, exportHvz, exportPng, importFile, exportSlidePng, exportAllSlidesZip } =
		useFileIO();
	const setDocument = useViewerDocumentStore((s) => s.setDocument);
	const markSaved = useViewerDocumentStore((s) => s.markSaved);
	const meta = useViewerDocumentStore((s) => s.meta);
	const modified = useViewerDocumentStore((s) => s.modified);
	const openNewDocSettings = useDocSettingsStore((s) => s.openNew);
	const slides = useSlideStore((s) => s.slides);
	const selectedIndex = useSlideStore((s) => s.selectedIndex);
	const alert = useAlert();

	const [titles, setTitles] = useState<StoredSlideTitle[]>([]);
	const [selectedTitle, setSelectedTitle] = useState<string | null>(null);
	const [msg, setMsg] = useState<string | null>(null);
	const [pickerOpen, setPickerOpen] = useState(false);
	const [thumbnails, setThumbnails] = useState<Record<string, string>>({});
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
			setMsg(`error: ${String(e)}`);
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

	// 新規は doc 設定モーダル (mode="new") を開き、OK で作成する (UI を編集と共用)。
	const handleNew = wrap(async () => {
		if (!(await confirmDiscardIfModified())) return;
		setSelectedTitle(null);
		openNewDocSettings();
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
				setMsg(`loaded: ${doc.title} (${doc.slides.length} slides)`);
			} else {
				setMsg(`data missing for title: ${v}`);
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
			setMsg(`reloaded: ${doc.title}`);
		} else {
			setMsg(`data missing for title: ${title}`);
		}
	});

	const handleSave = (override: boolean) =>
		wrap(async () => {
			if (!meta) {
				setMsg("document が未ロード");
				return;
			}
			const doc: ViewerDocument = { ...meta, slides };
			// ビジュアルピッカー用サムネを生成 (best-effort、失敗時は null = サムネ無し)。
			const thumbnail = await generateSlideThumbnailDataURL(doc, collectImageMap(), {
				maxPx: 240,
				mimeType: "image/jpeg",
				quality: 0.72,
			}).catch(() => null);
			const { title } = await save(doc, { override, thumbnail });
			// 保存名を meta へ同期し modified を解除 (beforeunload / 未保存ガードの誤発火を防ぐ。
			// override 時は同名、新規時は採番された日付 title を反映 → 直後の上書きが正しい対象になる)。
			markSaved(title);
			setMsg(`saved as: ${title}`);
			await refreshTitles();
		});

	const handleExportHvd = wrap(async () => {
		if (!meta) {
			setMsg("document が未ロード");
			return;
		}
		setMsg(await exportHvd({ ...meta, slides }, collectImageMap()));
	});
	const handleExportHvz = wrap(async () => {
		if (!meta) {
			setMsg("document が未ロード");
			return;
		}
		setMsg(await exportHvz({ ...meta, slides }, collectImageMap()));
	});
	const handleExportPng = wrap(async () => {
		if (!meta) {
			setMsg("document が未ロード");
			return;
		}
		setMsg(await exportPng({ ...meta, slides }, collectImageMap()));
	});
	// 現在選択中のスライドを画像 PNG で書き出す (§4、背景は doc.bgColor)。
	const handleExportSlidePng = wrap(async () => {
		if (!meta || selectedIndex < 0) {
			setMsg("スライドを選択してください");
			return;
		}
		setMsg(await exportSlidePng({ ...meta, slides }, collectImageMap(), selectedIndex));
	});
	// 有効スライドを全て画像 PNG 化して ZIP 書き出し (§10)。
	const handleExportZip = wrap(async () => {
		if (!meta) {
			setMsg("document が未ロード");
			return;
		}
		setMsg(await exportAllSlidesZip({ ...meta, slides }, collectImageMap()));
	});

	const onFileSelected = (e: ChangeEvent<HTMLInputElement>): void => {
		const file = e.target.files?.[0];
		e.target.value = ""; // 同じファイルを連続選択できるよう reset
		if (!file) return;
		wrap(async () => {
			if (!(await confirmDiscardIfModified())) return;
			const result = await importFile(file);
			if (!result) {
				setMsg(`未対応拡張子: ${file.name}`);
				return;
			}
			setDocument(result.doc);
			useImageLibraryStore.getState().setImageLibrary(result.imageData);
			setSelectedTitle(null);
			setMsg(`imported: ${result.doc.title} (${result.doc.slides.length} slides)`);
		})();
	};

	const handleDelete = wrap(async () => {
		if (!selectedTitle) {
			setMsg("削除する title を選択してください");
			return;
		}
		if (!(await alert.confirm(`delete "${selectedTitle}" ?`))) return;
		await deleteByTitle(selectedTitle);
		setMsg(`deleted: ${selectedTitle}`);
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
		<Paper withBorder p="md" radius="sm">
			<Stack gap="xs">
				<Group justify="space-between" align="center">
					<Title order={5}>File IO</Title>
					<Text size="xs" c="dimmed" ff="monospace">
						document: {meta?.title ?? "(none)"} / slides: {slides.length}
					</Text>
				</Group>
				<Group gap="xs" wrap="wrap">
					<Button size="xs" variant="default" onClick={handleNew}>
						📄 新規
					</Button>
					<Button size="xs" variant="default" onClick={handleOpenPicker} data-action="open-picker">
						🖼 ギャラリーから開く
					</Button>
					<Button size="xs" variant="default" onClick={() => fileInputRef.current?.click()}>
						📂 import
					</Button>
					<input
						ref={fileInputRef}
						type="file"
						accept=".hvd,.hvz,.png"
						onChange={onFileSelected}
						style={{ display: "none" }}
					/>
					<Group gap={4} wrap="nowrap">
						<Tooltip label="前の保存ファイル">
							<ActionIcon
								size="lg"
								variant="default"
								onClick={() => goToIndex(prevIndex)}
								disabled={prevIndex < 0}
								data-file-nav="prev"
								aria-label="前の保存ファイル">
								◀
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
								size="lg"
								variant="default"
								onClick={() => goToIndex(nextIndex)}
								disabled={nextIndex < 0}
								data-file-nav="next"
								aria-label="次の保存ファイル">
								▶
							</ActionIcon>
						</Tooltip>
					</Group>
					<Tooltip label="保存時の状態に戻す (未保存の変更を破棄)" disabled={canReload}>
						<Button
							size="xs"
							variant="default"
							onClick={handleReload}
							disabled={!canReload}
							data-action="reload">
							↺ 元に戻す
						</Button>
					</Tooltip>
					<Button
						size="xs"
						variant="filled"
						color="blue"
						onClick={handleSave(false)}
						disabled={!hasSlides}
						data-action="save-new">
						💾 保存 (新規)
					</Button>
					<Tooltip label="現在の document に上書き" disabled={canOverride}>
						<Button
							size="xs"
							variant="filled"
							color="blue"
							onClick={handleSave(true)}
							disabled={!canOverride || !hasSlides}
							data-action="save-override">
							💾 上書き
						</Button>
					</Tooltip>
					<Button size="xs" variant="default" onClick={handleExportHvd} disabled={!hasSlides}>
						⬇ HVD
					</Button>
					<Button size="xs" variant="default" onClick={handleExportHvz} disabled={!hasSlides}>
						⬇ HVZ
					</Button>
					<Button size="xs" variant="default" onClick={handleExportPng} disabled={!hasSlides}>
						⬇ PNG
					</Button>
					<ActionIcon
						size="lg"
						variant="default"
						color="red"
						onClick={handleDelete}
						disabled={!selectedTitle}
						aria-label="削除">
						🗑
					</ActionIcon>
					<Group gap="xs" wrap="wrap">
						<Tooltip label="選択中スライドを PNG 画像で保存" disabled={selectedIndex >= 0}>
							<Button
								size="xs"
								variant="default"
								onClick={handleExportSlidePng}
								disabled={selectedIndex < 0}
								data-action="export-slide-png">
								🖼 スライド PNG
							</Button>
						</Tooltip>
						<Tooltip label="有効な全スライドを ZIP で保存" disabled={hasEnabledSlide}>
							<Button
								size="xs"
								variant="default"
								onClick={handleExportZip}
								disabled={!hasEnabledSlide}
								data-action="export-all-zip">
								🗜 全スライド ZIP
							</Button>
						</Tooltip>
					</Group>
				</Group>
				{/* スライド画像出力 (§4/§10): 単ページ PNG / 全ページ ZIP。背景は doc.bgColor。 */}
				{msg && (
					<Text size="xs" c="dimmed" ff="monospace">
						{msg}
					</Text>
				)}
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
