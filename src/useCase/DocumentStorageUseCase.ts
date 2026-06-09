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
import { HVDataType, SlideTitle } from "../utils/SlideStorage";

type StorageInputId = string | number | string[] | null | undefined;

export enum StorageAction {
  SAVE = "save",
  EXPORT = "export",
  IMPORT = "import",
  LOAD = "load",
  DELETE = "delete",
}

export class DocumentStorageUseCase {
  private lastError: StorageErrorCode | undefined;

  constructor(
    private readonly storage: StorageAdapter,
    private readonly gate?: FeatureGate,
  ) {}

  getLastError(): StorageErrorCode | undefined {
    return this.lastError;
  }

  getLastErrorMessage(action: StorageAction): string {
    const actionLabel = this.getActionLabel(action);

    switch (this.lastError) {
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

  addEventListener(type: StorageEventType | string, callback: StorageEventCallback): void {
    this.storage.addEventListener(type, callback);
  }

  removeEventListener(type: StorageEventType | string, callback: StorageEventCallback): void {
    this.storage.removeEventListener(type, callback);
  }

  getTitles(): SlideTitle[] {
    return this.storage.getTitles();
  }

  save(doc: ViewerDocument, isOverride: boolean): boolean {
    return this.executeSync(this.canSave(), () => {
      this.storage.save(doc, isOverride);
    });
  }

  export(doc: ViewerDocument, type: HVDataType, options?: StorageExportOptions): boolean {
    return this.executeSync(this.canExport(), () => {
      this.storage.export(doc, type, options);
    });
  }

  load(id: StorageInputId): boolean {
    const recordId = this.normalizeId(id);
    if (!recordId) {
      this.lastError = StorageErrorCode.INVALID_ARGUMENT;
      return false;
    }

    return this.executeSync(true, () => {
      this.storage.load(recordId);
    });
  }

  import(file: File): Promise<boolean> {
    return this.executeAsync(this.canImport(), () => this.storage.import(file));
  }

  delete(id: StorageInputId): boolean {
    const recordId = this.normalizeId(id);
    if (!recordId) {
      this.lastError = StorageErrorCode.INVALID_ARGUMENT;
      return false;
    }

    return this.executeSync(this.canDeleteSavedData(), () => {
      this.storage.delete(recordId);
    });
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

  private executeSync(canExecute: boolean, operation: () => void): boolean {
    this.lastError = undefined;
    if (!canExecute) {
      this.lastError = StorageErrorCode.PERMISSION_DENIED;
      return false;
    }

    try {
      operation();
      return true;
    } catch {
      this.lastError = StorageErrorCode.STORAGE_IO_ERROR;
      return false;
    }
  }

  private executeAsync(canExecute: boolean, operation: () => Promise<void>): Promise<boolean> {
    this.lastError = undefined;
    if (!canExecute) {
      this.lastError = StorageErrorCode.PERMISSION_DENIED;
      return Promise.resolve(false);
    }

    try {
      return operation()
        .then(() => true)
        .catch(() => {
          this.lastError = StorageErrorCode.STORAGE_IO_ERROR;
          return false;
        });
    } catch {
      this.lastError = StorageErrorCode.STORAGE_IO_ERROR;
      return Promise.resolve(false);
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
