import { DocSettingsMode, useDocSettingsStore } from "@/state/docSettingsStore";
import { useHistoryStore } from "@/state/historyStore";
import { useSlideStore } from "@/state/slideStore";
import { useViewerDocumentStore } from "@/state/viewerDocumentStore";
import { DateUtil } from "@/utils/DateUtil";
import { resizeAllSlides } from "@/utils/slideOps";
import { createNewViewerDocument } from "@/utils/viewerDocumentFactory";
import {
	Button,
	ColorInput,
	Group,
	Modal,
	NumberInput,
	Stack,
	Switch,
	Text,
	TextInput,
} from "@mantine/core";
import type { FC } from "react";
import { useEffect, useState } from "react";

// ViewerDocument の meta 編集 / 新規作成 UI (v4 Group D 補間、§0-10 新側内製)。
// 新規 (mode="new") と既存編集 (mode="edit") で同一フォームを使い回す (docSettingsStore で制御)。
//
// ドラフト編集 → 「保存 / 作成」で一括コミット (入力は全てローカル state、確定時に 1 回だけ反映)。
// キャンセル/×でドラフト破棄。
//   - new:  既定値 (title=date string / 画面サイズ / 白背景) で初期化し、OK で setDocument(新規)
//   - edit: 現在 meta で初期化し、保存で patchMeta + サイズを全 slide へ再注入
//
// SSOT: doc.width/height が正、Slide の w/h は doc から注入される従属値。
// キャンバスサイズは ViewerDocument 管轄として undo/redo 対象外 (履歴外):
//   - 保存時に doc 更新 + 全 slide へ再注入 (描画は slide.w/h 依存のため)
//   - 既存 history snapshot の slide サイズも remapSlideSizes で揃え、undo/redo で巻き戻らないように

// 背景色プリセット (レガシ index.html の datalist#bgColorList を踏襲したグレースケール)。
export const BG_COLOR_PRESETS = ["#000000", "#333333", "#666666", "#999999", "#ffffff"] as const;

export const DocumentSettingsModal: FC = () => {
	const mode = useDocSettingsStore((s) => s.mode);
	const close = useDocSettingsStore((s) => s.close);
	const meta = useViewerDocumentStore((s) => s.meta);
	const patchMeta = useViewerDocumentStore((s) => s.patchMeta);
	const setDocument = useViewerDocumentStore((s) => s.setDocument);

	// 全フィールドをローカル draft で保持し、確定時にまとめて反映する。
	const [title, setTitle] = useState("");
	const [width, setWidth] = useState(0);
	const [height, setHeight] = useState(0);
	const [bgColor, setBgColor] = useState("#ffffff");
	const [isSensitive, setIsSensitive] = useState(false);

	// 閉じる時のフェードアウト中も中身を保つため、最後に開いたモードを保持する。
	// mode を直接描画判定に使うと、close で mode=null になった瞬間に中身が
	// 「未ロード」表示へ切り替わり、フェードアウト中に一瞬ちらつく。renderMode は
	// null に戻さないので、値を保ったままフェードアウトできる。
	const [renderMode, setRenderMode] = useState<DocSettingsMode | null>(null);
	useEffect(() => {
		if (mode !== null) setRenderMode(mode);
	}, [mode]);

	// 開いた時に draft を初期化する。new は既定値、edit は現在 meta。
	useEffect(() => {
		if (mode === DocSettingsMode.EDIT && meta) {
			setTitle(meta.title);
			setWidth(meta.width);
			setHeight(meta.height);
			setBgColor(meta.bgColor ?? "#ffffff");
			setIsSensitive(meta.isSensitive ?? false);
		} else if (mode === DocSettingsMode.NEW) {
			const base = createNewViewerDocument();
			setTitle(DateUtil.getDateString()); // 既定名は保存と同じ date string 形式
			setWidth(base.width);
			setHeight(base.height);
			setBgColor(base.bgColor ?? "#ffffff");
			setIsSensitive(false);
		}
	}, [mode]);

	const handleConfirm = (): void => {
		const w = Math.max(1, Math.round(width));
		const h = Math.max(1, Math.round(height));
		if (mode === DocSettingsMode.NEW) {
			// 既定 document をベースに draft を載せて新規作成 (slides 空)。
			setDocument({
				...createNewViewerDocument(),
				title,
				width: w,
				height: h,
				bgColor,
				isSensitive,
			});
		} else if (mode === DocSettingsMode.EDIT && meta) {
			// doc (SSOT) を一括更新 (modified=true は 1 回)。
			patchMeta({ title, bgColor, isSensitive, width: w, height: h });
			// キャンバスサイズを全 slide へ再注入 (履歴外: undo/redo 対象外)。
			const cur = useSlideStore.getState();
			const resized = resizeAllSlides(
				{ slides: cur.slides, selectedIndex: cur.selectedIndex },
				w,
				h
			);
			if (resized) {
				useSlideStore.getState().setSlides(resized.slides);
				// 既存 snapshot のサイズも揃え、undo/redo でサイズが戻らないようにする。
				useHistoryStore.getState().remapSlideSizes(w, h);
			}
		}
		close();
	};

	const opened = mode !== null;
	// 表示は renderMode 基準 (close 後のフェードアウト中も中身を維持してちらつき防止)。
	const isNew = renderMode === DocSettingsMode.NEW;
	// edit で document 未ロードなら案内のみ。new は meta 不要。
	const showForm = isNew || (renderMode === DocSettingsMode.EDIT && !!meta);

	return (
		<Modal
			opened={opened}
			onClose={close}
			title={isNew ? "新規ドキュメント" : "ドキュメント設定"}
			centered
			data-doc-settings>
			{showForm ? (
				<Stack gap="md">
					<div data-doc-field="title">
						<TextInput
							label="ファイル名"
							value={title}
							onChange={(e) => setTitle(e.currentTarget.value)}
						/>
					</div>
					<div>
						<Group gap="xs" align="end">
							<div data-doc-field="width">
								<NumberInput
									label="幅 (px)"
									value={width}
									onChange={(v) => setWidth(typeof v === "number" ? v : 0)}
									min={1}
									w={120}
								/>
							</div>
							<div data-doc-field="height">
								<NumberInput
									label="高さ (px)"
									value={height}
									onChange={(v) => setHeight(typeof v === "number" ? v : 0)}
									min={1}
									w={120}
								/>
							</div>
						</Group>
						{!isNew && (
							<Text size="xs" c="dimmed" mt={4}>
								キャンバスサイズは保存時に全スライドへ反映されます (undo 対象外)。
							</Text>
						)}
					</div>
					<div data-doc-field="bgcolor">
						<ColorInput
							label="背景色"
							format="hex"
							value={bgColor}
							onChange={setBgColor}
							swatches={[...BG_COLOR_PRESETS]}
							swatchesPerRow={BG_COLOR_PRESETS.length}
						/>
					</div>
					<Switch
						label="センシティブ (閲覧注意)"
						checked={isSensitive}
						onChange={(e) => setIsSensitive(e.currentTarget.checked)}
						data-doc-sensitive
					/>
					<Group justify="flex-end" gap="sm">
						<Button variant="default" onClick={close} data-doc-cancel>
							キャンセル
						</Button>
						<Button onClick={handleConfirm} data-doc-save>
							{isNew ? "作成" : "保存"}
						</Button>
					</Group>
				</Stack>
			) : (
				<Text size="sm" c="dimmed">
					document が未ロードです。
				</Text>
			)}
		</Modal>
	);
};
