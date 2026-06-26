import {
	ActionIcon,
	Group,
	Paper,
	Slider,
	Stack,
	Text,
	Textarea,
	Title,
	Tooltip,
} from "@mantine/core";
import type { FC } from "react";
import { useRef } from "react";
import { useDocumentMutation } from "../../hooks/useDocumentMutation";
import { useLayerClipboard } from "../../hooks/useLayerClipboard";
import { useLayerMutation } from "../../hooks/useLayerMutation";
import { useImageLibraryStore } from "../../state/imageLibraryStore";
import { useLayerStore } from "../../state/layerStore";
import { useSlideStore } from "../../state/slideStore";
import type { LayerBase } from "../../types/Layer";
import type { SlideState } from "../../types/SlideState";
import {
	updateImageLayer as updateImageLayerOp,
	updateLayer as updateLayerOp,
	updateTextLayer as updateTextLayerOp,
} from "../../utils/layerOps";
import { NumberAdjustInput } from "../common/NumberAdjustInput";

// EditOpsPanel (v4 Group D D-4a、§0-10 新側内製、Mantine UI)。
// レガシー src/viewController/EditViewController.ts (446 行 jQuery) は import せず新規実装。
//
// D-4a/b スコープ:
//   - undo / redo ボタン (`useDocumentMutation.undo/redo`, `canUndo/canRedo`)
//   - layer 順序変更 (bringToFront / bringForward / sendBackward / sendToBack)
//   - layer 削除 (removeLayer)
//   - layer 複製 (duplicateLayer)
//   - 透明度スライダー (opacity 0-1, updateLayer)
//   - 回転 ±90° / リセット (D-4b)
//   - 反転 H / V トグル (D-4b)
//   - フィット配置 (slide 寸法に aspect 維持で最大化 + 中央、legacy fitLayer scale1↔scale2 toggle 付き) (D-4b)
//   - 透明度リセット (opacity = 1) (D-4b)
//
// D-8 スコープ (追加):
//   - カット / コピー / ペースト (clipboard、useLayerClipboard + Ctrl+C/V/X)
//   - 変形情報コピー / 貼付 (transform clipboard)
//
// D-9 スコープ (追加、function-list §6):
//   - テキストレイヤー追加 (legacy `.text` 相当、既定テキストで追加→直後に編集)
//   - テキスト編集 (選択中 TextLayer のみ textarea を表示 = legacy VMShowHideUI 相当の表示切替)
//
// 配置: AppShell の右側 rail 内、LayerListPanel の上。

// useLayerMutation の facade は layer index を受け取るため、selectedLayer の現在 index を求めて渡す。
// (LayerListPanel と異なり、こちらは index を直接 prop で受け取らないので毎回 findIndex する)

