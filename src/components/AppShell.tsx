import { useBeforeUnloadGuard } from "@/hooks/useBeforeUnloadGuard";
import { useImageDimensionBackfill } from "@/hooks/useImageLibraryMutation";
import { useLayerAutoSelect } from "@/hooks/useLayerAutoSelect";
import { useRectSyncConfig } from "@/hooks/useLayerMutation";
import { useShellKeyboard } from "@/hooks/useShellKeyboard";
import { useDocSettingsStore } from "@/state/docSettingsStore";
import { useSlideshowStore } from "@/state/slideshowStore";
import { useSlideStore } from "@/state/slideStore";
import { useViewerDocumentStore } from "@/state/viewerDocumentStore";
import { useViewerModeStore, ViewerMode } from "@/state/viewerModeStore";
import { DateUtil } from "@/utils/DateUtil";
import { createNewViewerDocument } from "@/utils/viewerDocumentFactory";
import { ActionIcon, Box, createTheme, Flex, MantineProvider, Text, Tooltip } from "@mantine/core";
import type { CSSProperties, FC } from "react";
import { useEffect, useRef, useState } from "react";
import { AlertHost } from "./common/AlertHost";
import { ToastHost } from "./common/ToastHost";
import { DocumentSettingsModal } from "./panels/DocumentSettingsModal";
import { EditOpsPanel } from "./panels/EditOpsPanel";
import { EditToolbar } from "./panels/EditToolbar";
import { FileIOPanel } from "./panels/FileIOPanel";
import { ImageLibraryPanel } from "./panels/ImageLibraryPanel";
import { LayerListPanel } from "./panels/LayerListPanel";
import { SlideListPanel } from "./panels/SlideListPanel";
import { SlideShowOpsPanel } from "./panels/SlideShowOpsPanel";
import { SlideshowSettingsModal } from "./panels/SlideshowSettingsModal";
import { ProgressBar } from "./ProgressBar";
import { SlideEditView } from "./slide/SlideEditView";
import { SlideshowShell } from "./SlideshowShell";

// dual entrypoint: 既定で新側、?legacy=1 でレガシー。AppShell は新側 (= !legacy) でのみ
// mount される (index.html のブートストラップが ?legacy=1 のとき src/index.ts を読む)。

// 上部グローバルバー (レガシー #menu 相当): スライドショー / ファイル IO / 画像ライブラリ・設定。
// editable=false (閲覧モード) では編集系トリガ (画像ライブラリ追加・ドキュメント設定) を隠す。
const TopBar: FC<{ editable: boolean }> = ({ editable }) => {
	const [showImageLibrary, setShowImageLibrary] = useState(false);
	const [showSlideshowSettings, setShowSlideshowSettings] = useState(false);
	const openDocSettings = useDocSettingsStore((s) => s.openEdit);
	const slideshowRunning = useSlideshowStore((s) => s.running);
	const stopSlideshow = useSlideshowStore((s) => s.stop);
	// document (meta) がロードされている時のみ、設定/画像ライブラリを活性化。
	const hasDocument = useViewerDocumentStore((s) => s.meta !== null);
	// ロード済み画像の自然寸法を backfill (D-14、rectEdit の矩形一致判定の基盤)。
	useImageDimensionBackfill();
	// rectEdit トグル + 自然寸法を layerOps へ流し込む (D-18)。
	useRectSyncConfig();

	return (
		<>
			<div style={topBarStyle} data-top-bar>
				{/* SlideShow と File パネルを縦 1 列に積む。 */}
				<Flex direction="row" gap="sm" align="stretch">
					<SlideShowOpsPanel />
					<FileIOPanel readOnly={!editable} />
					{editable && (
						<ActionIcon.Group>
							<Tooltip label="ドキュメント設定">
								<ActionIcon
									variant="default"
									onClick={openDocSettings}
									disabled={!hasDocument}
									data-open-doc-settings>
									⚙
								</ActionIcon>
							</Tooltip>
							<Tooltip label="画像ライブラリ">
								<ActionIcon
									variant="default"
									onClick={() => setShowImageLibrary(true)}
									disabled={!hasDocument}
									data-open-image-library>
									🖼
								</ActionIcon>
							</Tooltip>
							<Tooltip label="スライドショー設定">
								<ActionIcon
									variant="default"
									onClick={() => setShowSlideshowSettings(true)}
									data-open-slideshow-settings>
									🎬
								</ActionIcon>
							</Tooltip>
						</ActionIcon.Group>
					)}
				</Flex>
			</div>
			<SlideshowShell open={slideshowRunning} onClose={stopSlideshow} />
			{editable && (
				<>
					<ImageLibraryPanel opened={showImageLibrary} onClose={() => setShowImageLibrary(false)} />
					<DocumentSettingsModal />
					<SlideshowSettingsModal
						opened={showSlideshowSettings}
						onClose={() => setShowSlideshowSettings(false)}
					/>
				</>
			)}
		</>
	);
};

