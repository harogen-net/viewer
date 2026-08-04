import { useAlert } from "@/hooks/useAlert";
import { useDeviceMode } from "@/hooks/useDeviceMode";
import { useFileIO } from "@/hooks/useFileIO";
import { useProgress } from "@/hooks/useProgress";
import { type StoredSlideTitle, useStorage } from "@/hooks/useStorage";
import { useToast } from "@/hooks/useToast";
import { useImageLibraryStore } from "@/state/imageLibraryStore";
import { useSlideStore } from "@/state/slideStore";
import { useViewerDocumentStore } from "@/state/viewerDocumentStore";
import type { ViewerDocument } from "@/types/ViewerDocument";
import { collectImageMap, collectImageNames } from "@/utils/collectImageMap";
import { generateDocThumbnailStrip } from "@/utils/slideThumbnail";
import { buildImageEntries } from "@/utils/storageCodec";
import { ActionIcon, Menu } from "@mantine/core";
import {
	IconBookDownload,
	IconDeviceFloppy,
	IconDotsVertical,
	IconLock,
	IconPackageExport,
	IconPackageImport,
	IconTrash,
} from "@tabler/icons-react";
import type { ChangeEvent, FC } from "react";
import { useRef, useState } from "react";
import { AppLockSettingsModal } from "../AppLockSettingsModal";
import { useFileIOCommon } from "./useFileIOCommon";

