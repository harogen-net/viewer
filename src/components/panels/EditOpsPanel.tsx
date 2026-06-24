import {
	ActionIcon,
	Button,
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
import { useHistoryStore } from "../../state/historyStore";
import { useLayerStore } from "../../state/layerStore";
import { useSlideStore } from "../../state/slideStore";
import type { LayerBase } from "../../types/Layer";
import type { SlideState } from "../../types/SlideState";
import {
	type AlignEdge,
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
	const { undo, redo, applySlideChangeLive, recordHistory, snapshot } = useDocumentMutation();
	const layer = useLayerMutation();
	const clipboard = useLayerClipboard();
	const past = useHistoryStore((s) => s.past);
	const future = useHistoryStore((s) => s.future);
	const canUndo = past.length > 0;
	const canRedo = future.length > 0;
	const lastLabel = past.length > 0 ? past[past.length - 1].label : null;

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

	// テキストレイヤー追加 (D-9、legacy `.text` 基準):
	// まず prompt で初期テキストを受け付ける (legacy: new TextLayer(prompt(...)))。
	// cancel (null) 時は追加しない。追加後は当該 layer を選択し、textarea で続けて編集可。
	const handleAddText = () => {
		if (!selectedSlide) return;
		const input = window.prompt("テキストを入力:", "");
		// cancel (null) または空文字サブミットは追加しない
		if (input === null || input === "") return;
		layer.addTextLayer(input, selectedSlide.width, selectedSlide.height);
		const updated = useSlideStore.getState().slides[selectedSlideIndex];
		const added = updated?.layers[updated.layers.length - 1];
		if (added) useLayerStore.getState().setSelectedLayer(added);
	};

	// spread (§7、legacy spreadLayers): 選択 layer を前後の連続スライドへ展開し shared 化。
	// legacy 同様 confirm を挟む (破壊的に複数スライドへ clone 追加するため)。
	const handleSpread = () => {
		if (!hasSelection) return;
		if (
			!window.confirm("選択レイヤーを前後の連続スライドへ展開 (shared 化) します。よろしいですか?")
		)
			return;
		layer.spreadLayer(layerIndex);
	};

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

	// 透明度は 0-100 の slider にする (Mantine の Slider は数値変換が楽)。
	const opacityPercent = Math.round((selectedLayer?.opacity ?? 1) * 100);
	const handleOpacityChange = (value: number) => {
		if (layerIndex < 0) return;
		const next = Math.max(0, Math.min(1, value / 100));
		// 値変化なしの場合は layerOps.updateLayer が null を返し no-op + history 記録なし
		layer.updateLayer(layerIndex, { opacity: next });
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

	const handleFit = () => {
		if (!selectedLayer || !selectedSlide || layerIndex < 0) return;
		const size = measureContentSize();
		if (!size) return;
		layer.fitToSlide(layerIndex, selectedSlide.width, selectedSlide.height, size.w, size.h);
	};

	const handleAlign = (edge: AlignEdge) => {
		if (!selectedLayer || !selectedSlide || layerIndex < 0) return;
		const size = measureContentSize();
		if (!size) return;
		layer.alignTo(layerIndex, edge, selectedSlide.width, selectedSlide.height, size.w, size.h);
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
		layer.updateImageLayer(layerIndex, { clipRect: next });
	};
	const handleClipReset = () => {
		if (!imageLayer || layerIndex < 0) return;
		layer.updateImageLayer(layerIndex, { clipRect: [0, 0, 0, 0] });
	};

	return (
		<Paper withBorder p="sm" radius="sm">
			<Stack gap="xs">
				<Title order={5}>Edit Ops</Title>

				{/* Undo / Redo */}
				<Group gap={4}>
					<Tooltip label={canUndo && lastLabel ? `Undo: ${lastLabel}` : "Undo"}>
						<ActionIcon
							variant="default"
							onClick={undo}
							disabled={!canUndo}
							data-edit-op="undo"
							aria-label="undo">
							↶
						</ActionIcon>
					</Tooltip>
					<Tooltip label="Redo">
						<ActionIcon
							variant="default"
							onClick={redo}
							disabled={!canRedo}
							data-edit-op="redo"
							aria-label="redo">
							↷
						</ActionIcon>
					</Tooltip>
					<Text size="xs" c="dimmed" ff="monospace">
						{past.length} / {past.length + future.length}
					</Text>
				</Group>

				{/* 複製 / 削除 */}
				<Group gap={4}>
					<Tooltip label="複製">
						<ActionIcon
							variant="default"
							onClick={() => layer.duplicateLayer(layerIndex)}
							disabled={!canEditLayer}
							data-edit-op="duplicate"
							aria-label="duplicate">
							⎘
						</ActionIcon>
					</Tooltip>
					<Tooltip label="削除">
						<ActionIcon
							variant="default"
							color="red"
							onClick={() => layer.removeLayer(layerIndex)}
							disabled={!canEditLayer}
							data-edit-op="remove"
							aria-label="remove">
							✕
						</ActionIcon>
					</Tooltip>
					<Tooltip label="全スライドへ展開 (spread)">
						<ActionIcon
							variant="default"
							onClick={handleSpread}
							disabled={!hasSelection}
							data-edit-op="spread"
							aria-label="spread">
							⇉
						</ActionIcon>
					</Tooltip>
				</Group>

				{/* レイヤー追加 (D-9 テキスト) */}
				<Group gap={4}>
					<Button
						size="xs"
						variant="default"
						onClick={handleAddText}
						disabled={!selectedSlide}
						data-edit-op="add-text">
						＋ テキスト
					</Button>
				</Group>

				{/* clipboard: コピー / カット / ペースト + 変形コピー/貼付 (D-8) */}
				<Group gap={4}>
					<Tooltip label="コピー (Ctrl+C)">
						<ActionIcon
							variant="default"
							onClick={clipboard.copy}
							disabled={!hasSelection}
							data-edit-op="copy"
							aria-label="copy">
							⧉
						</ActionIcon>
					</Tooltip>
					<Tooltip label="カット (Ctrl+X)">
						<ActionIcon
							variant="default"
							onClick={clipboard.cut}
							disabled={!canEditLayer}
							data-edit-op="cut"
							aria-label="cut">
							✂
						</ActionIcon>
					</Tooltip>
					<Tooltip label="ペースト (Ctrl+V)">
						<ActionIcon
							variant="default"
							onClick={clipboard.paste}
							disabled={!clipboard.canPaste}
							data-edit-op="paste"
							aria-label="paste">
							📋
						</ActionIcon>
					</Tooltip>
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

				{/* 回転 (±90° / リセット) */}
				<Group gap={4}>
					<Tooltip label="左に 90°">
						<ActionIcon
							variant="default"
							onClick={() => layer.rotateBy(layerIndex, -90)}
							disabled={!canEditLayer}
							data-edit-op="rotate-left"
							aria-label="rotate left 90">
							↺
						</ActionIcon>
					</Tooltip>
					<Tooltip label="右に 90°">
						<ActionIcon
							variant="default"
							onClick={() => layer.rotateBy(layerIndex, 90)}
							disabled={!canEditLayer}
							data-edit-op="rotate-right"
							aria-label="rotate right 90">
							↻
						</ActionIcon>
					</Tooltip>
					<Tooltip label="回転リセット">
						<ActionIcon
							variant="default"
							onClick={() => layer.resetRotation(layerIndex)}
							disabled={!canEditLayer}
							data-edit-op="reset-rotation"
							aria-label="reset rotation">
							↺0
						</ActionIcon>
					</Tooltip>
				</Group>

				{/* 反転 H / V トグル + フィット */}
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
					<Tooltip label="slide にフィット (中央配置、scale1↔scale2 toggle)">
						<ActionIcon
							variant="default"
							onClick={handleFit}
							disabled={!canEditLayer || !selectedSlide}
							data-edit-op="fit"
							aria-label="fit to slide">
							⛶
						</ActionIcon>
					</Tooltip>
				</Group>

				{/* 位置揃え (上/右/下/左、visual bbox の端を slide 端に接する) */}
				<Group gap={4}>
					<Tooltip label="上端揃え">
						<ActionIcon
							variant="default"
							onClick={() => handleAlign("top")}
							disabled={!canEditLayer || !selectedSlide}
							data-edit-op="align-top"
							aria-label="align top">
							↥
						</ActionIcon>
					</Tooltip>
					<Tooltip label="右端揃え">
						<ActionIcon
							variant="default"
							onClick={() => handleAlign("right")}
							disabled={!canEditLayer || !selectedSlide}
							data-edit-op="align-right"
							aria-label="align right">
							↦
						</ActionIcon>
					</Tooltip>
					<Tooltip label="下端揃え">
						<ActionIcon
							variant="default"
							onClick={() => handleAlign("bottom")}
							disabled={!canEditLayer || !selectedSlide}
							data-edit-op="align-bottom"
							aria-label="align bottom">
							↧
						</ActionIcon>
					</Tooltip>
					<Tooltip label="左端揃え">
						<ActionIcon
							variant="default"
							onClick={() => handleAlign("left")}
							disabled={!canEditLayer || !selectedSlide}
							data-edit-op="align-left"
							aria-label="align left">
							↤
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
									disabled={!canEditLayer || row.max <= 0}
									min={0}
									max={Math.max(row.max, 1)}
									step={25}
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
