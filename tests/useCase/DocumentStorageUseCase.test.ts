import assert from "node:assert/strict";
import test from "node:test";

import { FeatureGate } from "../../src/runtime/featureGate";
import {
    createStorageOperationError,
    StorageAdapter,
    StorageErrorCode,
    StorageEventCallback,
    StorageEventType,
} from "../../src/storage/StorageAdapter";
import { HVDataType, SlideTitle } from "../../src/storage/storageTypes";
import {
    DocumentStorageUseCase,
    StorageAction,
} from "../../src/useCase/DocumentStorageUseCase";

class FakeStorageAdapter implements StorageAdapter {
	private listeners = new Map<string, Set<StorageEventCallback>>();
	private titles: SlideTitle[];

	public loadedIds: string[] = [];
	public deletedIds: string[] = [];
	public saveCalls = 0;
	public exportCalls = 0;
	public importCalls = 0;

	public onSave: () => Promise<void> = async () => {};
	public onExport: () => Promise<void> = async () => {};
	public onImport: () => Promise<void> = async () => {};
	public onLoad: () => void = () => {};
	public onDelete: () => void = () => {};

	constructor(titles: SlideTitle[] = []) {
		this.titles = titles;
	}

	addEventListener(type: StorageEventType | string, callback: StorageEventCallback): void {
		const key = type.toString();
		const set = this.listeners.get(key) ?? new Set<StorageEventCallback>();
		set.add(callback);
		this.listeners.set(key, set);
	}

	removeEventListener(type: StorageEventType | string, callback: StorageEventCallback): void {
		this.listeners.get(type.toString())?.delete(callback);
	}

	getTitles(): SlideTitle[] {
		return this.titles;
	}

	save(): Promise<void> {
		this.saveCalls += 1;
		return this.onSave();
	}

	export(): Promise<void> {
		this.exportCalls += 1;
		return this.onExport();
	}

	load(id: string): void {
		this.loadedIds.push(id);
		this.onLoad();
	}

	import(): Promise<void> {
		this.importCalls += 1;
		return this.onImport();
	}

	delete(id: string): void {
		this.deletedIds.push(id);
		this.onDelete();
	}

	emit(type: StorageEventType | string, detail?: unknown): void {
		const event = { detail } as unknown as Event;
		const callbacks = this.listeners.get(type.toString());
		if (!callbacks) return;
		for (const callback of callbacks) {
			callback(event);
		}
	}
}

const allowAllGate: FeatureGate = {
	canEdit: true,
	canSave: true,
	canExport: true,
	canImport: true,
	canDeleteSavedData: true,
};

test("loadResult normalizes id and waits for loaded event", async () => {
	const storage = new FakeStorageAdapter([{ id: 7, title: "sample", update: Date.now() }]);
	storage.onLoad = () => {
		storage.emit(StorageEventType.LOADED);
	};
	const useCase = new DocumentStorageUseCase(storage, allowAllGate);

	const result = await useCase.loadResult([" 7 "]);

	assert.deepEqual(result, { ok: true, action: StorageAction.LOAD });
	assert.equal(storage.loadedIds[0], "7");
});

test("deleteResult returns invalid argument for sentinel id", async () => {
	const storage = new FakeStorageAdapter([{ id: 1, title: "a", update: Date.now() }]);
	const useCase = new DocumentStorageUseCase(storage, allowAllGate);

	const result = await useCase.deleteResult("-1");

	assert.equal(result.ok, false);
	if (!result.ok) {
		assert.equal(result.action, StorageAction.DELETE);
		assert.equal(result.error, StorageErrorCode.INVALID_ARGUMENT);
	}
	assert.equal(storage.deletedIds.length, 0);
});

test("saveResult rejects with permission denied when gate disallows", async () => {
	const storage = new FakeStorageAdapter();
	const gate: FeatureGate = {
		...allowAllGate,
		canSave: false,
	};
	const useCase = new DocumentStorageUseCase(storage, gate);

	const result = await useCase.saveResult({} as never, false);

	assert.equal(result.ok, false);
	if (!result.ok) {
		assert.equal(result.action, StorageAction.SAVE);
		assert.equal(result.error, StorageErrorCode.PERMISSION_DENIED);
	}
	assert.equal(storage.saveCalls, 0);
});

test("importResult maps async operation error code", async () => {
	const storage = new FakeStorageAdapter();
	storage.onImport = () => {
		return Promise.reject(
			createStorageOperationError(StorageErrorCode.UNSUPPORTED_VERSION, "unsupported")
		);
	};
	const useCase = new DocumentStorageUseCase(storage, allowAllGate);

	const result = await useCase.importResult({} as File);

	assert.equal(result.ok, false);
	if (!result.ok) {
		assert.equal(result.action, StorageAction.IMPORT);
		assert.equal(result.error, StorageErrorCode.UNSUPPORTED_VERSION);
	}
	assert.equal(storage.importCalls, 1);
});

test("exportResult maps sync thrown SyntaxError", async () => {
	const storage = new FakeStorageAdapter();
	storage.onExport = () => {
		throw new SyntaxError("broken");
	};
	const useCase = new DocumentStorageUseCase(storage, allowAllGate);

	const result = await useCase.exportResult({} as never, HVDataType.HVD);

	assert.equal(result.ok, false);
	if (!result.ok) {
		assert.equal(result.action, StorageAction.EXPORT);
		assert.equal(result.error, StorageErrorCode.PARSE_ERROR);
	}
	assert.equal(storage.exportCalls, 1);
});

test("loadResult maps async error event detail code", async () => {
	const storage = new FakeStorageAdapter([{ id: 9, title: "err", update: Date.now() }]);
	storage.onLoad = () => {
		storage.emit(
			StorageEventType.ERROR,
			createStorageOperationError(StorageErrorCode.MISSING_ASSET, "missing")
		);
	};
	const useCase = new DocumentStorageUseCase(storage, allowAllGate);

	const result = await useCase.loadResult(9);

	assert.equal(result.ok, false);
	if (!result.ok) {
		assert.equal(result.action, StorageAction.LOAD);
		assert.equal(result.error, StorageErrorCode.MISSING_ASSET);
	}
	assert.equal(storage.loadedIds[0], "9");
});
