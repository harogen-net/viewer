import { ViewerDocument } from "../model/ViewerDocument";
import { FeatureGate } from "../runtime/featureGate";
import { StorageAdapter, StorageEventCallback, StorageEventType } from "../storage/StorageAdapter";
import { HVDataType, SlideTitle } from "../utils/SlideStorage";

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

  export(doc: ViewerDocument, type: HVDataType, options?: any): boolean {
    if (!this.canExport()) return false;
    this.storage.export(doc, type, options);
    return true;
  }

  load(id: string): void {
    this.storage.load(id);
  }

  import(file: File): Promise<void> | undefined {
    if (!this.canImport()) return undefined;
    return this.storage.import(file);
  }

  delete(id: string): boolean {
    if (!this.canDeleteSavedData()) return false;
    this.storage.delete(id);
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
}