// メイン領域 (レガシー #main 相当): 中央 canvas (上に編集ツールバー) + 右 sideMenu (property / layer)。
// editable=false では編集ツールバー・右レール (EditOps / Layer) を隠し、canvas 閲覧のみ。
const MainArea: FC<{ editable: boolean }> = ({ editable }) => {
	const slides = useSlideStore((s) => s.slides);
	// MainArea は編集対象 (editingIndex) を描画する。選択 (selectedIndex) ではない。
	const editingIndex = useSlideStore((s) => s.editingIndex);
	const setEditingIndex = useSlideStore((s) => s.setEditingIndex);
	const meta = useViewerDocumentStore((s) => s.meta);
	const slide = editingIndex >= 0 ? slides[editingIndex] : null;

	// 編集シェルのキーボードショートカット (Ctrl+C/V/X 等) を配線 (D-8)。
	useShellKeyboard();

	const stageRef = useRef<HTMLDivElement>(null);
	const [size, setSize] = useState<{ w: number; h: number }>({ w: 0, h: 0 });

	useEffect(() => {
		const el = stageRef.current;
		if (!el) return;
		const ro = new ResizeObserver((entries) => {
			const r = entries[0].contentRect;
			setSize({ w: r.width, h: r.height });
		});
		ro.observe(el);
		return () => ro.disconnect();
	}, []);

	// MainArea は縦積み: 上部ツールバー (全幅貫通) → 下に (canvas | 右レール) の行。
	const mainAreaStyle: CSSProperties = {
		flex: 1,
		minWidth: 0,
		minHeight: 0,
		display: "flex",
		flexDirection: "column",
	};
	// ツールバー下のコンテンツ行 (canvas + 右レール)。
	const contentRowStyle: CSSProperties = {
		flex: 1,
		minWidth: 0,
		minHeight: 0,
		display: "flex",
		flexDirection: "row",
	};
	const editMainStyle: CSSProperties = {
		flex: 1,
		minWidth: 0,
		minHeight: 0,
		display: "flex",
		flexDirection: "column",
	};
	// 最上段を貫通する全幅ツールバー (canvas + 右レールの両方の上に乗る)。
	const toolbarRowStyle: CSSProperties = {
		flex: "0 0 auto",
		padding: 6,
		borderBottom: "1px solid #dee2e6",
		background: "#fff",
	};
	const stageStyle: CSSProperties = {
		flex: 1,
		minWidth: 0,
		minHeight: 0,
		position: "relative",
		background: "#f1f3f5",
	};

	const sideRailWidth = 260; // 右レールの固定幅。EditOpsPanel / LayerListPanel を縦 5:5 で並べる。

	// 右レール: EditOpsPanel / LayerListPanel を縦 5:5 で並べる (各々が内部スクロール)。
	const sideRailStyle: CSSProperties = {
		flex: `0 0 ${sideRailWidth}px`,
		width: sideRailWidth,
		borderLeft: "1px solid #dee2e6",
		padding: 8,
		background: "#fff",
		display: "flex",
		flexDirection: "column",
		gap: 8,
		minHeight: 0,
		overflow: "hidden",
	};
	// 5:5 の各半分。flex:1 で等分。スクロールはパネル (Paper) 内部で行うので
	// ラッパー側では overflow を持たせない (パネルが height:100% で半分を埋める)。
	const railHalfStyle: CSSProperties = {
		flex: 1,
		minHeight: 0,
		display: "flex",
		flexDirection: "column",
	};

	// 編集 UI (ツールバー + 右レール) は「編集モード かつ スライド選択中」のみ表示 (レガシー .canvas 相当)。
	// スライド未選択時はキャンバスの案内のみ。
	const showEditUI = editable && !!slide;

	return (
		<div style={mainAreaStyle} data-main-area>
			{/* 最上段を貫通する全幅ツールバー */}
			{showEditUI && (
				<div style={toolbarRowStyle}>
					<Flex gap="sm" align="center" justify="space-between" wrap="nowrap">
						<EditToolbar />
						{/* 編集を閉じる = スライド選択解除 → 編集パネルを隠す (レガシー .canvas .close 相当)。 */}
						<Tooltip label="編集を閉じる (選択解除)">
							<ActionIcon
								variant="default"
								onClick={() => setEditingIndex(-1)}
								data-action="close-edit"
								aria-label="編集を閉じる">
								✕
							</ActionIcon>
						</Tooltip>
					</Flex>
				</div>
			)}
			<div style={contentRowStyle}>
				<div style={editMainStyle}>
					<div ref={stageRef} style={stageStyle} data-edit-stage-area>
						{slide && size.w > 0 && size.h > 0 ? (
							<SlideEditView
								slide={slide}
								bgColor={meta?.bgColor}
								fitAreaWidth={size.w}
								fitAreaHeight={size.h}
							/>
						) : (
							<Box p="lg">
								<Text size="sm" c="dimmed">
									{slide ? "..." : "スライドを一覧から選択してください"}
								</Text>
							</Box>
						)}
					</div>
				</div>
				{showEditUI && (
					<aside style={sideRailStyle} data-edit-side-rail>
						<div style={{ ...railHalfStyle, flexGrow: 3 }}>
							<EditOpsPanel />
						</div>
						<div style={{ ...railHalfStyle, flexGrow: 2 }}>
							<LayerListPanel />
						</div>
					</aside>
				)}
			</div>
		</div>
	);
};