export const EditOpsPanel: FC = () => {
	// 選択中レイヤーの編集専用パネル。
	// undo/redo・テキスト追加・rectEdit トグル等のアプリ一般操作は EditToolbar へ分離した。
	const { applySlideChangeLive, recordHistory, snapshot } = useDocumentMutation();
	const layer = useLayerMutation();
	const clipboard = useLayerClipboard();

	const selectedLayer = useLayerStore((s) => s.selectedLayer);
	const selectedSlideIndex = useSlideStore((s) => s.selectedIndex);
	const slides = useSlideStore((s) => s.slides);
	const selectedSlide = selectedSlideIndex >= 0 ? slides[selectedSlideIndex] : null;
	const layerIndex =
		selectedSlide && selectedLayer
			? selectedSlide.layers.findIndex((l) => l.uuid === selectedLayer.uuid)
			: -1;
	const hasSelection = layerIndex >= 0;
	const isLocked = selectedLayer?.locked ?? false;
	const canEditLayer = hasSelection && !isLocked;

	// テキスト編集 (D-9、legacy VMHistoricalTextInput 基準): 選択中 TextLayer のみ textarea 表示。
	//   - 入力中 (onChange): applySlideChangeLive でレイヤーへ即時反映 (history は積まない)
	//   - focus 時: 開始 snapshot + 開始テキストを保持
	//   - blur 時: 開始テキストと異なれば history を 1 件だけ記録 (編集セッション全体で 1 undo)
	const textLayer = selectedLayer?.type === "text" ? (selectedLayer as { text: string }) : null;
	const textEditStartRef = useRef<{
		before: SlideState;
		startText: string;
	} | null>(null);

	const handleTextLiveChange = (value: string) => {
		if (!textLayer || layerIndex < 0) return;
		applySlideChangeLive((s) => updateTextLayerOp(s, layerIndex, { text: value }));
	};
	const handleTextFocus = () => {
		if (!textLayer) return;
		textEditStartRef.current = {
			before: snapshot(),
			startText: textLayer.text,
		};
	};
	const handleTextBlur = (value: string) => {
		const start = textEditStartRef.current;
		textEditStartRef.current = null;
		if (!start || value === start.startText) return;
		recordHistory("edit text", start.before);
	};

	// 数値プロパティ入力 (D-9 と同じ live + history-on-blur パターン、§12)。
	// 入力中 (Enter/↑↓/ホイール) は applySlideChangeLive で即時反映、blur で 1 件記録。
	const propEditStartRef = useRef<SlideState | null>(null);
	const handlePropStart = () => {
		propEditStartRef.current = snapshot();
	};
	const handlePropEnd = (label: string) => {
		const before = propEditStartRef.current;
		propEditStartRef.current = null;
		if (before) recordHistory(label, before); // 変化なしは recordHistory 内で no-op
	};
	const livePatch = (patch: Partial<LayerBase>) => {
		if (layerIndex < 0) return;
		applySlideChangeLive((s) => updateLayerOp(s, layerIndex, patch));
	};

	// スライダー (opacity / clip) は 1 ドラッグ = 1 履歴 (legacy VMHistoricalVariableInput の
	// focus→blur 1 記録と同等)。onChange 中は applySlideChangeLive で履歴を積まず即時反映し、
	// onChangeEnd (マウスアップ/キーアップ) で recordHistory を 1 件だけ残す。
	// 最初の onChange で開始 snapshot を遅延取得する (Mantine Slider は focus 開始通知が無いため)。
	const sliderEditStartRef = useRef<SlideState | null>(null);
	const beginSliderEditIfNeeded = () => {
		if (!sliderEditStartRef.current) sliderEditStartRef.current = snapshot();
	};
	const endSliderEdit = (label: string) => () => {
		const before = sliderEditStartRef.current;
		sliderEditStartRef.current = null;
		if (before) recordHistory(label, before); // 変化なしは recordHistory 内で no-op
	};

	// 透明度は 0-100 の slider にする (Mantine の Slider は数値変換が楽)。
	const opacityPercent = Math.round((selectedLayer?.opacity ?? 1) * 100);
	const handleOpacityChange = (value: number) => {
		if (layerIndex < 0) return;
		const next = Math.max(0, Math.min(1, value / 100));
		beginSliderEditIfNeeded();
		applySlideChangeLive((s) => updateLayerOp(s, layerIndex, { opacity: next }));
	};

	// fit: layer wrapper の DOM を検索し content size を実測 (scaled 上で querySelector)
	// スコープ: edit canvas の scaled stage 内の wrapper のみ (LayerListPanel や thumb にも
	//        data-layer-id があるため [data-slide-edit-scaled] 下に限定)。
	const measureContentSize = (): { w: number; h: number } | null => {
		if (!selectedLayer) return null;
		const wrapper = document.querySelector<HTMLElement>(
			`[data-slide-edit-scaled] [data-layer-id="${selectedLayer.id}"]`
		);
		if (!wrapper) return null;
		const w = wrapper.offsetWidth;
		const h = wrapper.offsetHeight;
		if (w <= 0 || h <= 0) return null;
		return { w, h };
	};

	// clipRect スライダー (D-6b、ImageLayer のみ) — [top, right, bottom, left]
	const isImageLayer = selectedLayer?.type === "image";
	const imageLayer = isImageLayer
		? (selectedLayer as {
				clipRect: [number, number, number, number];
				imageId: string;
			})
		: null;
	const clipContentSize = isImageLayer ? measureContentSize() : null;
	const handleClipChange = (edgeIndex: 0 | 1 | 2 | 3, value: number) => {
		if (!imageLayer || layerIndex < 0) return;
		const next: [number, number, number, number] = [...imageLayer.clipRect];
		next[edgeIndex] = Math.max(0, Math.floor(value));
		beginSliderEditIfNeeded();
		applySlideChangeLive((s) => updateImageLayerOp(s, layerIndex, { clipRect: next }));
	};
	const handleClipReset = () => {
		if (!imageLayer || layerIndex < 0) return;
		layer.updateImageLayer(layerIndex, { clipRect: [0, 0, 0, 0] });
	};

	// 画像ダウンロード (ImageLayer のみ): 元画像 (imageLibrary の dataURL) をファイル保存。
	// 編集操作ではないので locked でも実行可。
	const handleDownloadImage = () => {
		if (!imageLayer) return;
		const entry = useImageLibraryStore.getState().imageById[imageLayer.imageId];
		if (!entry) return;
		const ext = entry.dataURL.match(/^data:image\/([a-z0-9.+-]+)/i)?.[1] ?? "png";
		const a = document.createElement("a");
		a.href = entry.dataURL;
		a.download = `${entry.name || imageLayer.imageId}.${ext}`;
		document.body.appendChild(a);
		a.click();
		document.body.removeChild(a);
	};

	return (
		// レール半分 (5:5) を埋め、内容がはみ出したらパネル内部でスクロール。
		<Paper withBorder p="sm" radius="sm" style={{ flex: 1, minHeight: 0, overflowY: "auto" }}>
			<Stack gap="xs">
				<Title order={5}>Layer Ops</Title>

				{/* 変形 (形状) コピー / 貼付 (D-8)。レイヤー間の transform 複写は選択レイヤー操作なので
				    EditOpsPanel に残す。汎用 clipboard (copy/cut/paste) は EditToolbar へ移設。 */}
				<Group gap={4}>
					<Tooltip label="変形情報コピー">
						<ActionIcon
							variant="default"
							onClick={clipboard.copyTransform}
							disabled={!hasSelection}
							data-edit-op="copy-transform"
							aria-label="copy transform">
							⤳
						</ActionIcon>
					</Tooltip>
					<Tooltip label="変形情報貼付">
						<ActionIcon
							variant="default"
							onClick={clipboard.pasteTransform}
							disabled={!canEditLayer || !clipboard.canPasteTransform}
							data-edit-op="paste-transform"
							aria-label="paste transform">
							⤵
						</ActionIcon>
					</Tooltip>
				</Group>

				{/* 画像ダウンロード (ImageLayer のみ): 元画像をファイル保存 */}
				{imageLayer && (
					<Group gap={4}>
						<Tooltip label="この画像をダウンロード">
							<ActionIcon
								variant="default"
								onClick={handleDownloadImage}
								data-edit-op="download-image"
								aria-label="download image">
								⬇
							</ActionIcon>
						</Tooltip>
					</Group>
				)}

				{/* 反転 H / V トグル (±90°/フィット/整列 は EditToolbar、回転リセットは回転入力に統合) */}
				<Group gap={4}>
					<Tooltip label="水平反転">
						<ActionIcon
							variant={selectedLayer?.mirrorH ? "filled" : "default"}
							onClick={() => layer.toggleMirrorH(layerIndex)}
							disabled={!canEditLayer}
							data-edit-op="mirror-h"
							aria-label="toggle mirror horizontal">
							⇄
						</ActionIcon>
					</Tooltip>
					<Tooltip label="垂直反転">
						<ActionIcon
							variant={selectedLayer?.mirrorV ? "filled" : "default"}
							onClick={() => layer.toggleMirrorV(layerIndex)}
							disabled={!canEditLayer}
							data-edit-op="mirror-v"
							aria-label="toggle mirror vertical">
							⇅
						</ActionIcon>
					</Tooltip>
				</Group>

				{/* 数値プロパティ (X / Y / 拡大率 / 回転、§12 Enter/↑↓/ホイール調整) */}
				{selectedLayer && hasSelection && (
					<Stack gap={4} data-edit-op-group="props">
						<Group gap={6} align="center" wrap="nowrap">
							<Text size="xs" c="dimmed" w={40}>
								X
							</Text>
							<NumberAdjustInput
								value={selectedLayer.transX}
								step={25}
								shiftStep={100}
								invert
								disabled={!canEditLayer}
								dataAdjust="transX"
								aria-label="X"
								onAdjust={(v) => livePatch({ transX: v })}
								onAdjustStart={handlePropStart}
								onAdjustEnd={() => handlePropEnd("edit X")}
							/>
							<Text size="xs" c="dimmed" w={40}>
								Y
							</Text>
							<NumberAdjustInput
								value={selectedLayer.transY}
								step={25}
								shiftStep={100}
								invert
								disabled={!canEditLayer}
								dataAdjust="transY"
								aria-label="Y"
								onAdjust={(v) => livePatch({ transY: v })}
								onAdjustStart={handlePropStart}
								onAdjustEnd={() => handlePropEnd("edit Y")}
							/>
						</Group>
						<Group gap={6} align="center" wrap="nowrap">
							<Text size="xs" c="dimmed" w={40}>
								拡大率
							</Text>
							<NumberAdjustInput
								value={selectedLayer.scaleX}
								step={0.1}
								multiply
								min={0.1}
								max={20}
								disabled={!canEditLayer}
								dataAdjust="scale"
								aria-label="拡大率"
								onAdjust={(v) => livePatch({ scaleX: v, scaleY: v })}
								onAdjustStart={handlePropStart}
								onAdjustEnd={() => handlePropEnd("edit scale")}
							/>
							<Text size="xs" c="dimmed" w={40}>
								回転
							</Text>
							<NumberAdjustInput
								value={selectedLayer.rotation}
								step={5}
								disabled={!canEditLayer}
								dataAdjust="rotation"
								aria-label="回転"
								onAdjust={(v) => livePatch({ rotation: v })}
								onAdjustStart={handlePropStart}
								onAdjustEnd={() => handlePropEnd("edit rotation")}
							/>
							<Tooltip label="回転リセット (0°)">
								<ActionIcon
									variant="subtle"
									onClick={() => layer.resetRotation(layerIndex)}
									disabled={!canEditLayer}
									data-edit-op="reset-rotation"
									aria-label="reset rotation">
									↺
								</ActionIcon>
							</Tooltip>
						</Group>
					</Stack>
				)}

				{/* 透明度 */}
				<Stack gap={2} data-edit-op-group="opacity">
					<Group gap={6} justify="space-between">
						<Text size="xs" c="dimmed">
							透明度
						</Text>
						<Group gap={4}>
							<Text size="xs" ff="monospace">
								{opacityPercent}%
							</Text>
							<Tooltip label="透明度リセット (100%)">
								<ActionIcon
									size="xs"
									variant="subtle"
									onClick={() => layer.resetOpacity(layerIndex)}
									disabled={!canEditLayer}
									data-edit-op="reset-opacity"
									aria-label="reset opacity">
									↺
								</ActionIcon>
							</Tooltip>
						</Group>
					</Group>
					<Slider
						value={opacityPercent}
						onChange={handleOpacityChange}
						onChangeEnd={endSliderEdit("edit opacity")}
						disabled={!canEditLayer}
						min={0}
						max={100}
						step={5}
						label={null}
						data-edit-op="opacity"
					/>
				</Stack>

				{/* テキスト編集 (D-9、TextLayer のみ表示) */}
				{textLayer && (
					<Stack gap={2} data-edit-op-group="text">
						<Text size="xs" c="dimmed">
							テキスト
						</Text>
						<Textarea
							value={textLayer.text}
							onChange={(e) => handleTextLiveChange(e.currentTarget.value)}
							onFocus={handleTextFocus}
							onBlur={(e) => handleTextBlur(e.currentTarget.value)}
							disabled={!canEditLayer}
							autosize
							minRows={2}
							maxRows={6}
							data-edit-op="text-edit"
						/>
					</Stack>
				)}

				{/* clipRect 4 slider (D-6b、ImageLayer のみ、上/右/下/左) */}
				{imageLayer && (
					<Stack gap={4} data-edit-op-group="clip-rect">
						<Group gap={6} justify="space-between" align="center">
							<Text size="xs" c="dimmed">
								クリップ (T/R/B/L)
							</Text>
							<Tooltip label="クリップリセット (0,0,0,0)">
								<ActionIcon
									size="xs"
									variant="subtle"
									onClick={handleClipReset}
									disabled={!canEditLayer}
									data-edit-op="reset-clip"
									aria-label="reset clip">
									↺
								</ActionIcon>
							</Tooltip>
						</Group>
						{[
							{
								key: "top",
								label: "T",
								idx: 0 as const,
								max: clipContentSize?.h ?? 0,
							},
							{
								key: "right",
								label: "R",
								idx: 1 as const,
								max: clipContentSize?.w ?? 0,
							},
							{
								key: "bottom",
								label: "B",
								idx: 2 as const,
								max: clipContentSize?.h ?? 0,
							},
							{
								key: "left",
								label: "L",
								idx: 3 as const,
								max: clipContentSize?.w ?? 0,
							},
						].map((row) => (
							<Group key={row.key} gap={6} align="center">
								<Text size="xs" ff="monospace" w={16}>
									{row.label}
								</Text>
								<Slider
									value={imageLayer.clipRect[row.idx]}
									onChange={(v) => handleClipChange(row.idx, v)}
									onChangeEnd={endSliderEdit("edit clip")}
									disabled={!canEditLayer || row.max <= 0}
									min={0}
									max={Math.max(row.max, 1)}
									step={1}
									label={null}
									data-edit-op={`clip-${row.key}`}
									style={{ flex: 1 }}
								/>
								<Text size="xs" ff="monospace" w={36} ta="right">
									{imageLayer.clipRect[row.idx]}
								</Text>
							</Group>
						))}
					</Stack>
				)}

				{!hasSelection && (
					<Text size="xs" c="dimmed">
						レイヤーを選択してください
					</Text>
				)}
				{hasSelection && isLocked && (
					<Text size="xs" c="dimmed">
						このレイヤーはロックされています
					</Text>
				)}
			</Stack>
		</Paper>
	);
};
