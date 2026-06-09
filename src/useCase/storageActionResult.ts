import { StorageActionResult } from "./DocumentStorageUseCase";

export function isStorageActionFailure(
	result: StorageActionResult
): result is Extract<StorageActionResult, { ok: false }> {
	return result.ok === false;
}

export function isStorageActionSuccess(
	result: StorageActionResult
): result is Extract<StorageActionResult, { ok: true }> {
	return result.ok === true;
}