const newModeLayoutStyle: CSSProperties = {
	display: "flex",
	flexDirection: "column",
	width: "100vw",
	height: "100vh",
	// body 全体はスクロールさせず、各領域 (一覧 / canvas) が内部でスクロールする。
	overflow: "hidden",
};
const topBarStyle: CSSProperties = {
	flex: "0 0 auto",
	padding: 8,
	borderBottom: "1px solid #dee2e6",
	background: "#fff",
	overflowX: "auto",
};
// スライド一覧領域 (レガシー #main .list 相当)。
// 詳細編集モード: canvas の下の固定高さ帯 (単一行)。高さは内容 (1 行) で決まり伸びない。
// 横方向は SlideListPanel 内の ScrollArea が担当。
const listStripStyle: CSSProperties = {
	flex: "0 0 auto",
	borderTop: "1px solid #dee2e6",
	padding: 8,
};
// 一覧選択モード: canvas が無い分まで広げ、複数行ギャラリーで領域いっぱいに使う (内部縦スクロール)。
const listExpandedStyle: CSSProperties = {
	flex: 1,
	minHeight: 0,
	overflowY: "auto",
	borderTop: "1px solid #dee2e6",
	padding: 8,
};

const appTheme = createTheme({
	colors: {
		red: [
			"#FF0000",
			"#FF0000",
			"#FF0000",
			"#FF0000",
			"#FF0000",
			"#FF0000",
			"#FF0000",
			"#FF0000",
			"#FF0000",
			"#FF0000",
		],
	},
});

export const AppShell: FC = () => {
	// 未保存変更があるとタブ閉じ/リロードを警告 (アプリ内置換は FileIOPanel 側で確認)。
	useBeforeUnloadGuard();
	// スライド遷移時に対応レイヤー (同一画像/テキスト/同形状) を自動選択 (legacy 相当)。
	useLayerAutoSelect();
	const mode = useViewerModeStore((s) => s.mode);
	const editable = mode === ViewerMode.EDIT;
	// 起動時に document が無ければ自動で新規作成 (編集モードのみ、トースト無し)。
	// 「document 未ロード」の混乱を招く空状態を避ける。
	useEffect(() => {
		if (editable && useViewerDocumentStore.getState().meta === null) {
			useViewerDocumentStore
				.getState()
				.setDocument({ ...createNewViewerDocument(), title: DateUtil.getDateString() });
		}
		// マウント時 1 回のみ (editable は起動モード由来で不変)。
		// biome-ignore lint/correctness/useExhaustiveDependencies: 起動時 1 回のみ
	}, []);
	// 内部動作モード (レガシー相当) でレイアウトが変わる。ViewerMode (起動モード) とは別軸:
	//   - 詳細編集モード (editable かつ スライド選択中):
	//       TopBar(固定) / 編集エリア(最大) / スライド一覧(1 行・固定)
	//   - 一覧選択モード (未選択 / 閲覧起動):
	//       TopBar(固定) / スライド一覧(複数行・最大)。編集エリアは無し
	// (× close で選択解除 → 一覧選択モードへ戻る。VIEW 起動では常に一覧選択モード)
	const slides = useSlideStore((s) => s.slides);
	// 詳細編集モードは editingIndex (編集対象) で駆動する。selectedIndex (選択) ではない。
	const editingIndex = useSlideStore((s) => s.editingIndex);
	const detailMode = editable && editingIndex >= 0 && !!slides[editingIndex];
	return (
		<MantineProvider theme={appTheme}>
			<div style={newModeLayoutStyle} data-viewer-mode={mode}>
				<TopBar editable={editable} />
				{detailMode && <MainArea editable={editable} />}
				<div
					style={detailMode ? listStripStyle : listExpandedStyle}
					data-slide-list-area
					data-list-expanded={detailMode ? "false" : "true"}>
					<SlideListPanel readOnly={!editable} wrap={!detailMode} />
				</div>
			</div>
			<ProgressBar />
			<AlertHost />
			<ToastHost />
		</MantineProvider>
	);
};
