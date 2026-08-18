import { useAppLockStore } from "@/state/appLockStore";
import { useLaunchModeStore, LaunchMode } from "@/state/launchModeStore";
import { AppLockStatus } from "@/types/AppLock";
import "fake-indexeddb/auto";

// jsdom の HTMLImageElement.src は load イベントを発火しないため、
// テスト用に src setter をパッチして次マイクロタスクで load を発火する。
// これにより ImageManager.registImageData の Promise が解決可能になる。
// node 環境で走るテスト (@vitest-environment node) には HTMLImageElement が無いためガードする。
if (typeof HTMLImageElement !== "undefined") {
	const __imgSrcDesc = Object.getOwnPropertyDescriptor(HTMLImageElement.prototype, "src");
	Object.defineProperty(HTMLImageElement.prototype, "src", {
		configurable: true,
		enumerable: true,
		get() {
			return __imgSrcDesc?.get?.call(this) ?? "";
		},
		set(value: string) {
			__imgSrcDesc?.set?.call(this, value);
			queueMicrotask(() => {
				this.dispatchEvent(new Event("load"));
			});
		},
	});
}

// jsdom (25) には window.matchMedia が無い。Mantine の color-scheme 検出が
// requires。test 環境では light スキーム固定でよいので no-match を返す。
if (typeof window !== "undefined" && !window.matchMedia) {
	Object.defineProperty(window, "matchMedia", {
		configurable: true,
		value: (query: string) => ({
			matches: false,
			media: query,
			onchange: null,
			addListener: () => {},
			removeListener: () => {},
			addEventListener: () => {},
			removeEventListener: () => {},
			dispatchEvent: () => false,
		}),
	});
}
// jsdom には ResizeObserver も無い。Mantine ScrollArea で必須。no-op で polyfill。
if (typeof window !== "undefined" && typeof (window as unknown as { ResizeObserver?: unknown }).ResizeObserver === "undefined") {
	(window as unknown as { ResizeObserver: unknown }).ResizeObserver = class {
		observe(): void {}
		unobserve(): void {}
		disconnect(): void {}
	};
}
// この環境の jsdom の localStorage は setItem すら持たない空オブジェクト。実装側は try/catch で
// 握りつぶすので落ちはしないが、永続化を検証できない (appLock の設定など)。メモリ実装で補う。
if (
	typeof window !== "undefined" &&
	typeof (window.localStorage as unknown as { setItem?: unknown })?.setItem !== "function"
) {
	const map = new Map<string, string>();
	Object.defineProperty(window, "localStorage", {
		configurable: true,
		value: {
			getItem: (k: string) => (map.has(k) ? map.get(k) : null),
			setItem: (k: string, v: string) => {
				map.set(k, String(v));
			},
			removeItem: (k: string) => {
				map.delete(k);
			},
			clear: () => map.clear(),
			key: (i: number) => Array.from(map.keys())[i] ?? null,
			get length() {
				return map.size;
			},
		},
	});
}

// useFileIO.importFile が File.arrayBuffer() / File.text() を呼ぶため、test 環境
// でも本番と同じ経路で動作させるためのもの (jsdom 25 の Blob は両関数を持たない)。
if (typeof Blob !== "undefined" && typeof Blob.prototype.arrayBuffer !== "function") {
	Blob.prototype.arrayBuffer = function (this: Blob): Promise<ArrayBuffer> {
		return new Promise((resolve, reject) => {
			const reader = new FileReader();
			reader.onload = () => resolve(reader.result as ArrayBuffer);
			reader.onerror = () => reject(reader.error);
			reader.readAsArrayBuffer(this);
		});
	};
}
if (typeof Blob !== "undefined" && typeof Blob.prototype.text !== "function") {
	Blob.prototype.text = function (this: Blob): Promise<string> {
		return new Promise((resolve, reject) => {
			const reader = new FileReader();
			reader.onload = () => resolve(reader.result as string);
			reader.onerror = () => reject(reader.error);
			reader.readAsText(this);
		});
	};
}

// jsdom の innerHeight=768 は isMobileEnv() の SMALL_VIEWPORT_PX(900) 判定に引っかかり、
// launchModeStore の初期モードが VIEW になってしまう。テストは既定で PCモード想定
// (スマホモードを検証したいテストは自前で setState する) のため、setup で EDIT に上書き。
useLaunchModeStore.setState({ mode: LaunchMode.PC, isMobileEnv: false });

// アプリロックも既定で無効にしておく (jsdom の innerHeight=768 で isMobileEnv() が true に
// なるため、localStorage にレコードが残るケースで既存テストが巻き添えでロックされないように)。
useAppLockStore.setState({
	status: AppLockStatus.DISABLED,
	record: null,
	webauthnAvailable: false,
	failureCount: 0,
	busy: false,
	lastFailure: null,
	lockoutUntil: 0,
});