export const FileIOSubMenu: FC<{
	readOnly?: boolean;
	titles: StoredSlideTitle[];
	onTitleChange?: (title: string | null) => void;
	onListChanged?: () => void;
}> = ({ readOnly = false, titles, onTitleChange, onListChanged }) => {
	const { exportHvd, exportHvz, exportPng, importFile, exportAllSlidesZip } = useFileIO();
	const { save, deleteByTitle } = useStorage();
	const setDocument = useViewerDocumentStore((s) => s.setDocument);
	const markSaved = useViewerDocumentStore((s) => s.markSaved);
	const meta = useViewerDocumentStore((s) => s.meta);
	const slides = useSlideStore((s) => s.slides);
	const selectedIndex = useSlideStore((s) => s.selectedIndex);
	const toast = useToast();
	const alert = useAlert();
	const { isMobile } = useDeviceMode();
	const { run } = useProgress();
	const { wrap, confirmDiscardIfModified } = useFileIOCommon();

	const fileInputRef = useRef<HTMLInputElement>(null);
	// 画面ロック設定。スマホで開ける汎用メニューがこの ⋮ しかないためここに同居させる。
	const [showAppLockSettings, setShowAppLockSettings] = useState(false);

	// エクスポート 4 種 (HVD/HVZ/PNG/ZIP) は「未ロード確認 → doc+imageMap を注入して実行 →
	// 結果メッセージを toast」まで同一。export 関数だけ差し替える共通ラッパーで生成する。
	const runExport = (
		fn: (
			doc: ViewerDocument,
			imageMap: Record<string, string>,
			imageNames?: Record<string, string>,
			onProgress?: (fraction: number) => void
		) => Promise<string | null>,
		label: string
	) =>
		wrap(async () => {
			if (!meta) {
				toast.info("ドキュメントが未ロードです");
				return;
			}
			// 進捗バー付きで実行 (report を fn へ注入)。高速な書き出しは report を呼ばずバーを出さない。
			const msg = await run(label, (report) =>
				fn({ ...meta, slides }, collectImageMap(), collectImageNames(), report)
			);
			if (msg) toast.success(msg); // null = パスワード入力キャンセル (無音)
		});
	const handleExportHvd = runExport(exportHvd, "HVD 書き出し中…");
	const handleExportHvz = runExport(exportHvz, "HVZ 書き出し中…");
	const handleExportPng = runExport(exportPng, "PNG 書き出し中…");
	// 有効スライドを全て画像 PNG 化して ZIP 書き出し (§10)。
	const handleExportZip = runExport(exportAllSlidesZip, "全スライド ZIP 書き出し中…");

	// インポートは「ボタン押下時点」で破棄確認する (ファイル選択後ではなく、開く/新規と同じ方針)。
	//   - 未変更時: user gesture を保てるよう同期でファイルダイアログを開く。
	//   - 変更あり時: 先に破棄確認し、OK のクリックを gesture としてダイアログを開く。
	const handleImportClick = (): void => {
		if (!useViewerDocumentStore.getState().modified) {
			fileInputRef.current?.click();
			return;
		}
		void wrap(async () => {
			if (!(await confirmDiscardIfModified())) return;
			fileInputRef.current?.click();
		})();
	};

	const onFileSelected = (e: ChangeEvent<HTMLInputElement>): void => {
		const file = e.target.files?.[0];
		e.target.value = ""; // 同じファイルを連続選択できるよう reset
		if (!file) return;
		// 破棄確認は handleImportClick (ボタン押下時) で実施済みのため、ここでは行わない。
		wrap(async () => {
			// 進捗バー付き import。未対応拡張子 (null) は Abort 扱いで即消し。
			const result = await run("読み込み中…", (report) => importFile(file, report));
			if (!result) {
				toast.error(`未対応の拡張子です: ${file.name}`);
				return;
			}
			// インポートはメモリロードのみ (通常のインポート)。IDB への保存はスマホ/PC とも
			// ユーザが明示的に「保存」を押した時に行う (サムネ生成もそのタイミング)。
			setDocument(result.doc);
			useImageLibraryStore
				.getState()
				.setImageLibrary(buildImageEntries(result.imageData, result.imageNames));
			onTitleChange?.(null);
			toast.success(`インポートしました: ${result.doc.title} (${result.doc.slides.length} slides)`);
		})();
	};

	// スマホモード限定: 現在ロード中のドキュメントを IDB に保存 (通常モードの handleSave と同挙動)。
	// スマホは表側の「保存」ボタンが出ない (readOnly) ため、この導線が唯一の保存手段。
	// VIEW モード自動選択のため allowInViewMode で gate をバイパスする。
	const handleMobileSave = wrap(async () => {
		if (!meta) {
			toast.info("ドキュメントが未ロードです");
			return;
		}
		const doc: ViewerDocument = { ...meta, slides };
		// 名前付き document は上書き、未命名 ("(new)"/"") は新規 (date title) 保存 (通常モードと同基準)。
		const canOverride = meta.title !== "" && meta.title !== "(new)";
		// 進捗: サムネ生成 (0..0.3) → save (0.3..1)。センシティブはぼかしたサムネを保存。
		// 生成失敗は best-effort でサムネ無し保存。PW 入力キャンセル時は save が null (無音中止)。
		const result = await run("保存中…", async (report) => {
			report(0.05);
			const thumbnail = await generateDocThumbnailStrip(doc, collectImageMap(), {
				frameMaxPx: 320,
				mimeType: "image/png",
				selectedIndex,
				blur: meta.isSensitive,
			}).catch(() => null);
			report(0.3);
			return save(doc, {
				override: canOverride,
				thumbnail,
				onProgress: (f) => report(0.3 + f * 0.7),
				allowInViewMode: true,
			});
		});
		if (!result) return; // パスワード入力キャンセル = 保存中止 (無音)
		// 保存名を meta へ同期し modified を解除 (未保存ガードの誤発火を防ぐ)。
		markSaved(result.title);
		toast.success(`保存しました: ${result.title}`);
		onListChanged?.();
	});

	// スマホモード限定: 現在ロード中のドキュメントを削除 (通常モードの handleDelete と同挙動)。
	// スマホでは FileSelector が非表示のため selectedTitle を使えず、meta.title を対象にする。
	const handleMobileDelete = wrap(async () => {
		if (!meta) {
			toast.info("ドキュメントが未ロードです");
			return;
		}
		const target = meta.title;
		if (!titles.some((t) => t.title === target)) {
			toast.info(`未保存のためデータストア上に存在しません: ${target}`);
			return;
		}
		if (!(await alert.confirm(`delete "${target}" ?`))) return;
		await deleteByTitle(target, { allowInViewMode: true });
		// 画面上のドキュメントもクリア (通常モードの selectedTitle と違い、スマホは現在ロード中
		// のものを対象にするため、削除後に doc/画像を残すと「消えていない」ように見える)。
		setDocument(null);
		useImageLibraryStore.getState().setImageLibrary({});
		toast.success(`削除しました: ${target}`);
		onListChanged?.();
	});

	const hasSlides = slides.length > 0;
	const hasEnabledSlide = slides.some((s) => !s.disabled);
	// スマホ削除の可否: 現在のドキュメントが IDB に保存済み (titles に含まれる) のときのみ有効。
	const canMobileDelete = !!meta && titles.some((t) => t.title === meta.title);

	return (
		<>
			<Menu shadow="md" width={200} transitionProps={{ duration: 0 }}>
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
					<Menu.Divider />
					<Menu.Label>インポート</Menu.Label>
					<Menu.Item
						leftSection={<IconPackageImport stroke={2} />}
						onClick={handleImportClick}
						data-action="import">
						インポート
					</Menu.Item>
					{!readOnly && (
						<>
							<Menu.Divider />
							<Menu.Label>エクスポート</Menu.Label>
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
						</>
					)}
					{/* スマホモード限定の保存/削除導線。スマホは readOnly でも表示 (スマホでは
					    表側の「保存」「削除」ボタンが出ないため、これらの術がこのメニューにしかない)。 */}
					{isMobile && (
						<>
							<Menu.Divider />
							<Menu.Label>ファイル</Menu.Label>
							<Menu.Item
								leftSection={<IconDeviceFloppy stroke={2} />}
								onClick={handleMobileSave}
								disabled={!hasSlides}
								data-action="save-mobile">
								ドキュメントを保存
							</Menu.Item>
							<Menu.Item
								leftSection={<IconTrash stroke={2} />}
								onClick={handleMobileDelete}
								disabled={!canMobileDelete}
								color="red"
								data-action="delete-mobile">
								ドキュメントを削除
							</Menu.Item>
							{/* 画面ロック (アプリ起動時の認証)。端末ローカル設定なのでスマホ限定で出す
							    — PC で登録してもスマホには何の効果もないため。 */}
							<Menu.Divider />
							<Menu.Label>アプリ</Menu.Label>
							<Menu.Item
								leftSection={<IconLock stroke={2} />}
								onClick={() => setShowAppLockSettings(true)}
								data-action="app-lock-settings">
								画面ロック
							</Menu.Item>
						</>
					)}
				</Menu.Dropdown>
			</Menu>
			<AppLockSettingsModal
				opened={showAppLockSettings}
				onClose={() => setShowAppLockSettings(false)}
			/>
			<input
				ref={fileInputRef}
				type="file"
				accept=".hvd,.hvz,.png"
				onChange={onFileSelected}
				style={{ display: "none" }}
			/>
		</>
	);
};
