import type { FeatureGate } from "../runtime/featureGate";
import { ViewerStartUpMode } from "../runtime/viewerMode";

/**
 * R3.13: パーミッション集約 UseCase。
 *
 * Viewer.ts が抱えていた `canEdit` / `canSave` / `canExport` / `canImport` /
 * `canProceedWithDiscard` / `ensureAllowed` / `getPermissionPolicy` /
 * `showGateDenied` を集約し、各 store action / hook の deps コンテナへ注入する。
 */

export type PermissionDeps = {
	getFeatureGate: () => FeatureGate | undefined;
	getStartUpMode: () => ViewerStartUpMode;
	getIsDocumentModified: () => boolean;
	getIsStrictMode: () => boolean;
	notice: (message: string) => void;
};

export type PermissionUseCase = {
	getPolicy: () => FeatureGate;
	canEdit: () => boolean;
	canSave: () => boolean;
	canExport: () => boolean;
	canImport: () => boolean;
	canProceedWithDiscard: () => boolean;
	ensureAllowed: (canExecute: boolean, actionLabel: string) => boolean;
	showGateDenied: (actionLabel: string) => void;
};

export function createPermissionUseCase(deps: PermissionDeps): PermissionUseCase {
	const getPolicy = (): FeatureGate => {
		const explicit = deps.getFeatureGate();
		if (explicit) {
			return explicit;
		}
		const canMutate = deps.getStartUpMode() === ViewerStartUpMode.VIEW_AND_EDIT;
		return {
			canEdit: canMutate,
			canSave: canMutate,
			canExport: canMutate,
			canImport: true,
			canDeleteSavedData: canMutate,
		};
	};

	const showGateDenied = (actionLabel: string): void => {
		deps.notice(actionLabel + "は現在のモードでは許可されていません。");
	};

	const ensureAllowed = (canExecute: boolean, actionLabel: string): boolean => {
		if (canExecute) {
			return true;
		}
		showGateDenied(actionLabel);
		return false;
	};

	return {
		getPolicy,
		canEdit: () => getPolicy().canEdit,
		canSave: () => getPolicy().canSave,
		canExport: () => getPolicy().canExport,
		canImport: () => getPolicy().canImport,
		canProceedWithDiscard: () => {
			if (!deps.getIsDocumentModified() || !deps.getIsStrictMode()) {
				return true;
			}
			return false;
		},
		ensureAllowed,
		showGateDenied,
	};
}
