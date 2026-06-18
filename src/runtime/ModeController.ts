import $ from "jquery";
import { layerStore } from "../state/layerStore";
import { uiStore } from "../state/uiStore";
import type { PermissionUseCase } from "../useCase/PermissionUseCase";
import type { EditCanvasRuntime } from "./EditCanvasRuntime";
import { ViewerMode, ViewerStartUpMode } from "./viewerMode";

/**
 * R3.13: モード遷移コントローラ。
 *
 * Viewer.ts が持っていた `setMode` / `applySelectMode` / `applyEditMode` /
 * `canEnterEditMode` を集約し、`_mode` 状態と DOM クラス操作・runtime 連動・
 * uiStore 同期・layer publish を一括で扱う。
 */

export type ModeControllerDeps = {
	obj: JQuery;
	getStartUpMode: () => ViewerStartUpMode;
	getEditCanvasRuntime: () => EditCanvasRuntime | undefined;
	permission: PermissionUseCase;
};

export type ModeController = {
	getMode: () => ViewerMode;
	setMode: (mode: ViewerMode) => void;
	canEnterEditMode: (actionLabel: string) => boolean;
};

export function createModeController(deps: ModeControllerDeps): ModeController {
	let mode: ViewerMode | undefined;

	const applySelectMode = (): void => {
		$("body").removeClass("slideShow");
		deps.obj.addClass("select");
		deps.obj.removeClass("edit");
		if (deps.getStartUpMode() === ViewerStartUpMode.VIEW_AND_EDIT) {
			const runtime = deps.getEditCanvasRuntime();
			if (runtime) {
				runtime.slideView.isActive = false;
			}
		}
	};

	const applyEditMode = (): void => {
		$("body").removeClass("slideShow");
		deps.obj.removeClass("select");
		deps.obj.addClass("edit");
		if (deps.getStartUpMode() === ViewerStartUpMode.VIEW_AND_EDIT) {
			const runtime = deps.getEditCanvasRuntime();
			if (runtime) {
				runtime.slideView.isActive = true;
			}
		}
	};

	const setMode = (next: ViewerMode): void => {
		if (next === mode) {
			if (next !== ViewerMode.SLIDESHOW) {
				$("body").removeClass("slideShow");
			}
			return;
		}
		mode = next;

		switch (mode) {
			case ViewerMode.SELECT:
				applySelectMode();
				break;
			case ViewerMode.EDIT:
				applyEditMode();
				break;
		}
		if (deps.getStartUpMode() === ViewerStartUpMode.VIEW_AND_EDIT) {
			const runtime = deps.getEditCanvasRuntime();
			if (runtime) {
				runtime.setMode(mode);
			}
		}

		const bridgeMode =
			mode === ViewerMode.EDIT
				? "edit"
				: mode === ViewerMode.SLIDESHOW
					? "slideshow"
					: "select";
		uiStore.getState().setMode(bridgeMode);
		layerStore.getState().commands?.publishEditSelectionState();
	};

	const canEnterEditMode = (actionLabel: string): boolean => {
		if (!deps.permission.ensureAllowed(deps.permission.canEdit(), actionLabel)) {
			return false;
		}
		return deps.getStartUpMode() === ViewerStartUpMode.VIEW_AND_EDIT;
	};

	return {
		getMode: () => mode as ViewerMode,
		setMode,
		canEnterEditMode,
	};
}
