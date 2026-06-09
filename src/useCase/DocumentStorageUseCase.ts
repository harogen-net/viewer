import { ViewerDocument } from "../model/ViewerDocument";
import { FeatureGate } from "../runtime/featureGate";
import {
  StorageAdapter,
  StorageEventCallback,
  StorageEventType,
  StorageExportOptions,
  StorageRecordId,
} from "../storage/StorageAdapter";
import { HVDataType, SlideTitle } from "../utils/SlideStorage";

type StorageInputId = string | number | string[] | null | undefined;

export class DocumentStorageUseCase {
  constructor(
    private readonly storage: StorageAdapter,
    private readonly gate?: FeatureGate,
  ) {}

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
    if (!this.canSave()) return false;
    this.storage.save(doc, isOverride);
    return true;
  }

  export(doc: ViewerDocument, type: HVDataType, options?: StorageExportOptions): boolean {
    if (!this.canExport()) return false;
    this.storage.export(doc, type, options);
    return true;
  }

  load(id: StorageInputId): boolean {
    const recordId = this.normalizeId(id);
    if (!recordId) return false;
    this.storage.load(recordId);
    return true;
  }

  import(file: File): Promise<void> | undefined {
    if (!this.canImport()) return undefined;
    return this.storage.import(file);
  }

  delete(id: StorageInputId): boolean {
    if (!this.canDeleteSavedData()) return false;
    const recordId = this.normalizeId(id);
    if (!recordId) return false;
    this.storage.delete(recordId);
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
