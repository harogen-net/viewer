import { ViewerDocument } from "../model/ViewerDocument";
import { HVDataType, SlideTitle } from "./storageTypes";

export type StorageRecordId = string;

export type StorageExportOptions = {
	pages?: number[];
};

export const StorageErrorCode = {
	UNSUPPORTED_VERSION: "UNSUPPORTED_VERSION",
	PARSE_ERROR: "PARSE_ERROR",
	MISSING_ASSET: "MISSING_ASSET",
	STORAGE_IO_ERROR: "STORAGE_IO_ERROR",
	PERMISSION_DENIED: "PERMISSION_DENIED",
	INVALID_ARGUMENT: "INVALID_ARGUMENT",
} as const;

export type StorageErrorCode = (typeof StorageErrorCode)[keyof typeof StorageErrorCode];

export const StorageEventType = {
	LOADING: "loading",
	LOADED: "loaded",
	UPDATE: "update",
} as const;

export type StorageEventType = (typeof StorageEventType)[keyof typeof StorageEventType];

export type StorageEventCallback = (event: Event) => void;

export interface StorageAdapter {
	addEventListener(type: StorageEventType | string, callback: StorageEventCallback): void;
	removeEventListener(type: StorageEventType | string, callback: StorageEventCallback): void;
	getTitles(): SlideTitle[];
	save(doc: ViewerDocument, isOverride: boolean): void;
	export(doc: ViewerDocument, type: HVDataType, options?: StorageExportOptions): void;
	load(id: StorageRecordId): void;
	import(file: File): Promise<void>;
	delete(id: StorageRecordId): void;
}
