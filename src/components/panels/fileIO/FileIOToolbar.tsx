import { DocumentPickerModal } from "@/components/panels/DocumentPickerModal";
import { useAlert } from "@/hooks/useAlert";
import { useDeviceMode } from "@/hooks/useDeviceMode";
import { useProgress } from "@/hooks/useProgress";
import { useStorage, type StoredDoc } from "@/hooks/useStorage";
import { MigrationStatus, isStorageReadable, useMigrationStore } from "@/state/migrationStore";
import { useToast } from "@/hooks/useToast";
import { useImageLibraryStore } from "@/state/imageLibraryStore";
import { useSlideStore } from "@/state/slideStore";
import { useViewerDocumentStore } from "@/state/viewerDocumentStore";
import type { DocId } from "@/types/DocId";
import type { ViewerDocument } from "@/types/ViewerDocument";
import { collectImageMap } from "@/utils/collectImageMap";
import { DateUtil } from "@/utils/DateUtil";
import { generateDocThumbnailStrip } from "@/utils/slideThumbnail";
import { createNewViewerDocument } from "@/utils/viewerDocumentFactory";
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
import { FileIOSubMenu } from "./FileIOSubMenu";
import { FileSelector } from "./FileSelector";
import { useFileIOCommon } from "./useFileIOCommon";

