/**
 * R3.8c: 旧 `LayerCommandsUseCase.ts` から移送した layer command 群の実装。
 *
 * `layerStore.ts` から runtime / 重量依存（`HistoryManager`, `ImageManager`,
 * `EditCanvasRuntime` 等）を切り離すために物理ファイルを分けている。
 * 公開 API の型は `layerStore` 側にあり、本ファイルはその実装ファクトリ。
 */
import { ViewerBridge } from "../bridge/ViewerBridge";
import { Direction } from "../model/Slide";
import { EditCanvasRuntime } from "../runtime/EditCanvasRuntime";
import { ViewerMode, ViewerStartUpMode } from "../runtime/viewerMode";
import type { SlideHistoryUseCase } from "../useCase/SlideHistoryUseCase";
import type { HistoryManager } from "../utils/HistoryManager";
import type { ImageManager } from "../utils/ImageManager";
import { layerStore, type LayerCommandsUseCase } from "./layerStore";

export type LayerCommandsDeps = {
	getStartUpMode: () => ViewerStartUpMode;
	getMode: () => ViewerMode;
	getEditCanvasRuntime: () => EditCanvasRuntime | undefined;
	canEdit: () => boolean;
	canExport: () => boolean;
	ensureAllowed: (canExecute: boolean, actionLabel: string) => boolean;
	setDocumentModified: (value: boolean) => void;
	slideHistory: SlideHistoryUseCase;
	/** R3.7: notice 表示の deps。Viewer 構築時に `showNotice` を渡す。 */
	notice: (message: string) => void;
	/** R3.7: HistoryManager 連携の deps。`HistoryManager.shared` を渡す。 */
	historyManager: HistoryManager;
	/** R3.7: ImageManager 連携の deps。`ImageManager.shared` を渡す。 */
	imageManager: ImageManager;
};

