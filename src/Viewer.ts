import { setActiveViewer } from "./bridge/activeViewer";
import { FeatureGate } from "./runtime/featureGate";
import type { ModeController } from "./runtime/ModeController";
import { bootstrapViewer } from "./runtime/ViewerBootstrap";
import { ViewerMode, ViewerStartUpMode } from "./runtime/viewerMode";
import { uiStore } from "./state/uiStore";

/**
 * R3.13: Viewer は起動オーケストレーションのみへ縮小。
 *
 * - 静的設定（`isStrictMode` / `startUpMode`）の保持
 * - `IsDocumentModified` 状態の保有と uiStore 同期
 * - `bootstrapViewer` 呼び出しによる runtime 群の生成と store 注入
 * - 公開 API として `setMode` を `ModeController` へ委譲
 *
 * ドメインロジック・runtime 連携・mode 遷移・permission 判定は全て
 * 各 useCase / hook / store action / `ViewerBootstrap` へ移送済み。
 */
export class Viewer {
	public static isStrictMode: boolean = true;
	public static startUpMode: ViewerStartUpMode = ViewerStartUpMode.VIEW_AND_EDIT;

	private modeController: ModeController;

	private _isDocumentModified = false;

	get IsDocumentModified(): boolean {
		return this._isDocumentModified;
	}
	set IsDocumentModified(value: boolean) {
		this._isDocumentModified = value;
		uiStore.getState().setModified(value);
	}

	constructor(
		public obj: HTMLElement,
		startUpMode: ViewerStartUpMode,
		featureGate?: FeatureGate
	) {
		setActiveViewer(this);
		Viewer.startUpMode = startUpMode;

		const result = bootstrapViewer({
			obj: this.obj,
			startUpMode,
			featureGate,
			getIsDocumentModified: () => this.IsDocumentModified,
			setIsDocumentModified: (value) => {
				this.IsDocumentModified = value;
			},
			isStrictMode: () => Viewer.isStrictMode,
		});

		this.modeController = result.modeController;
	}

	public setMode(mode: ViewerMode) {
		this.modeController.setMode(mode);
	}
}