export const FileIOToolbar: FC<{ mobileMode?: boolean }> = ({ mobileMode = false }) => {
	const { listDocs, loadById, save, deleteById, getThumbnail } = useStorage();
	const { run } = useProgress();
	const setDocument = useViewerDocumentStore((s) => s.setDocument);
	const markSaved = useViewerDocumentStore((s) => s.markSaved);
	const meta = useViewerDocumentStore((s) => s.meta);
	const modified = useViewerDocumentStore((s) => s.modified);
	const slides = useSlideStore((s) => s.slides);
	const selectedIndex = useSlideStore((s) => s.selectedIndex);
	const alert = useAlert();
	const toast = useToast();
	const { wrap, confirmDiscardIfModified } = useFileIOCommon();
	const { isMobile } = useDeviceMode();

	const [docs, setDocs] = useState<StoredDoc[]>([]);
	const [selectedId, setSelectedId] = useState<DocId | null>(null);
	const [pickerOpen, setPickerOpen] = useState(false);

	// ドキュメント一覧を refresh (update 降順)。
	const refreshDocs = useCallback(async (): Promise<StoredDoc[]> => {
		const ds = await listDocs();
		ds.sort((a, b) => b.update - a.update);
		setDocs(ds);
		return ds;
	}, [listDocs]);

	// 旧形式の移行状態。
	//   - readable になった時点で引き直す。これが無いと起動直後の 1 回が空振りして一覧が空になる
	//     (probe / 移行の完了は非同期で、初回 effect より後に来る)
	//   - 承認前 (PENDING) は旧ストアの読み取り専用モード。一覧とロードは効くが書込はできない
	const storageReadable = useMigrationStore((s) => isStorageReadable(s.status));
	const readOnlyLegacy = useMigrationStore((s) => s.status === MigrationStatus.PENDING);

	useEffect(() => {
		if (!storageReadable) return;
		refreshDocs().catch((e) => console.error("[FileIOPanel] refreshDocs error:", e));
	}, [refreshDocs, storageReadable]);

	// ビジュアルピッカー: 一覧 (軽量) だけ読んで開く。サムネは各カードが可視時に個別遅延ロードする。
	const handleOpenPicker = wrap(async () => {
		if (!(await confirmDiscardIfModified())) return;
		await refreshDocs();
		setPickerOpen(true);
	});
	// ギャラリーでカードを選択 → 閉じてロード (未保存ガードは handleSelectChange 内)。
	const handlePick = (id: DocId): void => {
		setPickerOpen(false);
		handleSelectChange(id, false); // confirmDiscard は既に handleOpenPicker で済ませている
	};

	// 新規はモーダルを開かず、すべて既定値で document を即作成する (legacy 寄せ)。
	// 既定: title=date string / 画面 landscape 寸法 / 白背景 / slides 空。
	const handleNew = wrap(async () => {
		if (!(await confirmDiscardIfModified())) return;
		setSelectedId(null);
		// 新規作成は前ドキュメントの画像を引き継がない (画像ライブラリをクリア)。
		useImageLibraryStore.getState().setImageLibrary({});
		setDocument({ ...createNewViewerDocument(), title: DateUtil.getDateString() });
		toast.success("新規ドキュメントを作成しました");
	});

	// ドキュメントを選んだ瞬間にロードする (レガシー FileSelector と同挙動)。
	// null クリア時はロードしない (選択のみ解除)。未保存変更があれば確認し、
	// キャンセル時は選択も変えない (Select は controlled なので元の値に戻る)。
	const handleSelectChange = (v: DocId | null, confirmDiscard = true): void => {
		if (!v) {
			setSelectedId(null);
			return;
		}
		wrap(async () => {
			if (confirmDiscard && !(await confirmDiscardIfModified())) return;
			// 進捗バー付きロード。ok=完了(100%まで伸ばす)、notfound/locked=Abort(即消し)。
			let outcome: Awaited<ReturnType<typeof loadById>> | undefined;
			await run("読み込み中…", async (report) => {
				outcome = await loadById(v, report);
				return outcome.status === "ok" ? outcome : null;
			});
			if (outcome?.status === "ok") {
				setSelectedId(v);
				setDocument(outcome.doc);
				toast.success(`ロードしました: ${outcome.doc.title} (${outcome.doc.slides.length} slides)`);
			} else if (outcome?.status === "notfound") {
				toast.error(`データが見つかりません: ${v}`);
			}
			// locked: PW 誤り/未入力。警告モーダルは表示済み。ロードせず現文書・選択を維持する。
		})();
	};

	// 現在開いているドキュメントを保存時の状態へ戻す (再読み込み)。
	// 同一項目を Select で選び直しても onChange が発火しないため、専用導線を用意。
	const handleReload = wrap(async () => {
		if (!meta?.docId) return;
		const { docId, title } = meta;
		const confirmed = await alert.confirm(
			`"${title}" を保存時の状態に戻します。未保存の変更は失われます。`,
			{
				okLabel: "元に戻す",
				cancelLabel: "キャンセル",
			}
		);
		if (!confirmed) return;
		let outcome: Awaited<ReturnType<typeof loadById>> | undefined;
		await run("読み込み中…", async (report) => {
			outcome = await loadById(docId, report);
			return outcome.status === "ok" ? outcome : null;
		});
		if (outcome?.status === "ok") {
			setDocument(outcome.doc);
			setSelectedId(docId);
			toast.success(`再ロードしました: ${outcome.doc.title}`);
		} else if (outcome?.status === "notfound") {
			toast.error(`データが見つかりません: ${title}`);
		}
		// locked: 警告モーダル表示済み。再ロードせず現状維持。
	});

	const handleSave = (override: boolean) =>
		wrap(async () => {
			if (!meta) {
				toast.info("ドキュメントが未ロードです");
				return;
			}
			// 承認前は save が null を返して無音で終わるため、理由を明示する。
			if (readOnlyLegacy) {
				toast.info("旧形式の移行が済むまで保存できません (読み込みと書き出しのみ可能)");
				return;
			}
			const doc: ViewerDocument = { ...meta, slides };
			// 進捗: サムネ生成 (0..0.3) → save (0.3..1)。save 内の暗号化/直列化/書込を後半に写像。
			const result = await run("保存中…", async (report) => {
				report(0.05);
				// ビジュアルピッカー用の連結サムネ (active から均等ピック→横連結1枚+コマ数) を生成
				// (best-effort、失敗時は null = サムネ無し)。PNG (可逆): 白地の細線イラストは JPEG で激しく劣化。
				// selectedIndex を起点に並べる。センシティブ文書はぼかしたサムネを保存 (§sensitive-mode-spec)。
				const thumbnail = await generateDocThumbnailStrip(doc, collectImageMap(), {
					frameMaxPx: 320,
					mimeType: "image/png",
					selectedIndex,
					blur: meta.isSensitive,
				}).catch(() => null);
				report(0.3);
				return save(doc, {
					override,
					thumbnail,
					onProgress: (f) => report(0.3 + f * 0.7),
				});
			});
			if (!result) return; // パスワード入力キャンセル = 保存中止 (無音)
			// 保存名を meta へ同期し modified を解除 (beforeunload / 未保存ガードの誤発火を防ぐ。
			// override 時は同名、新規時は採番された日付 title を反映 → 直後の上書きが正しい対象になる)。
			markSaved(result.title, result.docId);
			// 別名で保存は新しいドキュメント。選択も新しい方へ移す (直後の削除/再ロードが正しい対象になる)。
			setSelectedId(result.docId);
			toast.success(`保存しました: ${result.title}`);
			await refreshDocs();
		});

	const handleDelete = wrap(async () => {
		if (readOnlyLegacy) {
			toast.info("旧形式の移行が済むまで削除できません");
			return;
		}
		if (!selectedId) {
			toast.info("削除するドキュメントを選択してください");
			return;
		}
		const label = docs.find((d) => d.id === selectedId)?.title ?? selectedId;
		if (!(await alert.confirm(`delete "${label}" ?`))) return;
		await deleteById(selectedId);
		toast.success(`削除しました: ${label}`);
		setSelectedId(null);
		await refreshDocs();
	});

	const canOverride = !!meta && meta.title !== "" && meta.title !== "(new)";
	const hasSlides = slides.length > 0;
	// 再読み込み可否: 現在の document が保存済み (docId が一覧に存在) かつ未保存変更がある時のみ。
	const currentSaved = !!meta?.docId && docs.some((d) => d.id === meta.docId);
	const canReload = currentSaved && modified;

	// 保存 (統合): 名前付き document は上書き (該当レコードが無ければ save 内で add = 新規保存)。
	// 未命名 ("(new)"/"") は新規 (date string title) として保存。
	// 「新規ドキュメントとして保存」(常に新 title) はプルダウンの handleSave(false)。
	const handleSavePrimary = handleSave(canOverride);

	return (
		<>
			<Group gap="xs" wrap="wrap">
				{!mobileMode && (
					<Button
						leftSection={<IconFileSpark stroke={2} />}
						size="xs"
						variant="default"
						onClick={handleNew}
						disabled={mobileMode}
						data-action="new">
						新規
					</Button>
				)}
				<Button
					leftSection={<IconFolderOpen stroke={2} />}
					size="xs"
					color="yellow"
					variant="filled"
					onClick={handleOpenPicker}
					data-action="open-picker">
					開く
				</Button>

				{!isMobile && (
					<FileSelector docs={docs} selectedId={selectedId} onChange={handleSelectChange} />
				)}
				{!mobileMode && (
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

				{!mobileMode && (
					<Button
						leftSection={<IconTrash stroke={2} />}
						size="xs"
						variant="default"
						color="red"
						onClick={handleDelete}
						disabled={!selectedId}
						aria-label="削除"
						data-action="delete">
						削除
					</Button>
				)}
				<FileIOSubMenu
					mobileMode={mobileMode}
					docs={docs}
					onDocChange={handleSelectChange}
					onListChanged={() => {
						refreshDocs().catch((e) => console.error("[FileIOPanel] refreshDocs error:", e));
					}}
				/>
			</Group>
			<DocumentPickerModal
				opened={pickerOpen}
				onClose={() => setPickerOpen(false)}
				docs={docs}
				loadThumbnail={getThumbnail}
				selectedId={selectedId}
				onPick={handlePick}
			/>
		</>
	);
};
