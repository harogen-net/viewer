import { LegacySlideStorageAdapter } from "./LegacySlideStorageAdapter";
import { StorageAdapter } from "./StorageAdapter";

export function createStorageAdapter(): StorageAdapter {
  return LegacySlideStorageAdapter.getInstance();
}
