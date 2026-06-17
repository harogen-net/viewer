import { ViewerStartUpMode } from "../runtime/viewerMode";
import { slideStore } from "../state/slideStore";
import { uiStore } from "../state/uiStore";
import { Command, HistoryManager } from "../utils/HistoryManager";

export type SlideHistoryUseCaseDeps = {
	getStartUpMode: () => ViewerStartUpMode;
	/** Rebind PropertyEvent listeners after the slide list mutates structurally. */
	rebindSlideMetaListeners: () => void;
};

export type SlideHistoryUseCase = {
	/** Push HistoryManager.canUndo/canRedo into uiStore. Honors startUpMode read-only path. */
	publishHistoryState(): void;
	/** Notify slideStore of slide-list (or layer) mutation. */
	publishSlides(syncLayers?: boolean): void;
	/** Re-publish slides after a history fwd/rev step (and optionally rebind listeners). */
	publishHistoryMutation(rebindSlides?: boolean): void;
	/** Wrap a paired fwd/rev mutation in a HistoryManager Command and execute it. */
	record(fwd: () => void, rev: () => void, rebindSlides?: boolean): void;
};

export function createSlideHistoryUseCase(deps: SlideHistoryUseCaseDeps): SlideHistoryUseCase {
	const publishHistoryState = (): void => {
		if (deps.getStartUpMode() !== ViewerStartUpMode.VIEW_AND_EDIT) {
			uiStore.getState().setHistory({ canUndo: false, canRedo: false });
			return;
		}
		uiStore.getState().setHistory({
			canUndo: HistoryManager.shared.canUndo,
			canRedo: HistoryManager.shared.canRedo,
		});
	};

	const publishSlides = (syncLayers: boolean = false): void => {
		if (syncLayers) {
			slideStore.getState().notifyLayersChanged();
			return;
		}
		slideStore.getState().notifySlidesChanged();
	};

	const publishHistoryMutation = (rebindSlides: boolean = false): void => {
		if (rebindSlides) {
			deps.rebindSlideMetaListeners();
		}
		publishSlides();
	};

	const record = (fwd: () => void, rev: () => void, rebindSlides: boolean = false): void => {
		HistoryManager.shared
			.record(
				new Command(
					() => {
						fwd();
						publishHistoryMutation(rebindSlides);
					},
					() => {
						rev();
						publishHistoryMutation(rebindSlides);
					}
				)
			)
			.do();
	};

	return { publishHistoryState, publishSlides, publishHistoryMutation, record };
}
