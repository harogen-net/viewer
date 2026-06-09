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

export class DocumentStorageUseCase {
  private lastError: StorageErrorCode | undefined;

  constructor(
    private readonly storage: StorageAdapter,
    private readonly gate?: FeatureGate,
  ) {}

  getLastError(): StorageErrorCode | undefined {
    return this.lastError;
  }

  getLastErrorMessage(action: string): string {
    switch (this.lastError) {
      case StorageErrorCode.PERMISSION_DENIED:
        return action + " is not allowed in current mode.";
      case StorageErrorCode.INVALID_ARGUMENT:
        return action + " failed due to invalid selection.";
      case StorageErrorCode.STORAGE_IO_ERROR:
        return action + " failed due to storage I/O error.";
      case StorageErrorCode.UNSUPPORTED_VERSION:
        return "file version is not supported.";
      case StorageErrorCode.PARSE_ERROR:
        return "failed to parse file data.";
      case StorageErrorCode.MISSING_ASSET:
        return "file is missing required assets.";
      default:
        return action + " failed.";
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
    this.lastError = undefined;
    if (!this.canSave()) {
      this.lastError = StorageErrorCode.PERMISSION_DENIED;
      return false;
    }

    try {
      this.storage.save(doc, isOverride);
    } catch {
      this.lastError = StorageErrorCode.STORAGE_IO_ERROR;
      return false;
    }
    return true;
  }

  export(doc: ViewerDocument, type: HVDataType, options?: StorageExportOptions): boolean {
    this.lastError = undefined;
    if (!this.canExport()) {
      this.lastError = StorageErrorCode.PERMISSION_DENIED;
      return false;
    }

    try {
      this.storage.export(doc, type, options);
    } catch {
      this.lastError = StorageErrorCode.STORAGE_IO_ERROR;
      return false;
    }
    return true;
  }

  load(id: StorageInputId): boolean {
    this.lastError = undefined;
    const recordId = this.normalizeId(id);
    if (!recordId) {
      this.lastError = StorageErrorCode.INVALID_ARGUMENT;
      return false;
    }

    try {
      this.storage.load(recordId);
    } catch {
      this.lastError = StorageErrorCode.STORAGE_IO_ERROR;
      return false;
    }
    return true;
  }

  import(file: File): Promise<void> | undefined {
    this.lastError = undefined;
    if (!this.canImport()) {
      this.lastError = StorageErrorCode.PERMISSION_DENIED;
      return undefined;
    }

    try {
      return this.storage.import(file).catch(() => {
        this.lastError = StorageErrorCode.STORAGE_IO_ERROR;
      });
    } catch {
      this.lastError = StorageErrorCode.STORAGE_IO_ERROR;
      return undefined;
    }
  }

  delete(id: StorageInputId): boolean {
    this.lastError = undefined;
    if (!this.canDeleteSavedData()) {
      this.lastError = StorageErrorCode.PERMISSION_DENIED;
      return false;
    }

    const recordId = this.normalizeId(id);
    if (!recordId) {
      this.lastError = StorageErrorCode.INVALID_ARGUMENT;
      return false;
    }

    try {
      this.storage.delete(recordId);
    } catch {
      this.lastError = StorageErrorCode.STORAGE_IO_ERROR;
      return false;
    }
    return true;
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
}
