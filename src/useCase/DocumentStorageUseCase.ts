import type { ViewerDocument } from "../model/ViewerDocument";
import { FeatureGate } from "../runtime/featureGate";
import {
	createStorageOperationError,
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

const STORAGE_EVENT_WAIT_TIMEOUT_MS = 15000;

export class DocumentStorageUseCase {
	constructor(
		private readonly storage: StorageAdapter,
		private readonly gate?: FeatureGate
	) {}

	saveResult(doc: ViewerDocument, isOverride: boolean): Promise<StorageActionResult> {
		return this.executeAsyncResult(StorageAction.SAVE, this.canSave(), () => {
			return this.storage.save(doc, isOverride);
		});
	}

	exportResult(
		doc: ViewerDocument,
		type: HVDataType,
		options?: StorageExportOptions
	): Promise<StorageActionResult> {
		return this.executeAsyncResult(StorageAction.EXPORT, this.canExport(), () => {
			return this.storage.export(doc, type, options);
		});
	}

	loadResult(id: StorageInputId): Promise<StorageActionResult> {
		const recordId = this.normalizeId(id);
		if (!recordId) {
			return Promise.resolve(this.fail(StorageAction.LOAD, StorageErrorCode.INVALID_ARGUMENT));
		}
		if (!this.existsRecord(recordId)) {
			return Promise.resolve(this.fail(StorageAction.LOAD, StorageErrorCode.INVALID_ARGUMENT));
		}

		return this.executeAsyncResult(StorageAction.LOAD, true, () => this.performLoad(recordId));
	}

	importResult(file: File): Promise<StorageActionResult> {
		return this.executeAsyncResult(StorageAction.IMPORT, this.canImport(), () =>
			this.storage.import(file)
		);
	}

	deleteResult(id: StorageInputId): Promise<StorageActionResult> {
		const recordId = this.normalizeId(id);
		if (!recordId) {
			return Promise.resolve(this.fail(StorageAction.DELETE, StorageErrorCode.INVALID_ARGUMENT));
		}
		if (!this.existsRecord(recordId)) {
			return Promise.resolve(this.fail(StorageAction.DELETE, StorageErrorCode.INVALID_ARGUMENT));
		}

		return this.executeAsyncResult(StorageAction.DELETE, this.canDeleteSavedData(), () =>
			this.performDelete(recordId)
		);
	}

	onLoading(callback: (percentage: number) => void): () => void {
		const handler: StorageEventCallback = (event) => {
			const detail = (event as CustomEvent).detail;
			callback(typeof detail == "number" ? detail : 0);
		};
		this.storage.addEventListener(StorageEventType.LOADING, handler);
		return () => this.storage.removeEventListener(StorageEventType.LOADING, handler);
	}

	onLoaded(callback: (doc: ViewerDocument) => void): () => void {
		const handler: StorageEventCallback = (event) => {
			const detail = (event as CustomEvent).detail as ViewerDocument;
			callback(detail);
		};
		this.storage.addEventListener(StorageEventType.LOADED, handler);
		return () => this.storage.removeEventListener(StorageEventType.LOADED, handler);
	}

	onUpdated(callback: () => void): () => void {
		const handler: StorageEventCallback = () => {
			callback();
		};
		this.storage.addEventListener(StorageEventType.UPDATE, handler);
		return () => this.storage.removeEventListener(StorageEventType.UPDATE, handler);
	}

	onError(callback: (error: unknown) => void): () => void {
		const handler: StorageEventCallback = (event) => {
			callback((event as CustomEvent).detail ?? event);
		};
		this.storage.addEventListener(StorageEventType.ERROR, handler);
		return () => this.storage.removeEventListener(StorageEventType.ERROR, handler);
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

	getErrorNoticeMessage(error: unknown): string {
		switch (this.mapStorageErrorCode(error)) {
			case StorageErrorCode.PERMISSION_DENIED:
				return "この操作は現在のモードでは許可されていません。";
			case StorageErrorCode.INVALID_ARGUMENT:
				return "選択項目を確認してください。";
			case StorageErrorCode.UNSUPPORTED_VERSION:
				return "このファイル形式のバージョンはサポートされていません。";
			case StorageErrorCode.PARSE_ERROR:
				return "ファイルデータの解析に失敗しました。";
			case StorageErrorCode.MISSING_ASSET:
				return "必要な画像データが不足しています。";
			case StorageErrorCode.STORAGE_IO_ERROR:
			default:
				return "ストレージアクセスでエラーが発生しました。";
		}
	}

	private normalizeId(id: StorageInputId): StorageRecordId | undefined {
		if (id == null) return undefined;

		if (Array.isArray(id)) {
			return id.length > 0 ? this.normalizeId(id[0]) : undefined;
		}

		if (typeof id == "number") {
			return id.toString();
		}

		const normalized = id.toString().trim();
		if (!normalized || normalized == "-1") return undefined;
		return normalized;
	}

	private existsRecord(id: StorageRecordId): boolean {
		return this.getTitles().some((title) => title.id.toString() == id);
	}

	private performLoad(recordId: StorageRecordId): Promise<void> {
		return this.waitForStorageCompletion(StorageEventType.LOADED, "load operation timed out", () =>
			this.storage.load(recordId)
		);
	}

	private performDelete(recordId: StorageRecordId): Promise<void> {
		return this.waitForStorageCompletion(
			StorageEventType.UPDATE,
			"delete operation timed out",
			() => this.storage.delete(recordId)
		);
	}

	private waitForStorageCompletion(
		successEventType: StorageEventType,
		timeoutMessage: string,
		operation: () => void
	): Promise<void> {
		return new Promise<void>((resolve, reject) => {
			let timer: ReturnType<typeof setTimeout> | undefined;

			const onSuccess = () => {
				cleanup();
				resolve();
			};

			const onError = (event: Event) => {
				cleanup();
				reject((event as CustomEvent).detail ?? event);
			};

			const cleanup = () => {
				if (timer) {
					clearTimeout(timer);
					timer = undefined;
				}
				this.storage.removeEventListener(successEventType, onSuccess);
				this.storage.removeEventListener(StorageEventType.ERROR, onError);
			};

			this.storage.addEventListener(successEventType, onSuccess);
			this.storage.addEventListener(StorageEventType.ERROR, onError);

			timer = setTimeout(() => {
				cleanup();
				reject(createStorageOperationError(StorageErrorCode.STORAGE_IO_ERROR, timeoutMessage));
			}, STORAGE_EVENT_WAIT_TIMEOUT_MS);

			try {
				operation();
			} catch (error) {
				cleanup();
				reject(error);
			}
		});
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
				const matched = (Object.values(StorageErrorCode) as string[]).find(
					(value) => value == code
				);
				if (matched) {
					return matched as StorageErrorCode;
				}
			}
		}

		if (error instanceof SyntaxError) {
			return StorageErrorCode.PARSE_ERROR;
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
