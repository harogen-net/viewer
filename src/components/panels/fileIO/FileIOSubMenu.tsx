import { useFileIO } from "@/hooks/useFileIO";
import { useToast } from "@/hooks/useToast";
import { useImageLibraryStore } from "@/state/imageLibraryStore";
import { useSlideStore } from "@/state/slideStore";
import { useViewerDocumentStore } from "@/state/viewerDocumentStore";
import type { ViewerDocument } from "@/types/ViewerDocument";
import { collectImageMap } from "@/utils/collectImageMap";
import { ActionIcon, Menu } from "@mantine/core";
import {
	IconBookDownload,
	IconDotsVertical,
	IconPackageExport,
	IconPackageImport,
} from "@tabler/icons-react";
import type { ChangeEvent, FC } from "react";
import { useRef } from "react";
import { useFileIOCommon } from "./useFileIOCommon";

export const FileIOSubMenu: FC<{
	readOnly?: boolean;
	onTitleChange?: (title: string | null) => void;
}> = ({ readOnly = false, onTitleChange }) => {
	const { exportHvd, exportHvz, exportPng, importFile, exportAllSlidesZip } = useFileIO();
	const setDocument = useViewerDocumentStore((s) => s.setDocument);
	const meta = useViewerDocumentStore((s) => s.meta);
	const slides = useSlideStore((s) => s.slides);
	const toast = useToast();
	const { wrap, confirmDiscardIfModified } = useFileIOCommon();

	const fileInputRef = useRef<HTMLInputElement>(null);

	// エクスポート 4 種 (HVD/HVZ/PNG/ZIP) は「未ロード確認 → doc+imageMap を注入して実行 →
	// 結果メッセージを toast」まで同一。export 関数だけ差し替える共通ラッパーで生成する。
	const runExport = (
		fn: (doc: ViewerDocument, imageMap: Record<string, string>) => Promise<string | null>
	) =>
		wrap(async () => {
			if (!meta) {
				toast.info("ドキュメントが未ロードです");
				return;
			}
			const msg = await fn({ ...meta, slides }, collectImageMap());
			if (msg) toast.success(msg); // null = パスワード入力キャンセル (無音)
		});
	const handleExportHvd = runExport(exportHvd);
	const handleExportHvz = runExport(exportHvz);
	const handleExportPng = runExport(exportPng);
	// 有効スライドを全て画像 PNG 化して ZIP 書き出し (§10)。
	const handleExportZip = runExport(exportAllSlidesZip);

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
			const result = await importFile(file);
			if (!result) {
				toast.error(`未対応の拡張子です: ${file.name}`);
				return;
			}
			setDocument(result.doc);
			useImageLibraryStore.getState().setImageLibrary(result.imageData);
			onTitleChange?.(null);
			toast.success(`インポートしました: ${result.doc.title} (${result.doc.slides.length} slides)`);
		})();
	};

	const hasSlides = slides.length > 0;
	const hasEnabledSlide = slides.some((s) => !s.disabled);

	return (
		<>
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
				</Menu.Dropdown>
			</Menu>
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
