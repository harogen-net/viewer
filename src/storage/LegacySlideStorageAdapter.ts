import { ViewerDocument } from "../model/ViewerDocument";
import { HVDataType, SlideStorage, SlideTitle } from "../utils/SlideStorage";
import {
	StorageAdapter,
	StorageEventCallback,
	StorageEventType,
	StorageExportOptions,
	StorageRecordId,
} from "./StorageAdapter";

export class LegacySlideStorageAdapter implements StorageAdapter {
  private static instance: LegacySlideStorageAdapter;

  public static getInstance(): LegacySlideStorageAdapter {
    if (!LegacySlideStorageAdapter.instance) {
      LegacySlideStorageAdapter.instance = new LegacySlideStorageAdapter(SlideStorage.getInstance());
    }
    return LegacySlideStorageAdapter.instance;
  }

  private constructor(private readonly storage: SlideStorage) {}

  addEventListener(type: StorageEventType | string, callback: StorageEventCallback): void {
    this.storage.addEventListener(type, callback as EventListener);
  }

  removeEventListener(type: StorageEventType | string, callback: StorageEventCallback): void {
    this.storage.removeEventListener(type, callback as EventListener);
  }

  getTitles(): SlideTitle[] {
    return this.storage.titles;
  }

  save(doc: ViewerDocument, isOverride: boolean): void {
    this.storage.save(doc, isOverride);
  }

  export(doc: ViewerDocument, type: HVDataType, options?: StorageExportOptions): void {
    this.storage.export(doc, type, options);
  }

  load(id: StorageRecordId): void {
    this.storage.load(id);
  }

  async import(file: File): Promise<void> {
    await this.storage.import(file);
  }

  delete(id: StorageRecordId): void {
    this.storage.delete(id);
  }
}
