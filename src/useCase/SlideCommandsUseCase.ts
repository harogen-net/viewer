import { createImageLayer } from "../model/layer/ImageLayer";
import { createSlide, Slide } from "../model/Slide";
import { EditCanvasRuntime } from "../runtime/EditCanvasRuntime";
import { showNotice } from "../runtime/notice";
import { ViewerMode } from "../runtime/viewerMode";
import { ImageManager } from "../utils/ImageManager";
import type { SlideHistoryUseCase } from "./SlideHistoryUseCase";

export type SlideCommandsDeps = {
	getSlides: () => Slide[];
	getSelectedSlide: () => Slide | null;
	getSelectedSlideIndex: () => number;
	getViewerDocumentSize: () => { width: number; height: number };
	ensureAllowed: (canExecute: boolean, label: string) => boolean;
	canEdit: () => boolean;
	canEnterEditMode: (label: string) => boolean;
	slideHistory: SlideHistoryUseCase;
	addSlide: (slide: Slide, index?: number) => void;
	removeSlide: (slide: Slide, destroy?: boolean) => void;
	selectSlideInstance: (slide: Slide | null) => void;
	selectSlideByIndex: (index: number) => void;
	selectSlideByOffset: (offset: number) => void;
	moveSelectedSlideByOffset: (offset: number) => boolean;
	moveSelectedSlideToIndex: (toIndex: number) => boolean;
	setMode: (mode: ViewerMode) => void;
	getEditCanvasRuntime: () => EditCanvasRuntime;
	publishEditSelectionState: () => void;
};

export type SlideCommandsUseCase = {
	newSlide(): void;
	cloneSelected(): void;
	addImageSlide(imageId: string, toIndex?: number): void;
	deleteSelected(): void;
	moveSelectedBackward(): void;
	moveSelectedForward(): void;
	moveSelectedToIndex(toIndex: number): void;
	toggleSelectedJoining(): void;
	toggleAllJoining(): void;
	unjoinAll(): void;
	toggleSelectedDisabled(): void;
	enableAll(): void;
	disableAll(): void;
	enableOnlySelected(): void;
	deleteDisabled(): void;
	setSelectedDurationRatio(ratio: number): void;
	selectPrevious(): void;
	selectNext(): void;
	selectByIndex(index: number): void;
	enterSelectMode(): void;
	enterEditMode(): void;
	closeEditMode(): void;
};

export function createSlideCommandsUseCase(deps: SlideCommandsDeps): SlideCommandsUseCase {
	const {
		getSlides,
		getSelectedSlide,
		getViewerDocumentSize,
		ensureAllowed,
		canEdit,
		canEnterEditMode,
		slideHistory,
		addSlide,
		removeSlide,
		selectSlideInstance,
		selectSlideByIndex,
		selectSlideByOffset,
		moveSelectedSlideByOffset,
		moveSelectedSlideToIndex,
		setMode,
		getEditCanvasRuntime,
		publishEditSelectionState,
	} = deps;

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
			if (!imageId || !ImageManager.shared.getImagePropsById(imageId)) return;

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
				showNotice("編集対象のスライドを選択してください。");
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
