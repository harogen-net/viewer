import { Button, Group, Menu, Tooltip } from "@mantine/core";
import {
	IconChevronDown,
	IconDeviceFloppy,
	IconFileSpark,
	IconFolderOpen,
	IconReload,
	IconTrash,
} from "@tabler/icons-react";
import type { FC } from "react";
import { useCallback, useEffect, useState } from "react";
import { useAlert } from "../../../hooks/useAlert";
import {
	useStorage,
	type StoredDocThumbnail,
	type StoredSlideTitle,
} from "../../../hooks/useStorage";
import { useToast } from "../../../hooks/useToast";
import { useSlideStore } from "../../../state/slideStore";
import { useViewerDocumentStore } from "../../../state/viewerDocumentStore";
import type { ViewerDocument } from "../../../types/ViewerDocument";
import { collectImageMap } from "../../../utils/collectImageMap";
import { DateUtil } from "../../../utils/DateUtil";
import { generateDocThumbnailStrip } from "../../../utils/slideThumbnail";
import { createNewViewerDocument } from "../../../utils/viewerDocumentFactory";
import { DocumentPickerModal } from "../DocumentPickerModal";
import { FileIOSubMenu } from "./FileIOSubMenu";
import { FileSelector } from "./FileSelector";
import { useFileIOCommon } from "./useFileIOCommon";

export const FileIOToolbar: FC<{ readOnly?: boolean }> = ({ readOnly = false }) => {
	const { listTitles, loadByTitle, save, deleteByTitle, loadThumbnails } = useStorage();
	const setDocument = useViewerDocumentStore((s) => s.setDocument);
	const markSaved = useViewerDocumentStore((s) => s.markSaved);
	const meta = useViewerDocumentStore((s) => s.meta);
	const modified = useViewerDocumentStore((s) => s.modified);
	const slides = useSlideStore((s) => s.slides);
	const selectedIndex = useSlideStore((s) => s.selectedIndex);
	const alert = useAlert();
	const toast = useToast();
	const { wrap, confirmDiscardIfModified } = useFileIOCommon();

	const [titles, setTitles] = useState<StoredSlideTitle[]>([]);
	const [selectedTitle, setSelectedTitle] = useState<string | null>(null);
	const [pickerOpen, setPickerOpen] = useState(false);
	const [thumbnails, setThumbnails] = useState<Record<string, StoredDocThumbnail>>({});

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

	// ビジュアルピッカー: 一覧 + サムネをまとめ読みしてギャラリーを開く。
	const handleOpenPicker = wrap(async () => {
		if (!(await confirmDiscardIfModified())) return;
		await refreshTitles();
		setThumbnails(await loadThumbnails());
		setPickerOpen(true);
	});
	// ギャラリーでカードを選択 → 閉じてロード (未保存ガードは handleSelectChange 内)。
	const handlePick = (title: string): void => {
		setPickerOpen(false);
		handleSelectChange(title, false); // confirmDiscard は既に handleOpenPicker で済ませている
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
	const handleSelectChange = (v: string | null, confirmDiscard = true): void => {
		if (!v) {
			setSelectedTitle(null);
			return;
		}
		wrap(async () => {
			if (confirmDiscard && !(await confirmDiscardIfModified())) return;
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
			// selectedIndex を起点にサムネを並べる (モーダル初期表示=選択中スライドにできる)。
			const thumbnail = await generateDocThumbnailStrip(doc, collectImageMap(), {
				frameMaxPx: 320,
				mimeType: "image/png",
				selectedIndex,
			}).catch(() => null);
			const { title } = await save(doc, { override, thumbnail });
			// 保存名を meta へ同期し modified を解除 (beforeunload / 未保存ガードの誤発火を防ぐ。
			// override 時は同名、新規時は採番された日付 title を反映 → 直後の上書きが正しい対象になる)。
			markSaved(title);
			toast.success(`保存しました: ${title}`);
			await refreshTitles();
		});

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
	// 再読み込み可否: 現在の document が保存済み (titles に存在) かつ未保存変更がある時のみ。
	const currentSaved = !!meta && titles.some((t) => t.title === meta.title);
	const canReload = currentSaved && modified;

	// 保存 (統合): 名前付き document は上書き (該当レコードが無ければ save 内で add = 新規保存)。
	// 未命名 ("(new)"/"") は新規 (date string title) として保存。
	// 「新規ドキュメントとして保存」(常に新 title) はプルダウンの handleSave(false)。
	const handleSavePrimary = handleSave(canOverride);

	return (
		<>
			<Group gap="xs" wrap="wrap">
				{!readOnly && (
					<Button
						leftSection={<IconFileSpark stroke={2} />}
						size="xs"
						variant="default"
						onClick={handleNew}
						disabled={readOnly}
						data-action="new">
						新規
					</Button>
				)}
				<Button
					leftSection={<IconFolderOpen stroke={2} />}
					size="xs"
					color="yellow"
					variant="filled"
					w={100}
					onClick={handleOpenPicker}
					data-action="open-picker">
					開く
				</Button>

				<FileSelector titles={titles} selectedTitle={selectedTitle} onChange={handleSelectChange} />
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
						<Button.Group>
							<Button
								leftSection={<IconDeviceFloppy stroke={2} />}
								size="xs"
								variant="filled"
								color="blue"
								onClick={handleSavePrimary}
								disabled={!hasSlides}
								data-action="save"
								aria-label="保存">
								保存
							</Button>

							<Menu shadow="md" position="bottom-end">
								<Menu.Target>
									<Button
										px={10}
										size="xs"
										variant="filled"
										color="blue"
										disabled={!hasSlides}
										data-action="save-more"
										aria-label="保存オプション">
										<IconChevronDown size={16} />
									</Button>
								</Menu.Target>

								<Menu.Dropdown>
									<Menu.Item onClick={handleSave(false)}>別名で保存...</Menu.Item>
								</Menu.Dropdown>
							</Menu>
						</Button.Group>
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
				<FileIOSubMenu readOnly={readOnly} onTitleChange={handleSelectChange} />
			</Group>
			<DocumentPickerModal
				opened={pickerOpen}
				onClose={() => setPickerOpen(false)}
				titles={titles}
				thumbnails={thumbnails}
				selectedTitle={selectedTitle}
				onPick={handlePick}
			/>
		</>
	);
};
