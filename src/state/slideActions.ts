/**
 * R3.9a: 旧 `useCase/SlideCommandsUseCase.ts` から移送した slide command 群の実装。
 *
 * - 公開シグネチャは `slideStore.commands` 経由でのみ利用される。
 * - 直接の依存（`HistoryManager` / `ImageManager` / `showNotice`）は deps コンテナ
 *   経由で受け取り、テスト容易性を確保する。
 * - `slideStore` の純粋性（runtime 依存ゼロ）を保つため、当ファイルは store 本体
 *   から切り離している。
 */
import { createImageLayer } from "../model/layer/ImageLayer";
import { createSlide, type Slide } from "../model/Slide";
import { EditCanvasRuntime } from "../runtime/EditCanvasRuntime";
import { ViewerMode } from "../runtime/viewerMode";
import type { SlideHistoryUseCase } from "../useCase/SlideHistoryUseCase";
import type { ImageManager } from "../utils/ImageManager";
import { layerStore } from "./layerStore";
import { slideStore, type SlideCommandsUseCase } from "./slideStore";

export type SlideCommandsDeps = {
	getViewerDocumentSize: () => { width: number; height: number };
	ensureAllowed: (canExecute: boolean, label: string) => boolean;
	canEdit: () => boolean;
	canEnterEditMode: (label: string) => boolean;
	slideHistory: SlideHistoryUseCase;
	getMode: () => ViewerMode;
	setMode: (mode: ViewerMode) => void;
	getEditCanvasRuntime: () => EditCanvasRuntime;
	/** R3.7: notice 表示の deps。Viewer 構築時に `showNotice` を渡す。 */
	notice: (message: string) => void;
	/** R3.7: ImageManager 連携の deps。`ImageManager.shared` を渡す。 */
	imageManager: ImageManager;
};

