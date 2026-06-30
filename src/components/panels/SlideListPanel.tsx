import {
	closestCenter,
	DndContext,
	type DragEndEvent,
	KeyboardSensor,
	PointerSensor,
	useSensor,
	useSensors,
} from "@dnd-kit/core";
import {
	horizontalListSortingStrategy,
	rectSortingStrategy,
	SortableContext,
	sortableKeyboardCoordinates,
} from "@dnd-kit/sortable";
import { ActionIcon, Group, Paper, ScrollArea, Stack, Text, Title, Tooltip } from "@mantine/core";
import type { CSSProperties, FC } from "react";
import { Fragment, useCallback, useEffect, useRef } from "react";
import { useAlert } from "../../hooks/useAlert";
import { useDrop } from "../../hooks/useDrop";
import { useImageLibraryMutation } from "../../hooks/useImageLibraryMutation";
import { useSlideMutation } from "../../hooks/useSlideMutation";
import { useToast } from "../../hooks/useToast";
import { useSlideStore } from "../../state/slideStore";
import { useViewerDocumentStore } from "../../state/viewerDocumentStore";
import { SlideJoinIndicator } from "../slide/SlideJoinIndicator";
import { SlideThumbView } from "../slide/SlideThumbView";
import { SortableSlideThumb } from "../slide/SortableSlideThumb";
import { SlideListContextMenu } from "./SlideListContextMenu";

// SlideListPanel (v4 Group C build C-3、C-3R で slide view を slide/ に統合、C-4 で DnD + 前後ボタン、
//                 C-5 で 追加/削除/複製、C-6 でコンテキストメニュー、C-7 後にコンテキスト切出)。
// レガシー src/viewController/ListViewController.ts (jQuery + ThumbSlideView class) は
// import せず新規実装。
//
// 本 FC の責務 (本体ボタン群 + 横スクロール一覧):
//   - 横スクロール ScrollArea + DnD コンテキスト (@dnd-kit)
//   - 前後移動 (◀ ▶) / 追加 (➕) / 複製 (⧉) / 削除 (🗑) ボタン
//   - slides を SortableSlideThumb 列に展開、間に SlideJoinIndicator を挿入
//   - 状態テキスト (N slides / selected: #M)
//   - クリックで store.setSelectedIndex
//   - 並び替えは useSlideMutation.moveSlide 経由 (history 自動記録)
//
// コンテキストメニュー (右クリック → per-slide / 一括操作) は SlideListContextMenu に分離。
// 本 FC は SlideListContextMenu で wrap して onContextMenu を委譲する。

const THUMB_HEIGHT = 110;

// スライド操作ボタン (編集/削除/複製/duration) は **選択中のスライドのみ** 表示する
// (legacy 準拠)。data-thumb-reveal を持つ要素に適用。非選択中は pointer-events:none。
const THUMB_REVEAL_CSS = `
	[data-slide-index] [data-thumb-reveal] {
		opacity: 0;
		pointer-events: none;
		transition: opacity 0.15s ease;
	}
	[data-slide-index][data-selected="true"] [data-thumb-reveal] {
		opacity: 1;
		pointer-events: auto;
	}
`;

