import { SlideJoinIndicator } from "@/components/slide/SlideJoinIndicator";
import { SlideThumbView } from "@/components/slide/SlideThumbView";
import { SortableSlideThumb } from "@/components/slide/SortableSlideThumb";
import { useBulkToggleMode } from "@/hooks/useBulkToggleMode";
import { useDrop } from "@/hooks/useDrop";
import { useImageLibraryMutation } from "@/hooks/useImageLibraryMutation";
import { useSlideMutation } from "@/hooks/useSlideMutation";
import { useToast } from "@/hooks/useToast";
import { useSlideStore } from "@/state/slideStore";
import { useViewerDocumentStore } from "@/state/viewerDocumentStore";
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
import {
	ActionIcon,
	Group,
	Paper,
	ScrollArea,
	Stack,
	Switch,
	Text,
	Title,
	Tooltip,
} from "@mantine/core";
import type { CSSProperties, FC, MouseEvent as ReactMouseEvent } from "react";
import { Fragment, useCallback, useEffect, useRef } from "react";
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

// mobileMode (スマホモード): 追加/複製/削除/前後移動ボタン・per-thumb 編集コントロール・
// D&D 並べ替え・右クリックメニューを隠し、クリック選択のみ可にする。
// listMode (ギャラリー表示): 単一行横スクロールでなく複数行に折り返す (未編集時に領域を広く使う)。
export const SlideListPanel: FC<{ mobileMode?: boolean; listMode?: boolean }> = ({
	mobileMode = false,
	listMode = false,
}) => {
	const slides = useSlideStore((s) => s.slides);
	// 一括切替モード (docs/bulk-toggle-mode-plan.md)。一覧モード限定のサブ状態。
	const {
		active: bulkToggle,
		setActive: setBulkToggle,
		toggleAt,
		cancel: cancelBulkToggle,
	} = useBulkToggleMode();
	// Esc で抜ける。モード中だけ購読する (常時 keydown を掴まない)。
	useEffect(() => {
		if (!bulkToggle) return;
		const onKey = (e: KeyboardEvent): void => {
			if (e.key === "Escape") setBulkToggle(false);
		};
		window.addEventListener("keydown", onKey);
		return () => window.removeEventListener("keydown", onKey);
	}, [bulkToggle, setBulkToggle]);
	const selectedIndex = useSlideStore((s) => s.selectedIndex);
	const editingIndex = useSlideStore((s) => s.editingIndex);
	const setSelectedIndex = useSlideStore((s) => s.setSelectedIndex);
	const setEditingIndex = useSlideStore((s) => s.setEditingIndex);
	const meta = useViewerDocumentStore((s) => s.meta);

	// 文書が差し替わったらモードを打ち切る (履歴は残さない)。突入時 snapshot は前の文書の
	// ものなので、そのまま確定すると undo が前の文書を復元してしまう。
	useEffect(() => {
		cancelBulkToggle();
	}, [meta, cancelBulkToggle]);

	const bgColor = meta?.bgColor;
	const {
		moveSlide,
		addSlide,
		duplicateSlide,
		deleteSlide,
		setSlideJoining,
		setSlideDisabled,
		setSlideDurationRatio,
	} = useSlideMutation();

	// 一覧モードでスライド以外の「地面」をクリックしたら選択を解除する。
	// 編集モードで解除しないのは、選択 = 編集対象であり、降りる操作は × close が担うため。
	//
	// 判定はイベントの発生元がサムネ配下かどうかで行う。currentTarget との一致比較では、
	// サムネ間の隙間やスクロール領域の余白など「サムネでない子要素」を拾えない。
	const isListMode = editingIndex < 0;
	const handleGroundClick = (e: ReactMouseEvent<HTMLDivElement>): void => {
		if (!isListMode) return;
		const el = e.target as HTMLElement;
		// サムネ本体は地面ではない。PC では dnd-kit が並べ替え要素に role="button" を付けるため
		// 下のコントロール除外にも引っかかるが、スマホは dnd-kit を通さないためこの判定が要る。
		if (el.closest("[data-slide-index]")) return;
		// コントロール上のクリックも地面ではない。前後移動・追加ボタンはサムネの外にあるため、
		// 除外しないと「押した瞬間に選択が解除される」ことになる (回帰済み: 選択ナビが壊れた)。
		if (el.closest("button, input, a, [role='button'], [role='slider']")) return;
		if (selectedIndex < 0) return; // 既に未選択 (無駄な cascade を起こさない)
		setSelectedIndex(-1);
	};

	// 編集ストリップ (!listMode) で選択(=編集中)スライドを水平中央へ寄せる共通処理。
	// legacy ListViewController.scrollToSelected (EDIT) の
	//   scrollLeft = thumb.left + container.scrollLeft - container.width/2 + thumb.width/2
	// と同じ計算。viewport 内のみスクロールしページ全体は動かさない。
	//   - always=true : 常に中央 (選択 / モード変更時)
	//   - always=false: 可視範囲外の時だけ寄せる (リサイズ追随、手動スクロールを尊重)
	// 一覧 (listMode=縦スクロール) は対象外: 見切れてもホイールで掘れて領域も広く、追随不要。
	const viewportRef = useRef<HTMLDivElement>(null);
	const scrollSelectedIntoView = useCallback(
		(always: boolean, behavior: ScrollBehavior): void => {
			if (listMode || selectedIndex < 0) return;
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
		[listMode, selectedIndex]
	);

	// 選択変更 / モード変更 (一覧→編集ストリップ) 時: 中央へスムーズに寄せる。
	// (scrollSelectedIntoView は listMode / selectedIndex を依存に持つので、それらの変化で再実行される)
	useEffect(() => {
		scrollSelectedIntoView(true, "smooth");
	}, [scrollSelectedIntoView, slides.length]);

	// viewport の **寸法変化** に追随する (根本対策)。
	// フルスクリーン化/解除・ウィンドウリサイズ・回転・パネル開閉などで表示領域が変わると、
	// px ベースのスクロール位置が陳腐化し編集中スライドが画面外へずれるが、状態 (selectedIndex/listMode)
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
	const handleDeleteAt = (i: number): void => deleteSlide(i);

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

	// thumb コンテナは listMode=true (ギャラリー) で複数行へ折り返す。DnD も listMode 時は 2 次元 (rect) 戦略。
	const sortStrategy = listMode ? rectSortingStrategy : horizontalListSortingStrategy;

	// thumb 列コンテナの共通 style (閲覧/編集の両 path で共有)。
	// listMode (複数行) では行間を広めに取り alignContent:flex-start で上詰めにする。
	const thumbRowStyle: CSSProperties = {
		display: "flex",
		flexDirection: "row",
		flexWrap: listMode ? "wrap" : "nowrap",
		alignItems: listMode ? "flex-start" : "center",
		alignContent: "flex-start",
		// 横 (column) gap は 0。スライド間の区切り/接触は SlideJoinIndicator が担う
		// (結合中=隙間ゼロで接触、非結合=区切り線 + 隙間)。listMode 時の行間 (row gap) のみ残す。
		gap: listMode ? "12px 0" : 0,
		paddingBottom: 4,
		minHeight: THUMB_HEIGHT + 12,
	};

	// 新規スライド追加ボタン (legacy newSlideBtn 相当): リスト末尾に配置 (空でも表示)。
	const addSlideButton =
		!mobileMode && canAdd ? (
			<button
				type="button"
				onClick={handleAddSlide}
				style={{
					flex: "0 0 auto",
					// thumb と同じ box モデル (content-box + height + 2px border) で外形高さを一致させる。
					boxSizing: "content-box",
					height: THUMB_HEIGHT,
					minWidth: 56,
					// 横 gap を 0 にしたため、最後のスライドと接触しないよう左に間隔を確保。
					marginLeft: 8,
					alignSelf: listMode ? "flex-start" : "center",
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

	// スマホモードは画像ドロップ追加・右クリックメニューも無効。
	const body = (
		<Paper
			withBorder
			p="sm"
			radius="sm"
			// listMode (ギャラリー) 時は領域の高さいっぱいに伸ばし、下に空白を残さない。
			style={
				listMode
					? { position: "relative", height: "100%", display: "flex", flexDirection: "column" }
					: { position: "relative" }
			}
			bg="gray.3"
			onDragOver={mobileMode || bulkToggle ? undefined : dropProps.onDragOver}
			onDragLeave={mobileMode || bulkToggle ? undefined : dropProps.onDragLeave}
			onDrop={mobileMode || bulkToggle ? undefined : dropProps.onDrop}
			onClick={handleGroundClick}
			data-slide-list-drop-zone>
			{!mobileMode && <style>{THUMB_REVEAL_CSS}</style>}
			{!mobileMode && !bulkToggle && (
				<div style={dropOverlayStyle} data-slide-list-drop-overlay>
					ドロップで画像スライドを追加
				</div>
			)}
			<Stack gap="xs" style={listMode ? { flex: 1, minHeight: 0 } : undefined}>
				<Group justify="space-between" align="center">
					<Group>
						<Title order={5}>Slide List</Title>
						<Text size="xs" c="dimmed" ff="monospace">
							{slides.length} slides
							{selectedIndex >= 0 && ` / selected: #${selectedIndex + 1}`}
						</Text>
					</Group>

					{/* 一括切替モードの出入り。一覧モードのみ (編集モードのストリップでは出さない)。
					    モード中はスライドをクリックするだけで有効/無効が切り替わり、他の変更はできない。 */}
					{listMode && (
						<Switch
							size="sm"
							checked={bulkToggle}
							onChange={(e) => setBulkToggle(e.currentTarget.checked)}
							label="一括切替"
							data-action="bulk-toggle-mode"
							aria-label="一括切替モード"
						/>
					)}

					{/* 前後スライド選択 (◀▶) は編集モード (listMode=false) のみ表示。新規追加はリスト末尾へ移設。 */}
					{!mobileMode && !listMode && (
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
							スライドがありません{!mobileMode && canAdd && " (＋ で追加)"}
						</Text>
					</div>
				) : mobileMode ? (
					// スマホモード: D&D 無し・編集コントロール無しの素の一覧。
					// クリックは通常なら選択、一括切替モード中は有効/無効のトグル。
					//
					// 一括切替モードで branch を切り替えないこと。切り替えると全サムネが
					// unmount → remount され、canvas の再描画が全枚数で走る (体感でリロード)。
					// PC 側は下の DnD 経路のまま、useSortable の disabled で並べ替えだけ止める。
					<ScrollArea
						type="auto"
						scrollbarSize={14}
						viewportRef={viewportRef}
						style={listMode ? { flex: 1, minHeight: 0 } : undefined}>
						<div style={thumbRowStyle} data-slide-count={slides.length}>
							{slides.map((slide, i) => (
								<Fragment key={slide.uuid}>
									<SlideThumbView
										slide={slide}
										index={i}
										selected={i === selectedIndex}
										bgColor={bgColor}
										onClick={() => (bulkToggle ? toggleAt(i) : setSelectedIndex(i))}
										onSetDuration={(r) => setSlideDurationRatio(i, r)}
										onToggleJoining={() => setSlideJoining(i, !slide.joining)}
										onToggleDisabled={() =>
											bulkToggle ? toggleAt(i) : setSlideDisabled(i, !slide.disabled)
										}
										thumbHeight={THUMB_HEIGHT}
										mobileMode
										bulkToggleMode={bulkToggle}
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
								style={listMode ? { flex: 1, minHeight: 0 } : undefined}>
								<div style={thumbRowStyle} data-slide-count={slides.length}>
									{slides.map((slide, i) => (
										<Fragment key={slide.uuid}>
											<SortableSlideThumb
												id={slide.uuid}
												slide={slide}
												index={i}
												selected={i === selectedIndex}
												bgColor={bgColor}
												onClick={() => (bulkToggle ? toggleAt(i) : handleThumbClick(i))}
												onDoubleClick={bulkToggle ? undefined : () => enterEdit(i)}
												onEdit={() => enterEdit(i)}
												onDuplicate={() => handleDuplicateAt(i)}
												onDelete={() => void handleDeleteAt(i)}
												onSetDuration={(r) => setSlideDurationRatio(i, r)}
												onToggleJoining={() => setSlideJoining(i, !slide.joining)}
												onToggleDisabled={() =>
													bulkToggle ? toggleAt(i) : setSlideDisabled(i, !slide.disabled)
												}
												thumbHeight={THUMB_HEIGHT}
												bulkToggleMode={bulkToggle}
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
	return mobileMode ? body : <SlideListContextMenu>{body}</SlideListContextMenu>;
};