export function createSlideActions(deps: SlideCommandsDeps): SlideCommandsUseCase {
	const {
		getViewerDocumentSize,
		ensureAllowed,
		canEdit,
		canEnterEditMode,
		slideHistory,
		getMode,
		setMode,
		getEditCanvasRuntime,
		notice,
		imageManager,
	} = deps;

	// R3.9c: 旧 Viewer.ts 内のスライドストアヘルパを、slideStore 直叩き + EditCanvasRuntime 連動の
	// 内部関数として下ろし、Viewer 本体から action 側へ移送したもの。
	const getSlides = (): Slide[] => slideStore.getState().slides as Slide[];
	const getSelectedSlide = (): Slide | null => slideStore.getState().selectedSlide;

	const handleSlideSelectionChanged = (): void => {
		const editCanvasRuntime = getEditCanvasRuntime();
		if (!editCanvasRuntime || getMode() !== ViewerMode.EDIT) return;
		const selected = slideStore.getState().selectedSlide;
		if (selected) {
			editCanvasRuntime.setSlide(selected);
		} else {
			editCanvasRuntime.initialize();
		}
	};

	const handleSlideSelectionClosed = (): void => {
		const editCanvasRuntime = getEditCanvasRuntime();
		if (editCanvasRuntime) {
			editCanvasRuntime.initialize();
		}
		setMode(ViewerMode.SELECT);
		layerStore.getState().commands?.publishEditSelectionState();
	};

	const addSlide = (slide: Slide, index = -1): void => {
		slideStore.getState().addSlide(slide, index);
	};

	const selectSlideInstance = (slide: Slide | null): void => {
		const slides = slideStore.getState().slides;
		if (slide && slides.indexOf(slide) === -1) return;
		slideStore.getState().setSelectedSlide(slide);
		handleSlideSelectionChanged();
	};

	const selectSlideByIndex = (index: number): void => {
		const slides = getSlides();
		if (index < 0 || index >= slides.length) return;
		selectSlideInstance(slides[index]);
	};

	const selectSlideByOffset = (offset: number): void => {
		const selectedIndex = slideStore.getState().selectedIndex;
		if (offset === 0 || selectedIndex === -1) return;
		const slides = slideStore.getState().slides;
		const nextIndex = Math.max(0, Math.min(slides.length - 1, selectedIndex + offset));
		if (nextIndex === selectedIndex) return;
		selectSlideByIndex(nextIndex);
	};

	const removeSlide = (slide: Slide, destroySlide = true): void => {
		const slides = getSlides();
		const index = slides.indexOf(slide);
		if (index === -1) return;
		const wasSelected = slide === slideStore.getState().selectedSlide;
		const nextSlide = wasSelected
			? index < slides.length - 1
				? slides[index + 1]
				: index > 0
					? slides[index - 1]
					: null
			: null;

		slideStore.getState().removeSlide(slide);
		if (destroySlide) {
			slide.removeAllLayers();
			slide.clearEventListener();
		}
		if (nextSlide) {
			selectSlideInstance(nextSlide);
		} else if (wasSelected) {
			slideStore.getState().setSelectedIndex(-1);
			handleSlideSelectionClosed();
		}
	};

	const moveSelectedSlideToIndex = (toIndex: number): boolean => {
		if (!Number.isInteger(toIndex)) return false;
		if (!slideStore.getState().moveSelectedSlideToIndex(toIndex)) return false;
		handleSlideSelectionChanged();
		return true;
	};

	const moveSelectedSlideByOffset = (offset: number): boolean => {
		const selectedIndex = slideStore.getState().selectedIndex;
		if (!Number.isInteger(offset) || offset === 0 || selectedIndex === -1) return false;
		return moveSelectedSlideToIndex(selectedIndex + offset);
	};

	const publishEditSelectionState = () =>
		layerStore.getState().commands?.publishEditSelectionState();

	return {
		newSlide() {
			if (!ensureAllowed(canEdit(), "スライド追加")) return;
			const { width, height } = getViewerDocumentSize();
			const slide = createSlide(width, height);
			const slides = getSlides();
			const index = slides.length;
			const previousLastSlide = slides[index - 1] ?? null;
			const previousLastJoining = previousLastSlide?.joining ?? false;
			slideHistory.record(
				() => {
					if (previousLastSlide) {
						previousLastSlide.joining = false;
					}
					addSlide(slide, index);
					selectSlideInstance(slide);
				},
				() => {
					removeSlide(slide, false);
					if (previousLastSlide) {
						previousLastSlide.joining = previousLastJoining;
						selectSlideInstance(previousLastSlide);
					}
				},
				true
			);
		},

		cloneSelected() {
			if (!ensureAllowed(canEdit(), "スライド複製")) return;
			const sourceSlide = getSelectedSlide();
			if (!sourceSlide) return;
			const clonedSlide = sourceSlide.clone();
			const sourceJoining = sourceSlide.joining;
			slideHistory.record(
				() => {
					const sourceIndex = getSlides().indexOf(sourceSlide);
					if (sourceIndex === -1) return;
					sourceSlide.joining = true;
					addSlide(clonedSlide, sourceIndex + 1);
					selectSlideInstance(clonedSlide);
				},
				() => {
					removeSlide(clonedSlide, false);
					sourceSlide.joining = sourceJoining;
					selectSlideInstance(sourceSlide);
				},
				true
			);
		},

		addImageSlide(imageId: string, toIndex: number = -1) {
			if (!ensureAllowed(canEdit(), "画像スライド追加")) return;
			if (!imageId || !imageManager.getImagePropsById(imageId)) return;

			const layer = createImageLayer(imageId);
			if (layer.originHeight > layer.originWidth * 1.2) {
				layer.rotation -= 90;
			}
			const { width, height } = getViewerDocumentSize();
			const slide = createSlide(width, height, [layer]);
			slide.fitLayer(layer);
			const slidesLen = getSlides().length;
			const insertIndex = Number.isInteger(toIndex)
				? Math.max(0, Math.min(slidesLen, toIndex))
				: -1;

			slideHistory.record(
				() => {
					addSlide(slide, insertIndex);
					selectSlideInstance(slide);
				},
				() => {
					removeSlide(slide, false);
				},
				true
			);
		},

		deleteSelected() {
			if (!ensureAllowed(canEdit(), "スライド削除")) return;
			const slide = getSelectedSlide();
			if (!slide) return;
			const index = getSlides().indexOf(slide);
			slideHistory.record(
				() => {
					selectSlideInstance(slide);
					removeSlide(slide, false);
				},
				() => {
					addSlide(slide, index);
					selectSlideInstance(slide);
				},
				true
			);
		},

		moveSelectedBackward() {
			if (!ensureAllowed(canEdit(), "スライド並び替え")) return;
			const slide = getSelectedSlide();
			if (!slide || getSlides().indexOf(slide) <= 0) return;
			slideHistory.record(
				() => {
					selectSlideInstance(slide);
					moveSelectedSlideByOffset(-1);
				},
				() => {
					selectSlideInstance(slide);
					moveSelectedSlideByOffset(1);
				}
			);
		},

		moveSelectedForward() {
			if (!ensureAllowed(canEdit(), "スライド並び替え")) return;
			const slide = getSelectedSlide();
			const slides = getSlides();
			const index = slide ? slides.indexOf(slide) : -1;
			if (!slide || index === -1 || index >= slides.length - 1) return;
			slideHistory.record(
				() => {
					selectSlideInstance(slide);
					moveSelectedSlideByOffset(1);
				},
				() => {
					selectSlideInstance(slide);
					moveSelectedSlideByOffset(-1);
				}
			);
		},

		moveSelectedToIndex(toIndex: number) {
			if (!ensureAllowed(canEdit(), "スライド並び替え")) return;
			const slide = getSelectedSlide();
			const slides = getSlides();
			const fromIndex = slide ? slides.indexOf(slide) : -1;
			if (!slide || fromIndex === -1 || !Number.isInteger(toIndex)) return;
			const clampedToIndex = Math.max(0, Math.min(slides.length - 1, toIndex));
			if (fromIndex === clampedToIndex) return;

			slideHistory.record(
				() => {
					selectSlideInstance(slide);
					moveSelectedSlideToIndex(clampedToIndex);
				},
				() => {
					selectSlideInstance(slide);
					moveSelectedSlideToIndex(fromIndex);
				}
			);
		},

		toggleSelectedJoining() {
			if (!ensureAllowed(canEdit(), "スライド結合切替")) return;
			const slide = getSelectedSlide();
			if (!slide) return;
			const oldJoining = slide.joining;
			slideHistory.record(
				() => {
					slide.joining = !oldJoining;
				},
				() => {
					slide.joining = oldJoining;
				}
			);
		},

		toggleAllJoining() {
			if (!ensureAllowed(canEdit(), "全スライド結合切替")) return;
			const slides = getSlides();
			if (slides.length === 0) return;
			const previousStates = slides.map((slide) => ({
				slide,
				joining: slide.joining,
				durationRatio: slide.durationRatio,
			}));
			const nextJoining = !slides.every((slide) => slide.joining);
			slideHistory.record(
				() => {
					previousStates.forEach(({ slide }) => {
						slide.joining = nextJoining;
						slide.durationRatio = 1;
					});
				},
				() => {
					previousStates.forEach(({ slide, joining, durationRatio }) => {
						slide.joining = joining;
						slide.durationRatio = durationRatio;
					});
				}
			);
		},

		unjoinAll() {
			if (!ensureAllowed(canEdit(), "全スライド結合解除")) return;
			const slides = getSlides();
			if (!slides.some((slide) => slide.joining || slide.durationRatio !== 1)) return;
			const previousStates = slides.map((slide) => ({
				slide,
				joining: slide.joining,
				durationRatio: slide.durationRatio,
			}));
			slideHistory.record(
				() => {
					previousStates.forEach(({ slide }) => {
						slide.joining = false;
						slide.durationRatio = 1;
					});
				},
				() => {
					previousStates.forEach(({ slide, joining, durationRatio }) => {
						slide.joining = joining;
						slide.durationRatio = durationRatio;
					});
				}
			);
		},

		toggleSelectedDisabled() {
			if (!ensureAllowed(canEdit(), "スライド有効切替")) return;
			const slide = getSelectedSlide();
			if (!slide) return;
			const oldDisabled = slide.disabled;
			slideHistory.record(
				() => {
					slide.disabled = !oldDisabled;
				},
				() => {
					slide.disabled = oldDisabled;
				}
			);
		},

		enableAll() {
			if (!ensureAllowed(canEdit(), "全スライド有効化")) return;
			const slides = getSlides();
			if (!slides.some((slide) => slide.disabled)) return;
			const previousStates = slides.map((slide) => ({ slide, disabled: slide.disabled }));
			slideHistory.record(
				() => {
					previousStates.forEach(({ slide }) => {
						slide.disabled = false;
					});
				},
				() => {
					previousStates.forEach(({ slide, disabled }) => {
						slide.disabled = disabled;
					});
				}
			);
		},

		disableAll() {
			if (!ensureAllowed(canEdit(), "全スライド無効化")) return;
			const slides = getSlides();
			if (!slides.some((slide) => !slide.disabled)) return;
			const previousStates = slides.map((slide) => ({ slide, disabled: slide.disabled }));
			slideHistory.record(
				() => {
					previousStates.forEach(({ slide }) => {
						slide.disabled = true;
					});
				},
				() => {
					previousStates.forEach(({ slide, disabled }) => {
						slide.disabled = disabled;
					});
				}
			);
		},

		enableOnlySelected() {
			if (!ensureAllowed(canEdit(), "選択スライドのみ有効化")) return;
			const selectedSlide = getSelectedSlide();
			if (!selectedSlide) return;
			const slides = getSlides();
			const hasChange = slides.some((slide) => slide.disabled !== (slide !== selectedSlide));
			if (!hasChange) return;
			const previousStates = slides.map((slide) => ({ slide, disabled: slide.disabled }));
			slideHistory.record(
				() => {
					previousStates.forEach(({ slide }) => {
						slide.disabled = slide !== selectedSlide;
					});
				},
				() => {
					previousStates.forEach(({ slide, disabled }) => {
						slide.disabled = disabled;
					});
				}
			);
		},

		deleteDisabled() {
			if (!ensureAllowed(canEdit(), "無効スライド削除")) return;
			const disabledSlides = getSlides()
				.map((slide, index) => ({ slide, index }))
				.filter(({ slide }) => slide.disabled);
			if (disabledSlides.length === 0) return;
			const selectedSlide = getSelectedSlide();
			slideHistory.record(
				() => {
					disabledSlides.forEach(({ slide }) => {
						removeSlide(slide, false);
					});
				},
				() => {
					disabledSlides.forEach(({ slide, index }) => {
						addSlide(slide, index);
					});
					if (selectedSlide) {
						selectSlideInstance(selectedSlide);
					}
				},
				true
			);
		},

		setSelectedDurationRatio(ratio: number) {
			if (!ensureAllowed(canEdit(), "スライド長変更")) return;
			if (!isFinite(ratio) || ratio <= 0) return;
			const slide = getSelectedSlide();
			if (!slide) return;
			const oldRatio = slide.durationRatio;
			const nextRatio = Math.max(ratio, 0.2);
			if (oldRatio === nextRatio) return;
			slideHistory.record(
				() => {
					slide.durationRatio = nextRatio;
				},
				() => {
					slide.durationRatio = oldRatio;
				}
			);
		},

		selectPrevious() {
			selectSlideByOffset(-1);
		},

		selectNext() {
			selectSlideByOffset(1);
		},

		selectByIndex(index: number) {
			selectSlideByIndex(index);
		},

		enterSelectMode() {
			setMode(ViewerMode.SELECT);
		},

		enterEditMode() {
			if (!canEnterEditMode("編集モード切替")) {
				return;
			}
			const slide = getSelectedSlide();
			if (!slide) {
				notice("編集対象のスライドを選択してください。");
				return;
			}
			setMode(ViewerMode.EDIT);
			getEditCanvasRuntime().setSlide(slide);
		},

		closeEditMode() {
			setMode(ViewerMode.SELECT);
			setTimeout(() => {
				getEditCanvasRuntime().initialize();
				publishEditSelectionState();
			}, 301);
		},
	};
}