// readOnly (閲覧モード): 追加/複製/削除/前後移動ボタン・per-thumb 編集コントロール・
// D&D 並べ替え・右クリックメニューを隠し、クリック選択のみ可にする。
// wrap (ギャラリー表示): 単一行横スクロールでなく複数行に折り返す (未編集時に領域を広く使う)。
export const SlideListPanel: FC<{ readOnly?: boolean; wrap?: boolean }> = ({
	readOnly = false,
	wrap = false,
}) => {
	const slides = useSlideStore((s) => s.slides);
	const selectedIndex = useSlideStore((s) => s.selectedIndex);
	const editingIndex = useSlideStore((s) => s.editingIndex);
	const setSelectedIndex = useSlideStore((s) => s.setSelectedIndex);
	const setEditingIndex = useSlideStore((s) => s.setEditingIndex);
	const meta = useViewerDocumentStore((s) => s.meta);
	const bgColor = meta?.bgColor;
	const {
		moveSlide,
		addSlide,
		duplicateSlide,
		deleteSlide,
		setSlideJoining,
		setSlideDisabled,
		incrementSlideDurationRatio,
		decrementSlideDurationRatio,
	} = useSlideMutation();
	const alert = useAlert();

	// 編集ストリップ (!wrap) で選択(=編集中)スライドを水平中央へ寄せる共通処理。
	// legacy ListViewController.scrollToSelected (EDIT) の
	//   scrollLeft = thumb.left + container.scrollLeft - container.width/2 + thumb.width/2
	// と同じ計算。viewport 内のみスクロールしページ全体は動かさない。
	//   - always=true : 常に中央 (選択 / モード変更時)
	//   - always=false: 可視範囲外の時だけ寄せる (リサイズ追随、手動スクロールを尊重)
	// 一覧 (wrap=縦スクロール) は対象外: 見切れてもホイールで掘れて領域も広く、追随不要。
	const viewportRef = useRef<HTMLDivElement>(null);
	const scrollSelectedIntoView = useCallback(
		(always: boolean, behavior: ScrollBehavior): void => {
			if (wrap || selectedIndex < 0) return;
			const vp = viewportRef.current;
			const el = vp?.querySelector<HTMLElement>(`[data-slide-index="${selectedIndex}"]`);
			if (!vp || !el) return;
			const vpRect = vp.getBoundingClientRect();
			const elRect = el.getBoundingClientRect();
			const elLeft = elRect.left - vpRect.left;
			const visible = elLeft >= 0 && elLeft + elRect.width <= vpRect.width;
			if (!always && visible) return; // リサイズ時は見えていれば動かさない
			const left = vp.scrollLeft + elLeft - (vpRect.width - elRect.width) / 2;
			if (typeof vp.scrollTo === "function") vp.scrollTo({ left, behavior });
			else vp.scrollLeft = left;
		},
		[wrap, selectedIndex]
	);

	// 選択変更 / モード変更 (一覧→編集ストリップ) 時: 中央へスムーズに寄せる。
	// (scrollSelectedIntoView は wrap / selectedIndex を依存に持つので、それらの変化で再実行される)
	useEffect(() => {
		scrollSelectedIntoView(true, "smooth");
	}, [scrollSelectedIntoView, slides.length]);

	// viewport の **寸法変化** に追随する (根本対策)。
	// フルスクリーン化/解除・ウィンドウリサイズ・回転・パネル開閉などで表示領域が変わると、
	// px ベースのスクロール位置が陳腐化し編集中スライドが画面外へずれるが、状態 (selectedIndex/wrap)
	// は変わらないため上の effect は再実行されない。ResizeObserver で寸法変化を検知し、見切れ時のみ
	// 即時に寄せ直す。スライドショー復帰もフルスクリーン解除の寸法変化としてここで解決される。
	useEffect(() => {
		const vp = viewportRef.current;
		if (!vp || typeof ResizeObserver === "undefined") return;
		let first = true; // observe 直後の初回発火は選択 effect が担当するためスキップ
		const ro = new ResizeObserver(() => {
			if (first) {
				first = false;
				return;
			}
			scrollSelectedIntoView(false, "auto");
		});
		ro.observe(vp);
		return () => ro.disconnect();
	}, [scrollSelectedIntoView]);

	const isEmpty = slides.length === 0;
	// ◀▶ は「選択中スライドの前後を選択」するナビ (未選択 / 端では非活性)。
	const canSelectPrev = selectedIndex > 0;
	const canSelectNext = selectedIndex >= 0 && selectedIndex < slides.length - 1;
	const canAdd = !!meta;

	// DnD sensors: PointerSensor は 8px 移動するまで click 扱い (= サムネクリックで選択が成立)
	const sensors = useSensors(
		useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
		useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
	);

	const handleDragEnd = (event: DragEndEvent): void => {
		const { active, over } = event;
		if (!over || active.id === over.id) return;
		const from = slides.findIndex((s) => s.uuid === active.id);
		const to = slides.findIndex((s) => s.uuid === over.id);
		if (from < 0 || to < 0) return;
		moveSlide(from, to);
	};

	// 選択を i へ。編集中なら editingIndex も合わせる (= 編集対象切替、両者一致を維持)。
	// 一覧では selectedIndex のみ動かす (ハイライト、編集には移行しない)。
	const selectAt = (i: number): void => {
		if (editingIndex >= 0) setEditingIndex(i);
		else setSelectedIndex(i);
	};
	// 編集移行 (ダブルクリック / スライド内「編集」ボタン)。
	const enterEdit = (i: number): void => setEditingIndex(i);

	// ◀▶: 選択中スライドの前後を選択 (編集中は編集対象も追従)。
	const handleSelectPrev = (): void => {
		if (!canSelectPrev) return;
		selectAt(selectedIndex - 1);
	};
	const handleSelectNext = (): void => {
		if (!canSelectNext) return;
		selectAt(selectedIndex + 1);
	};

	const handleAddSlide = (): void => {
		if (!meta) return;
		// legacy ListVC と同じく document の screen 寸法で末尾に追加、追加後その slide を選択
		const nextIndex = slides.length;
		addSlide(meta.width, meta.height);
		selectAt(nextIndex);
	};

	// クリック: 一覧では選択 (ハイライト) のみ、編集中は対象スライド切替 (selectAt が両対応)。
	// 即編集移行はしない (ダブルクリック / スライド内「編集」のみ)。
	const handleThumbClick = (i: number): void => selectAt(i);
	// スライド内の複製/削除は選択に関係なく当該スライドへ作用する。
	const handleDuplicateAt = (i: number): void => duplicateSlide(i);
	const handleDeleteAt = async (i: number): Promise<void> => {
		if (!(await alert.confirm(`スライド #${i + 1} を削除しますか?`))) return;
		deleteSlide(i);
	};

	// 画像のドラッグ&ドロップ (D-12、legacy ListViewController drop 相当)。
	// imageId/ファイルいずれも「画像 1 枚を持つ新規 slide」を末尾に追加する。
	// document 未ロード時 (!meta) は drop を受け付けない。
	const { placeImageAsNewSlide, addImageFile } = useImageLibraryMutation();
	const toast = useToast();
	const { isOver, dropProps } = useDrop({
		disabled: !meta,
		onImageId: async (id) => {
			await placeImageAsNewSlide(id);
		},
		onFile: async (f) => {
			try {
				// 未対応形式 (HEIC 等) は addImageFile が reject → slide を作らず通知。
				const id = await addImageFile(f);
				await placeImageAsNewSlide(id);
			} catch (e) {
				toast.error(e instanceof Error ? e.message : String(e));
			}
		},
	});
	const dropOverlayStyle: CSSProperties = {
		position: "absolute",
		inset: 0,
		zIndex: 20,
		display: isOver ? "flex" : "none",
		alignItems: "center",
		justifyContent: "center",
		background: "rgba(34,139,230,0.12)",
		border: "2px dashed #228be6",
		borderRadius: 8,
		color: "#1971c2",
		fontSize: 14,
		fontWeight: 600,
		pointerEvents: "none",
	};

	// thumb コンテナは wrap=true (ギャラリー) で複数行へ折り返す。DnD も wrap 時は 2 次元 (rect) 戦略。
	const sortStrategy = wrap ? rectSortingStrategy : horizontalListSortingStrategy;

	// thumb 列コンテナの共通 style (閲覧/編集の両 path で共有)。
	// wrap (複数行) では行間を広めに取り alignContent:flex-start で上詰めにする。
	const thumbRowStyle: CSSProperties = {
		display: "flex",
		flexDirection: "row",
		flexWrap: wrap ? "wrap" : "nowrap",
		alignItems: wrap ? "flex-start" : "center",
		alignContent: "flex-start",
		gap: wrap ? "12px 6px" : 4,
		paddingBottom: 4,
		minHeight: THUMB_HEIGHT + 12,
	};

	// 新規スライド追加ボタン (legacy newSlideBtn 相当): リスト末尾に配置 (空でも表示)。
	const addSlideButton =
		!readOnly && canAdd ? (
			<button
				type="button"
				onClick={handleAddSlide}
				style={{
					flex: "0 0 auto",
					// thumb と同じ box モデル (content-box + height + 2px border) で外形高さを一致させる。
					boxSizing: "content-box",
					height: THUMB_HEIGHT,
					minWidth: 56,
					alignSelf: wrap ? "flex-start" : "center",
					border: "2px dashed #adb5bd",
					borderRadius: 4,
					background: "rgba(0,0,0,0.02)",
					color: "#868e96",
					fontSize: 28,
					lineHeight: 1,
					cursor: "pointer",
				}}
				aria-label="スライド追加"
				title="末尾にスライド追加"
				data-action="add">
				＋
			</button>
		) : null;

	// 閲覧モードは画像ドロップ追加・右クリックメニューも無効。
	const body = (
		<Paper
			withBorder
			p="sm"
			radius="sm"
			// wrap (ギャラリー) 時は領域の高さいっぱいに伸ばし、下に空白を残さない。
			style={
				wrap
					? { position: "relative", height: "100%", display: "flex", flexDirection: "column" }
					: { position: "relative" }
			}
			bg="gray.3"
			onDragOver={readOnly ? undefined : dropProps.onDragOver}
			onDragLeave={readOnly ? undefined : dropProps.onDragLeave}
			onDrop={readOnly ? undefined : dropProps.onDrop}
			data-slide-list-drop-zone>
			{!readOnly && <style>{THUMB_REVEAL_CSS}</style>}
			{!readOnly && (
				<div style={dropOverlayStyle} data-slide-list-drop-overlay>
					ドロップで画像スライドを追加
				</div>
			)}
			<Stack gap="xs" style={wrap ? { flex: 1, minHeight: 0 } : undefined}>
				<Group justify="space-between" align="center">
					<Group>
						<Title order={5}>Slide List</Title>
						<Text size="xs" c="dimmed" ff="monospace">
							{slides.length} slides
							{selectedIndex >= 0 && ` / selected: #${selectedIndex + 1}`}
						</Text>
					</Group>

					{/* 前後スライド選択 (◀▶) は編集モード (!wrap) のみ表示。新規追加はリスト末尾へ移設。 */}
					{!readOnly && !wrap && (
						<Group gap={4}>
							<Tooltip label="前のスライドを選択" disabled={!canSelectPrev}>
								<ActionIcon
									size="sm"
									variant="default"
									onClick={handleSelectPrev}
									disabled={!canSelectPrev}
									aria-label="前のスライドを選択"
									data-action="select-prev">
									◀
								</ActionIcon>
							</Tooltip>
							<Tooltip label="次のスライドを選択" disabled={!canSelectNext}>
								<ActionIcon
									size="sm"
									variant="default"
									onClick={handleSelectNext}
									disabled={!canSelectNext}
									aria-label="次のスライドを選択"
									data-action="select-next">
									▶
								</ActionIcon>
							</Tooltip>
						</Group>
					)}
				</Group>
				{isEmpty ? (
					<div style={{ display: "flex", alignItems: "center", gap: 8 }}>
						{addSlideButton}
						<Text size="xs" c="dimmed">
							スライドがありません{!readOnly && canAdd && " (＋ で追加)"}
						</Text>
					</div>
				) : readOnly ? (
					// 閲覧モード: D&D 無し・編集コントロール無しの素の一覧 (クリック選択のみ)。
					<ScrollArea
						type="auto"
						scrollbarSize={14}
						viewportRef={viewportRef}
						style={wrap ? { flex: 1, minHeight: 0 } : undefined}>
						<div style={thumbRowStyle} data-slide-count={slides.length}>
							{slides.map((slide, i) => (
								<Fragment key={slide.uuid}>
									<SlideThumbView
										slide={slide}
										index={i}
										selected={i === selectedIndex}
										bgColor={bgColor}
										onClick={() => setSelectedIndex(i)}
										onIncrementDuration={() => incrementSlideDurationRatio(i)}
										onDecrementDuration={() => decrementSlideDurationRatio(i)}
										onToggleJoining={() => setSlideJoining(i, !slide.joining)}
										onToggleDisabled={() => setSlideDisabled(i, !slide.disabled)}
										thumbHeight={THUMB_HEIGHT}
										readOnly
									/>
									{i < slides.length - 1 && <SlideJoinIndicator joining={slide.joining} />}
								</Fragment>
							))}
						</div>
					</ScrollArea>
				) : (
					<DndContext
						sensors={sensors}
						collisionDetection={closestCenter}
						onDragEnd={handleDragEnd}
						// drag 中の自動スクロールは完全に無効化 (祖先要素に波及してページ縦スクロールが起きるため)。
						// 端まで運ぶ場合はユーザが先に手動スクロールしてからドラッグ。
						autoScroll={false}>
						<SortableContext items={slides.map((s) => s.uuid)} strategy={sortStrategy}>
							<ScrollArea
								type="auto"
								scrollbarSize={14}
								viewportRef={viewportRef}
								style={wrap ? { flex: 1, minHeight: 0 } : undefined}>
								<div style={thumbRowStyle} data-slide-count={slides.length}>
									{slides.map((slide, i) => (
										<Fragment key={slide.uuid}>
											<SortableSlideThumb
												id={slide.uuid}
												slide={slide}
												index={i}
												selected={i === selectedIndex}
												bgColor={bgColor}
												onClick={() => handleThumbClick(i)}
												onDoubleClick={() => enterEdit(i)}
												onEdit={() => enterEdit(i)}
												onDuplicate={() => handleDuplicateAt(i)}
												onDelete={() => void handleDeleteAt(i)}
												onIncrementDuration={() => incrementSlideDurationRatio(i)}
												onDecrementDuration={() => decrementSlideDurationRatio(i)}
												onToggleJoining={() => setSlideJoining(i, !slide.joining)}
												onToggleDisabled={() => setSlideDisabled(i, !slide.disabled)}
												thumbHeight={THUMB_HEIGHT}
											/>
											{i < slides.length - 1 && <SlideJoinIndicator joining={slide.joining} />}
										</Fragment>
									))}
									{/* 新規スライド追加 (legacy newSlideBtn 相当): リスト末尾に配置。 */}
									{addSlideButton}
								</div>
							</ScrollArea>
						</SortableContext>
					</DndContext>
				)}
			</Stack>
		</Paper>
	);
	return readOnly ? body : <SlideListContextMenu>{body}</SlideListContextMenu>;
};
