import type { ViewerDocument } from "../model/ViewerDocument";
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
	ERROR: "error",
} as const;

export type StorageEventType = (typeof StorageEventType)[keyof typeof StorageEventType];

export type StorageEventCallback = (event: Event) => void;

export type StorageOperationError = Error & { code: StorageErrorCode };

export function createStorageOperationError(
	code: StorageErrorCode,
	message: string
): StorageOperationError {
	const error = new Error(message) as StorageOperationError;
	error.code = code;
	return error;
}

export interface StorageAdapter {
	addEventListener(type: StorageEventType | string, callback: StorageEventCallback): void;
	removeEventListener(type: StorageEventType | string, callback: StorageEventCallback): void;
	getTitles(): SlideTitle[];
	save(doc: ViewerDocument, isOverride: boolean): Promise<void>;
	export(doc: ViewerDocument, type: HVDataType, options?: StorageExportOptions): Promise<void>;
	load(id: StorageRecordId): void;
	import(file: File): Promise<void>;
	delete(id: StorageRecordId): void;
}
