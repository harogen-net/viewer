import { ViewerDocument } from "../model/ViewerDocument";
import { FeatureGate } from "../runtime/featureGate";
import {
	StorageAdapter,
	StorageErrorCode,
	StorageEventCallback,
	StorageEventType,
	StorageExportOptions,
	StorageRecordId,
} from "../storage/StorageAdapter";
import { HVDataType, SlideTitle } from "../storage/storageTypes";

type StorageInputId = string | number | string[] | null | undefined;

export const StorageAction = {
	SAVE: "save",
	EXPORT: "export",
	IMPORT: "import",
	LOAD: "load",
	DELETE: "delete",
} as const;

export type StorageAction = (typeof StorageAction)[keyof typeof StorageAction];

export type StorageActionResult =
	| { ok: true; action: StorageAction }
	| { ok: false; action: StorageAction; error: StorageErrorCode; message: string };

export class DocumentStorageUseCase {
	constructor(
		private readonly storage: StorageAdapter,
		private readonly gate?: FeatureGate
	) {}

	saveResult(doc: ViewerDocument, isOverride: boolean): StorageActionResult {
		return this.executeSyncResult(StorageAction.SAVE, this.canSave(), () => {
			this.storage.save(doc, isOverride);
		});
	}

	exportResult(
		doc: ViewerDocument,
		type: HVDataType,
		options?: StorageExportOptions
	): StorageActionResult {
		return this.executeSyncResult(StorageAction.EXPORT, this.canExport(), () => {
			this.storage.export(doc, type, options);
		});
	}

	loadResult(id: StorageInputId): StorageActionResult {
		const recordId = this.normalizeId(id);
		if (!recordId) {
			return this.fail(StorageAction.LOAD, StorageErrorCode.INVALID_ARGUMENT);
		}

		return this.executeSyncResult(StorageAction.LOAD, true, () => {
			this.storage.load(recordId);
		});
	}

	importResult(file: File): Promise<StorageActionResult> {
		return this.executeAsyncResult(StorageAction.IMPORT, this.canImport(), () =>
			this.storage.import(file)
		);
	}

	deleteResult(id: StorageInputId): StorageActionResult {
		const recordId = this.normalizeId(id);
		if (!recordId) {
			return this.fail(StorageAction.DELETE, StorageErrorCode.INVALID_ARGUMENT);
		}

		return this.executeSyncResult(StorageAction.DELETE, this.canDeleteSavedData(), () => {
			this.storage.delete(recordId);
		});
	}

	addEventListener(type: StorageEventType | string, callback: StorageEventCallback): void {
		this.storage.addEventListener(type, callback);
	}

	removeEventListener(type: StorageEventType | string, callback: StorageEventCallback): void {
		this.storage.removeEventListener(type, callback);
	}

	getTitles(): SlideTitle[] {
		return this.storage.getTitles();
	}

	canSave(): boolean {
		return this.gate ? this.gate.canSave : true;
	}

	canExport(): boolean {
		return this.gate ? this.gate.canExport : true;
	}

	canImport(): boolean {
		return this.gate ? this.gate.canImport : true;
	}

	canDeleteSavedData(): boolean {
		return this.gate ? this.gate.canDeleteSavedData : true;
	}

	private normalizeId(id: StorageInputId): StorageRecordId | undefined {
		if (id == null) return undefined;

		if (Array.isArray(id)) {
			return id.length > 0 ? id[0] : undefined;
		}

		if (typeof id == "number") {
			return id.toString();
		}

		const normalized = id.toString().trim();
		if (!normalized || normalized == "-1") return undefined;
		return normalized;
	}

	private executeSyncResult(
		action: StorageAction,
		canExecute: boolean,
		operation: () => void
	): StorageActionResult {
		if (!canExecute) {
			return this.fail(action, StorageErrorCode.PERMISSION_DENIED);
		}

		try {
			operation();
			return { ok: true, action };
		} catch (error) {
			return this.fail(action, this.mapStorageErrorCode(error));
		}
	}

	private executeAsyncResult(
		action: StorageAction,
		canExecute: boolean,
		operation: () => Promise<void>
	): Promise<StorageActionResult> {
		if (!canExecute) {
			return Promise.resolve(this.fail(action, StorageErrorCode.PERMISSION_DENIED));
		}

		try {
			return operation()
				.then(() => ({ ok: true, action }) as StorageActionResult)
				.catch((error) => {
					return this.fail(action, this.mapStorageErrorCode(error));
				});
		} catch (error) {
			return Promise.resolve(this.fail(action, this.mapStorageErrorCode(error)));
		}
	}

	private mapStorageErrorCode(error: unknown): StorageErrorCode {
		if (error && typeof error == "object" && "code" in error) {
			const code = (error as { code?: unknown }).code;
			if (typeof code == "string") {
				const matched = (Object.values(StorageErrorCode) as string[]).find((value) => value == code);
				if (matched) {
					return matched as StorageErrorCode;
				}
			}
		}

		if (error instanceof SyntaxError) {
			return StorageErrorCode.PARSE_ERROR;
		}

		if (error instanceof Error) {
			const msg = error.message.toLowerCase();
			if (msg.indexOf("too old version") != -1 || msg.indexOf("unsupported") != -1) {
				return StorageErrorCode.UNSUPPORTED_VERSION;
			}
			if (msg.indexOf("parse") != -1 || msg.indexOf("json") != -1 || msg.indexOf("zip") != -1) {
				return StorageErrorCode.PARSE_ERROR;
			}
			if (msg.indexOf("asset") != -1 || msg.indexOf("image") != -1) {
				return StorageErrorCode.MISSING_ASSET;
			}
		}

		return StorageErrorCode.STORAGE_IO_ERROR;
	}

	private fail(action: StorageAction, error: StorageErrorCode): StorageActionResult {
		return {
			ok: false,
			action,
			error,
			message: this.getErrorMessage(action, error),
		};
	}

	private getErrorMessage(action: StorageAction, error: StorageErrorCode): string {
		const actionLabel = this.getActionLabel(action);

		switch (error) {
			case StorageErrorCode.PERMISSION_DENIED:
				return actionLabel + "は現在のモードでは許可されていません。";
			case StorageErrorCode.INVALID_ARGUMENT:
				return actionLabel + "に失敗しました。選択項目を確認してください。";
			case StorageErrorCode.STORAGE_IO_ERROR:
				return actionLabel + "に失敗しました。ストレージへのアクセスでエラーが発生しました。";
			case StorageErrorCode.UNSUPPORTED_VERSION:
				return "このファイル形式のバージョンはサポートされていません。";
			case StorageErrorCode.PARSE_ERROR:
				return "ファイルデータの解析に失敗しました。";
			case StorageErrorCode.MISSING_ASSET:
				return "必要な画像データが不足しています。";
			default:
				return actionLabel + "に失敗しました。";
		}
	}

	private getActionLabel(action: StorageAction): string {
		switch (action) {
			case StorageAction.SAVE:
				return "保存";
			case StorageAction.EXPORT:
				return "書き出し";
			case StorageAction.IMPORT:
				return "読み込み";
			case StorageAction.LOAD:
				return "読込";
			case StorageAction.DELETE:
				return "削除";
			default:
				return action;
		}
	}
}