export function createLayerActions(deps: LayerCommandsDeps): LayerCommandsUseCase {
	const {
		getStartUpMode,
		getMode,
		getEditCanvasRuntime,
		canEdit,
		canExport,
		ensureAllowed,
		setDocumentModified,
		slideHistory,
		notice,
		historyManager,
		imageManager,
	} = deps;

	const inEditMode = (): boolean =>
		getStartUpMode() === ViewerStartUpMode.VIEW_AND_EDIT &&
		getMode() === ViewerMode.EDIT &&
		!!getEditCanvasRuntime();

	const publishEditSelectionState = (): void => {
		if (!inEditMode()) {
			layerStore.getState().clearEditState();
			return;
		}
	};

	const publishCurrentEditState = (): void => {
		const runtime = getEditCanvasRuntime();
		if (!inEditMode() || !runtime) {
			publishEditSelectionState();
			return;
		}
		runtime.emitCurrentState();
		publishEditSelectionState();
	};

	const canRunEditOperations = (actionLabel: string): boolean => {
		if (!ensureAllowed(canEdit(), actionLabel)) return false;
		if (getStartUpMode() !== ViewerStartUpMode.VIEW_AND_EDIT) return false;
		if (getMode() !== ViewerMode.EDIT) {
			notice("編集モードで操作してください。");
			return false;
		}
		return true;
	};

	const runSelection = (actionLabel: string, operation: () => boolean): void => {
		if (!canRunEditOperations(actionLabel)) return;
		if (!operation()) {
			notice("レイヤーを選択してください。");
		}
		publishEditSelectionState();
	};

	const runSelectionSilent = (actionLabel: string, operation: () => boolean): void => {
		if (!canRunEditOperations(actionLabel)) return;
		operation();
		publishEditSelectionState();
	};

	const run = (actionLabel: string, operation: () => void): void => {
		if (!canRunEditOperations(actionLabel)) return;
		operation();
		publishEditSelectionState();
	};

	const runtime = (): EditCanvasRuntime => {
		const r = getEditCanvasRuntime();
		if (!r) throw new Error("editCanvasRuntime is not initialized");
		return r;
	};

	return {
		rotateLeft() {
			runSelection("レイヤー回転", () => runtime().rotateSelectedLayer(-90));
		},
		rotateRight() {
			runSelection("レイヤー回転", () => runtime().rotateSelectedLayer(90));
		},
		toggleMirrorH() {
			runSelection("水平反転", () => runtime().toggleSelectedLayerMirrorH());
		},
		toggleMirrorV() {
			runSelection("垂直反転", () => runtime().toggleSelectedLayerMirrorV());
		},
		toggleIsText() {
			runSelection("テキスト切替", () => runtime().toggleSelectedLayerIsText());
		},
		spread(confirmed = false) {
			if (!canRunEditOperations("全スライド展開")) return;
			const request = runtime().getSelectedLayerRemovalRequest();
			if (!request) {
				notice("レイヤーを選択してください。");
				publishEditSelectionState();
				return;
			}
			if (!confirmed && ViewerBridge.hasListeners("spreadLayerRequested")) {
				ViewerBridge.emit("spreadLayerRequested", { layerName: request.layerName });
				return;
			}
			if (!confirmed) return;
			const ok = runtime().spreadSelectedLayer();
			if (!ok) {
				notice("レイヤーを選択してください。");
			}
		},
		fit() {
			runSelection("フィット", () => runtime().fitSelectedLayer());
		},
		arrangeTop() {
			runSelection("上揃え", () => runtime().arrangeSelectedLayer(Direction.TOP));
		},
		arrangeRight() {
			runSelection("右揃え", () => runtime().arrangeSelectedLayer(Direction.RIGHT));
		},
		arrangeBottom() {
			runSelection("下揃え", () => runtime().arrangeSelectedLayer(Direction.BOTTOM));
		},
		arrangeLeft() {
			runSelection("左揃え", () => runtime().arrangeSelectedLayer(Direction.LEFT));
		},
		moveUp() {
			runSelection("レイヤー順序変更", () => runtime().swapSelectedLayer(1));
		},
		moveDown() {
			runSelection("レイヤー順序変更", () => runtime().swapSelectedLayer(-1));
		},
		moveToTop() {
			runSelection("最前面へ移動", () => runtime().moveSelectedLayerToTop());
		},
		moveToBottom() {
			runSelection("最背面へ移動", () => runtime().moveSelectedLayerToBottom());
		},
		moveToIndex(toIndex) {
			runSelection("レイヤー順序変更", () => runtime().moveSelectedLayerToIndex(toIndex));
		},
		copyLayer() {
			runSelection("レイヤーコピー", () => runtime().copySelectedLayer());
		},
		cutLayer() {
			runSelection("レイヤーカット", () => runtime().cutSelectedLayer());
		},
		pasteLayer() {
			run("レイヤー貼り付け", () => {
				runtime().pasteLayer();
			});
		},
		addTextLayer(text) {
			run("テキストレイヤー追加", () => {
				runtime().addTextLayer(text);
			});
		},
		requestTextLayerInput() {
			if (!canRunEditOperations("テキストレイヤー追加")) return;
			if (ViewerBridge.hasListeners("textLayerInputRequested")) {
				ViewerBridge.emit("textLayerInputRequested", { open: true });
			}
		},
		copyTransform() {
			runSelection("変形コピー", () => runtime().copySelectedLayerTransform());
		},
		pasteTransform() {
			runSelection("変形貼り付け", () => runtime().pasteLayerTransform());
		},
		remove(confirmedSharedRemoval = false) {
			if (!canRunEditOperations("レイヤー削除")) return;
			const request = runtime().getSelectedLayerRemovalRequest();
			if (!request) {
				notice("レイヤーを選択してください。");
				publishEditSelectionState();
				return;
			}
			if (
				request.shared &&
				!confirmedSharedRemoval &&
				ViewerBridge.hasListeners("sharedLayerRemovalRequested")
			) {
				ViewerBridge.emit("sharedLayerRemovalRequested", { layerName: request.layerName });
				return;
			}
			runtime().removeSelectedLayer(confirmedSharedRemoval);
			publishEditSelectionState();
		},
		nudgeLeft() {
			runSelectionSilent("レイヤー移動", () => runtime().nudgeSelectedLayer(-10, 0));
		},
		nudgeRight() {
			runSelectionSilent("レイヤー移動", () => runtime().nudgeSelectedLayer(10, 0));
		},
		nudgeUp() {
			runSelectionSilent("レイヤー移動", () => runtime().nudgeSelectedLayer(0, -10));
		},
		nudgeDown() {
			runSelectionSilent("レイヤー移動", () => runtime().nudgeSelectedLayer(0, 10));
		},
		scaleUp() {
			runSelectionSilent("レイヤー拡大縮小", () => runtime().scaleSelectedLayer(1.1));
		},
		scaleDown() {
			runSelectionSilent("レイヤー拡大縮小", () => runtime().scaleSelectedLayer(1 / 1.1));
		},
		adjustRotationLeft() {
			runSelectionSilent("レイヤー回転", () => runtime().adjustSelectedLayerRotation(-5));
		},
		adjustRotationRight() {
			runSelectionSilent("レイヤー回転", () => runtime().adjustSelectedLayerRotation(5));
		},
		resetRotation() {
			runSelectionSilent("レイヤー回転", () => runtime().resetSelectedLayerRotation());
		},
		decreaseOpacity() {
			runSelectionSilent("透明度変更", () => runtime().adjustSelectedLayerOpacity(-0.05));
		},
		increaseOpacity() {
			runSelectionSilent("透明度変更", () => runtime().adjustSelectedLayerOpacity(0.05));
		},
		resetOpacity() {
			runSelectionSilent("透明度変更", () => runtime().resetSelectedLayerOpacity());
		},
		setPosition(x, y) {
			runSelectionSilent("位置変更", () => runtime().setSelectedLayerPosition(x, y));
		},
		setScale(scale) {
			runSelectionSilent("拡大縮小", () => runtime().setSelectedLayerScale(scale));
		},
		setRotation(rotation) {
			runSelectionSilent("回転変更", () => runtime().setSelectedLayerRotation(rotation));
		},
		setOpacity(opacity) {
			runSelectionSilent("透明度変更", () => runtime().setSelectedLayerOpacity(opacity));
		},
		setImageClip(top, right, bottom, left) {
			runSelectionSilent("クリップ変更", () =>
				runtime().setSelectedImageClip(top, right, bottom, left)
			);
		},
		resetImageClip() {
			runSelectionSilent("クリップ変更", () => runtime().resetSelectedImageClip());
		},
		selectByIndex(index) {
			if (!canRunEditOperations("レイヤー選択")) return;
			if (!runtime().selectEditLayerByIndex(index)) {
				notice("対象レイヤーが見つかりません。");
			}
			publishEditSelectionState();
		},
		toggleVisible() {
			runSelectionSilent("表示切替", () => runtime().toggleSelectedLayerVisible());
		},
		toggleLocked() {
			runSelectionSilent("ロック切替", () => runtime().toggleSelectedLayerLocked());
		},
		toggleShared() {
			runSelectionSilent("共有切替", () => runtime().toggleSelectedLayerShared());
		},
		setName(name) {
			runSelectionSilent("レイヤー名変更", () => runtime().setSelectedLayerName(name));
		},
		setText(text) {
			runSelectionSilent("テキスト変更", () => runtime().setSelectedLayerText(text));
		},
		zoomInCanvas() {
			run("キャンバス拡大", () => {
				runtime().zoomInCanvas();
			});
		},
		zoomOutCanvas() {
			run("キャンバス縮小", () => {
				runtime().zoomOutCanvas();
			});
		},
		resetCanvasZoom() {
			run("キャンバス倍率初期化", () => {
				runtime().resetCanvasZoom();
			});
		},
		setCanvasScale(scale) {
			if (!isFinite(scale) || scale <= 0) return;
			run("キャンバス倍率変更", () => {
				runtime().setCanvasScale(scale);
			});
		},
		toggleRectEdit() {
			run("同時編集切替", () => {
				runtime().toggleRectEdit();
			});
		},
		setRectEdit(enabled) {
			run("同時編集設定", () => {
				runtime().setRectEdit(Boolean(enabled));
			});
		},
		async replaceImage(file, applyAllReferences) {
			if (!canRunEditOperations("画像差し替え")) return;
			if (!file) return;
			const ok = await runtime().replaceSelectedImage(file, applyAllReferences);
			if (!ok) {
				notice("画像レイヤーを選択してください。");
			}
			publishEditSelectionState();
		},
		downloadImage() {
			if (!ensureAllowed(canExport(), "画像ダウンロード")) return;
			runSelection("画像ダウンロード", () => runtime().downloadSelectedImage());
		},
		deleteImageById(imageId, confirmed = false) {
			if (!ensureAllowed(canEdit(), "画像削除")) return;
			if (!imageId) return;
			if (!confirmed && ViewerBridge.hasListeners("imageDeleteRequested")) {
				const imageProps = imageManager.getImagePropsById(imageId);
				ViewerBridge.emit("imageDeleteRequested", {
					imageId,
					name: imageProps?.name || imageId,
				});
				return;
			}
			if (!confirmed) return;
			imageManager.deleteImageById(imageId);
			setDocumentModified(true);
			slideHistory.publishSlides(true);
			publishCurrentEditState();
			slideHistory.publishHistoryState();
		},
		undo() {
			if (!ensureAllowed(canEdit(), "Undo")) return;
			if (getStartUpMode() !== ViewerStartUpMode.VIEW_AND_EDIT) return;
			historyManager.undo();
		},
		redo() {
			if (!ensureAllowed(canEdit(), "Redo")) return;
			if (getStartUpMode() !== ViewerStartUpMode.VIEW_AND_EDIT) return;
			historyManager.redo();
		},
		publishEditSelectionState,
		publishCurrentEditState,
	};
}
