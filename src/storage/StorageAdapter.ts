import { ViewerDocument } from "../model/ViewerDocument";
import { HVDataType, SlideTitle } from "../utils/SlideStorage";

export enum StorageEventType {
  LOADING = "loading",
  LOADED = "loaded",
  UPDATE = "update",
}

export type StorageEventCallback = (event: Event) => void;

export interface StorageAdapter {
  addEventListener(type: StorageEventType | string, callback: StorageEventCallback): void;
  removeEventListener(type: StorageEventType | string, callback: StorageEventCallback): void;
  getTitles(): SlideTitle[];
  save(doc: ViewerDocument, isOverride: boolean): void;
  export(doc: ViewerDocument, type: HVDataType, options?: any): void;
  load(id: string): void;
  import(file: File): Promise<void>;
  delete(id: string): void;
}
